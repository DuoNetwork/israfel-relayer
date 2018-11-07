import {
	ExchangeContractErrs,
	OrderState,
	OrderStateInvalid,
	OrderStateValid,
	OrderWatcher
} from '0x.js';
import * as CST from '../common/constants';
import { IOption, IOrderQueueItem, IRawOrder, IStringSignedOrder } from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import redisUtil from '../utils/redisUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class OrderWatcherServer {
	public orderWatcher: OrderWatcher | null = null;
	public web3Util: Web3Util | null = null;
	public watchingOrders: string[] = [];

	public async handleOrderWatcherUpdate(pair: string, orderState: OrderState) {
		const orderHash = orderState.orderHash;
		const liveOrder = await orderPersistenceUtil.getLiveOrderInPersistence(pair, orderHash);
		if (!liveOrder) {
			util.logInfo(`invalid orderHash ${orderHash}, ignore`);
			this.removeFromWatch(orderHash);
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
				case ExchangeContractErrs.OrderCancelled:
					method = CST.DB_TERMINATE;
					break;
				case ExchangeContractErrs.OrderRemainingFillAmountZero:
					liveOrder.amount = 0;
					method = CST.DB_TERMINATE;
					break;
				default:
					break;
			}
		}

		let userOrder = null;
		let done = false;
		while (!done)
			try {
				userOrder = await orderPersistenceUtil.persistOrder(
					{
						method: method,
						liveOrder: liveOrder
					},
					false
				);
				done = true;
			} catch (error) {
				await util.sleep(2000);
			}

		if (!userOrder) {
			util.logInfo(`invalid orderHash ${orderHash}, ignore`);
			this.removeFromWatch(orderHash);
		}
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
				await this.orderWatcher.addOrderAsync(
					orderPersistenceUtil.parseSignedOrder(signedOrder)
				);
				util.logDebug('succsfully added ' + orderHash);
			}
		} catch (e) {
			util.logDebug('failed to add ' + orderHash + 'error is ' + e);
			this.watchingOrders = this.watchingOrders.filter(hash => hash !== orderHash);
		}
	}

	public removeFromWatch(orderHash: string) {
		if (!this.watchingOrders.includes(orderHash)) {
			util.logDebug('order is not currently watched');
			return;
		}
		try {
			if (this.orderWatcher) {
				this.orderWatcher.removeOrder(orderHash);
				util.logDebug('succsfully removed ' + orderHash);
				this.watchingOrders = this.watchingOrders.filter(hash => hash !== orderHash);
			}
		} catch (e) {
			util.logDebug('failed to remove ' + orderHash + 'error is ' + e);
		}
	}

	public async reloadLiveOrders(pair: string) {
		util.logInfo('reload orders to watch for ' + pair);
		if (!this.orderWatcher) {
			util.logDebug('orderWatcher is not initiated');
			return;
		}

		const allOrders = orderPersistenceUtil.getAllLiveOrdersInPersistence(pair);
		for (const orderHash in allOrders)
			if (!this.watchingOrders.includes(orderHash)) {
				this.watchingOrders.push(orderHash);
				await this.addIntoWatch(orderHash);
			}
	}

	public handleOrderUpdate = (channel: string, orderQueueItem: IOrderQueueItem) => {
		util.logInfo('receive update from channel: ' + channel);
		const method = orderQueueItem.method;
		switch (method) {
			case CST.DB_ADD:
				this.addIntoWatch(orderQueueItem.liveOrder.orderHash, orderQueueItem.signedOrder);
				break;
			case CST.DB_TERMINATE:
				this.removeFromWatch(orderQueueItem.liveOrder.orderHash);
				break;
			default:
				break;
		}
	};

	public async startOrderWatcher(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		this.orderWatcher = new OrderWatcher(
			this.web3Util.web3Wrapper.getProvider(),
			option.live ? CST.NETWORK_ID_MAIN : CST.NETWORK_ID_KOVAN
		);
		const pair = option.token + '-' + CST.TOKEN_WETH;

		redisUtil.onOrderUpdate((channel, orderUpdate) =>
			this.handleOrderUpdate(channel, orderUpdate)
		);

		await this.reloadLiveOrders(pair);
		setInterval(() => this.reloadLiveOrders(pair), CST.ONE_MINUTE_MS * 60);

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
