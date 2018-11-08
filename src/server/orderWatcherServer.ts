import {
	ExchangeContractErrs,
	OrderState,
	OrderStateInvalid,
	OrderStateValid,
	OrderWatcher,
	SignedOrder
} from '0x.js';
import * as CST from '../common/constants';
import { IOption, IOrderPersistRequest, IRawOrder, IStringSignedOrder } from '../common/types';
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
		const orderPersistRequest: IOrderPersistRequest = {
			method: CST.DB_UPDATE,
			pair: pair,
			orderHash: orderState.orderHash,
			amount: -1
		};
		util.logDebug(JSON.stringify(orderState));
		if (orderState.isValid) {
			const remainingAmount = Web3Util.fromWei(
				(orderState as OrderStateValid).orderRelevantState.remainingFillableMakerAssetAmount
			);
			orderPersistRequest.amount = remainingAmount;
		} else {
			const error = (orderState as OrderStateInvalid).error;
			switch (error) {
				case ExchangeContractErrs.OrderCancelExpired:
				case ExchangeContractErrs.OrderFillExpired:
				case ExchangeContractErrs.OrderCancelled:
					orderPersistRequest.method = CST.DB_TERMINATE;
					break;
				case ExchangeContractErrs.OrderRemainingFillAmountZero:
					orderPersistRequest.amount = 0;
					orderPersistRequest.method = CST.DB_TERMINATE;
					break;
				default:
					return;
			}
		}

		let userOrder = null;
		let done = false;
		while (!done)
			try {
				userOrder = await orderPersistenceUtil.persistOrder(orderPersistRequest, false);
				done = true;
			} catch (error) {
				await util.sleep(2000);
			}

		if (!userOrder) {
			util.logInfo(`invalid orderHash ${orderPersistRequest.orderHash}, ignore`);
			this.removeFromWatch(orderPersistRequest.orderHash);
		}
	}

	public async addIntoWatch(orderHash: string, signedOrder?: IStringSignedOrder) {
		try {
			if (this.orderWatcher && this.web3Util && !this.watchingOrders.includes(orderHash)) {
				if (!signedOrder) {
					const rawOrder: IRawOrder | null = await dynamoUtil.getRawOrder(orderHash);
					if (!rawOrder) {
						util.logDebug('no signed order specified, failed to add');
						return;
					}
					signedOrder = rawOrder.signedOrder as IStringSignedOrder;
				}
				const rawSignedOrder: SignedOrder = orderPersistenceUtil.parseSignedOrder(
					signedOrder
				);

				util.logDebug('start validation for order ' + orderHash);
				const res = await this.web3Util.validateOrderFillable(rawSignedOrder);
				if (!res) {
					util.logDebug('failed to pass validation ' + orderHash);
					return;
				}

				await this.orderWatcher.addOrderAsync(rawSignedOrder);
				this.watchingOrders.push(orderHash);
				util.logDebug('successfully added ' + orderHash);
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
			if (this.orderWatcher && this.watchingOrders.includes(orderHash)) {
				this.orderWatcher.removeOrder(orderHash);
				util.logDebug('successfully removed ' + orderHash);
				this.watchingOrders = this.watchingOrders.filter(hash => hash !== orderHash);
			}
		} catch (e) {
			util.logDebug('failed to remove ' + orderHash + 'error is ' + e);
		}
	}

	public handleOrderUpdate = (channel: string, orderPersistRequest: IOrderPersistRequest) => {
		util.logDebug('receive update from channel: ' + channel);
		const method = orderPersistRequest.method;
		switch (method) {
			case CST.DB_ADD:
				this.addIntoWatch(orderPersistRequest.orderHash, orderPersistRequest.signedOrder);
				break;
			case CST.DB_TERMINATE:
				this.removeFromWatch(orderPersistRequest.orderHash);
				break;
			default:
				break;
		}
	};

	public async startOrderWatcher(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		const provider = this.web3Util.web3Wrapper.getProvider();
		// util.logInfo('using provider ' + )
		// console.log(provider);
		this.orderWatcher = new OrderWatcher(
			provider,
			option.live ? CST.NETWORK_ID_MAIN : CST.NETWORK_ID_KOVAN
		);
		const pair = option.token + '-' + CST.TOKEN_WETH;

		redisUtil.onOrderUpdate((channel, orderPersistRequest) =>
			this.handleOrderUpdate(channel, orderPersistRequest)
		);

		redisUtil.subscribe(`${CST.DB_ORDERS}|${CST.DB_PUBSUB}|${pair}`);

		const allOrders = await orderPersistenceUtil.getAllLiveOrdersInPersistence(pair);
		util.logInfo('loaded live orders : ' + Object.keys(allOrders).length);
		for (const orderHash in allOrders) await this.addIntoWatch(orderHash);
		util.logInfo('added live orders into watch');
		setInterval(async () => {
			const oldOrders = this.watchingOrders;

			const currentOrdersOrderHash = Object.keys(
				await orderPersistenceUtil.getAllLiveOrdersInPersistence(pair)
			);
			util.logInfo('loaded live orders');
			const ordersToRemove = oldOrders.filter(
				orderHash => !currentOrdersOrderHash.includes(orderHash)
			);
			for (const orderHash of ordersToRemove) await this.removeFromWatch(orderHash);
			for (const orderHash of currentOrdersOrderHash) await this.addIntoWatch(orderHash);
		}, CST.ONE_MINUTE_MS * 60);

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
