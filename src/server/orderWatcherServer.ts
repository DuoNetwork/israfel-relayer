import {
	ExchangeContractErrs,
	OrderState,
	OrderStateInvalid,
	OrderStateValid,
	OrderWatcher
} from '0x.js';
import SequenceClient from '../client/SequenceClient';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOption,
	IOrderQueueItem,
	IOrderUpdate,
	IRawOrder,
	ISequenceCacheItem,
	IStringSignedOrder,
	IWsOrderSequenceResponse
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderUtil from '../utils/orderUtil';
import redisUtil from '../utils/redisUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class OrderWatcherServer extends SequenceClient {
	public sequenceMethods = [CST.DB_UPDATE, CST.DB_EXPIRE];
	public orderWatcher: OrderWatcher | null = null;
	public web3Util: Web3Util | null = null;
	public watchingOrders: string[] = [];

	public handleTimeout(cacheKey: string) {
		util.logError(cacheKey);
		return;
	}

	public async handleSequenceResponse(
		res: IWsOrderSequenceResponse,
		cacheKey: string,
		cacheItem: ISequenceCacheItem
	) {
		util.logDebug(cacheKey);
		clearTimeout(cacheItem.timeout);
		cacheItem.liveOrder.currentSequence = res.sequence;
		const orderQueueItem: IOrderQueueItem = {
			liveOrder: cacheItem.liveOrder
		};

		try {
			const userOrder = await orderUtil.persistOrder(res.method, orderQueueItem);
			if (!userOrder) {
				util.logInfo(`invalid orderHash ${res.orderHash}, ignore`);
				this.removeFromWatch(res.orderHash);
				return;
			}
		} catch (error) {
			// failed to persist, add back to cache for next retry
			cacheItem.timeout = setTimeout(() => this.handleTimeout(cacheKey), 30000);
			this.requestCache[cacheKey] = cacheItem;
			this.requestSequence(res.method, res.pair, cacheItem.liveOrder.orderHash);
		}
	}

	public async handleOrderWatcherUpdate(pair: string, orderState: OrderState) {
		if (!this.sequenceWsClient) {
			util.logError('sequence service is unavailable');
			return;
		}

		const liveOrder = await orderUtil.getLiveOrderInPersistence(pair, orderState.orderHash);
		if (!liveOrder) {
			util.logInfo(`invalid orderHash ${orderState.orderHash}, ignore`);
			this.removeFromWatch(orderState.orderHash);
			return;
		}

		let method = CST.DB_UPDATE;
		if (orderState.isValid) {
			const remainingAmount = Web3Util.fromWei(
				(orderState as OrderStateValid).orderRelevantState.remainingFillableMakerAssetAmount
			);
			liveOrder.amount = remainingAmount;
		} else {
			const error = (orderState as OrderStateInvalid).error;
			switch (error) {
				case ExchangeContractErrs.OrderCancelExpired:
				case ExchangeContractErrs.OrderFillExpired:
					method = CST.DB_EXPIRE;
					break;
				case ExchangeContractErrs.OrderCancelled:
					method = CST.DB_CANCEL;
					break;
				case ExchangeContractErrs.OrderRemainingFillAmountZero:
					method = CST.DB_FILL;
					break;
				default:
					break;
			}
		}
		const cacheKey = `${method}|${pair}|${orderState.orderHash}`;
		this.requestCache[cacheKey] = {
			pair: pair,
			method: method,
			liveOrder: liveOrder,
			timeout: setTimeout(() => this.handleTimeout(cacheKey), 30000)
		};
		util.logDebug('request added to cache');
		this.requestSequence(method, pair, orderState.orderHash);
	}

	public async addIntoWatch(orderHash: string, signedOrder?: IStringSignedOrder) {
		try {
			if (!signedOrder) {
				const rawOrder: IRawOrder | null = await dynamoUtil.getRawOrder(orderHash);
				if (!rawOrder) {
					util.logDebug('no signed order specified, failed to add');
					return;
				}
				signedOrder = rawOrder.signedOrder as IStringSignedOrder;
			}
			if (this.orderWatcher) {
				await this.orderWatcher.addOrderAsync(orderUtil.parseSignedOrder(signedOrder));
				util.logDebug('succsfully added ' + orderHash);
			}
		} catch (e) {
			util.logDebug('failed to add ' + orderHash + 'error is ' + e);
			this.watchingOrders = this.watchingOrders.filter(hash => hash !== orderHash);
		}
	}

	public async removeFromWatch(orderHash: string) {
		if (!this.watchingOrders.includes(orderHash)) {
			util.logDebug('order is not currently watched');
			return;
		}
		try {
			if (this.orderWatcher) {
				await this.orderWatcher.removeOrder(orderHash);
				util.logDebug('succsfully removed ' + orderHash);
				this.watchingOrders = this.watchingOrders.filter(hash => hash !== orderHash);
			}
		} catch (e) {
			util.logDebug('failed to remove ' + orderHash + 'error is ' + e);
		}
	}

	public async coldStart(pair: string) {
		util.logInfo('start order watcher for ' + pair);
		if (!this.orderWatcher) {
			util.logDebug('orderWatcher is not initiated');
			return;
		}
		const ordersInCache = await redisUtil.hashGetAll(CST.DB_CACHE);
		if (Object.keys(ordersInCache).length) {
			util.logInfo('orders length in DB is ' + Object.keys(ordersInCache).length);
			for (const cacheKey of Object.keys(ordersInCache)) {
				const [method, orderHash] = cacheKey.split('|');
				if (method !== CST.DB_CANCEL && !this.watchingOrders.includes(orderHash)) {
					this.watchingOrders.push(orderHash);
					await this.addIntoWatch(orderHash);
				}
			}
		}

		const liveOrders: ILiveOrder[] = await dynamoUtil.getLiveOrders(pair);
		if (liveOrders.length) {
			util.logInfo('orders length in DB is ' + liveOrders.length);
			for (const order of liveOrders)
				if (!this.watchingOrders.includes(order.orderHash)) {
					this.watchingOrders.push(order.orderHash);
					await this.addIntoWatch(order.orderHash);
				}
		}
	}

	public handleOrderUpdate = (channel: string, orderUpdate: IOrderUpdate) => {
		util.logInfo('receive update from channel: ' + channel);
		const method = orderUpdate.method;
		switch (method) {
			case CST.DB_ADD:
				this.addIntoWatch(orderUpdate.liveOrder.orderHash, orderUpdate.signedOrder);
				break;
			case CST.DB_CANCEL:
				break;
			default:
				break;
		}
	};

	public async startOrderWatcher(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		await this.connectToSequenceServer(option.server);
		this.orderWatcher = new OrderWatcher(
			this.web3Util.web3Wrapper.getProvider(),
			option.live ? CST.NETWORK_ID_MAIN : CST.NETWORK_ID_KOVAN
		);
		const pair = option.token + '-' + CST.TOKEN_WETH;

		redisUtil.onOrderUpdate((channel, orderUpdate) =>
			this.handleOrderUpdate(channel, orderUpdate)
		);

		await this.coldStart(pair);
		setInterval(() => this.coldStart(pair), CST.ONE_MINUTE_MS * 60);

		if (option.server) {
			dynamoUtil.updateStatus(pair);
			setInterval(() => dynamoUtil.updateStatus(pair, this.watchingOrders.length), 10000);
		}

		this.orderWatcher.subscribe(async (err, orderState) => {
			if (err || !orderState) {
				util.logError(err ? err : 'orderState empty');
				return;
			}

			this.handleOrderWatcherUpdate(pair, orderState);
		});
	}
}

const orderWatcherServer = new OrderWatcherServer();
export default orderWatcherServer;
