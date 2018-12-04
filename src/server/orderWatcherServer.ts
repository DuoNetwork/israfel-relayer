import {
	ExchangeContractErrs,
	OrderState,
	OrderStateInvalid,
	OrderStateValid,
	OrderWatcher,
	SignedOrder
} from '0x.js';
import * as CST from '../common/constants';
import {
	IOption,
	IOrderPersistRequest,
	IOrderQueueItem,
	IRawOrder,
	IStringSignedOrder,
	IToken
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import orderUtil from '../utils/orderUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class OrderWatcherServer {
	public token: IToken | undefined = undefined;
	public pair: string = 'pair';
	public orderWatcher: OrderWatcher | null = null;
	public web3Util: Web3Util | null = null;
	public watchingOrders: { [orderHash: string]: SignedOrder } = {};

	public async updateOrder(orderPersistRequest: IOrderPersistRequest) {
		let userOrder = null;
		let done = false;
		while (!done)
			try {
				userOrder = await orderPersistenceUtil.persistOrder(orderPersistRequest);
				done = true;
			} catch (error) {
				await util.sleep(2000);
			}

		if (!userOrder) {
			util.logInfo(`invalid orderHash ${orderPersistRequest.orderHash}, ignore`);
			this.removeFromWatch(orderPersistRequest.orderHash);
		}
	}

	public handleOrderWatcherUpdate(orderState: OrderState) {
		if (!this.web3Util || !this.watchingOrders[orderState.orderHash]) {
			util.logDebug(orderState.orderHash + ' not in cache, ignored');
			return;
		}
		const stringSignedOrder: IStringSignedOrder = JSON.parse(
			JSON.stringify(this.watchingOrders[orderState.orderHash])
		);
		const orderPersistRequest: IOrderPersistRequest = {
			method: CST.DB_UPDATE,
			status: CST.DB_UPDATE,
			requestor: CST.DB_ORDER_WATCHER,
			pair: this.pair,
			orderHash: orderState.orderHash,
			balance: -1
		};
		util.logDebug(JSON.stringify(orderState));
		if (orderState.isValid) {
			const token = this.token as IToken;
			const isBid = Web3Util.getSideFromSignedOrder(stringSignedOrder, token) === CST.DB_BID;
			const {
				remainingFillableTakerAssetAmount,
				remainingFillableMakerAssetAmount,
				filledTakerAssetAmount
			} = (orderState as OrderStateValid).orderRelevantState;
			const remainingTokenAfterFee = Web3Util.fromWei(
				isBid ? remainingFillableTakerAssetAmount : remainingFillableMakerAssetAmount
			);
			const remainingBaseAfterFee = Web3Util.fromWei(
				isBid ? remainingFillableMakerAssetAmount : remainingFillableTakerAssetAmount
			);

			const feeSchedule = token.feeSchedules[CST.TOKEN_WETH];
			const remainingPriceBeforeFee = orderUtil.getPriceBeforeFee(
				remainingTokenAfterFee,
				remainingBaseAfterFee,
				feeSchedule,
				isBid
			);
			orderPersistRequest.balance = remainingPriceBeforeFee.amount;
			const fill = Web3Util.fromWei(filledTakerAssetAmount);
			if (fill) {
				orderPersistRequest.fill = orderUtil.getFillBeforeFee(
					stringSignedOrder,
					fill,
					token,
					this.pair
				);

				orderPersistRequest.status = CST.DB_PFILL;
			}
		} else {
			const error = (orderState as OrderStateInvalid).error;
			switch (error) {
				case ExchangeContractErrs.OrderFillExpired:
				case ExchangeContractErrs.OrderCancelled:
					orderPersistRequest.method = CST.DB_TERMINATE;
					orderPersistRequest.status = CST.DB_TERMINATE;
					break;
				case ExchangeContractErrs.OrderFillRoundingError:
				case ExchangeContractErrs.OrderRemainingFillAmountZero:
					orderPersistRequest.balance = 0;
					orderPersistRequest.method = CST.DB_TERMINATE;
					orderPersistRequest.status = CST.DB_FILL;
					break;
				case ExchangeContractErrs.InsufficientTakerBalance:
				case ExchangeContractErrs.InsufficientTakerAllowance:
				case ExchangeContractErrs.InsufficientTakerFeeBalance:
				case ExchangeContractErrs.InsufficientTakerFeeAllowance:
				case ExchangeContractErrs.InsufficientMakerFeeBalance:
				case ExchangeContractErrs.InsufficientMakerFeeAllowance:
					return;
				case ExchangeContractErrs.InsufficientMakerBalance:
				case ExchangeContractErrs.InsufficientMakerAllowance:
					orderPersistRequest.balance = 0;
					break;
				default:
					return;
			}
		}

		return this.updateOrder(orderPersistRequest);
	}

	public async addIntoWatch(orderHash: string, signedOrder?: IStringSignedOrder) {
		try {
			if (this.orderWatcher && this.web3Util && !this.watchingOrders[orderHash]) {
				if (!signedOrder) {
					const rawOrder: IRawOrder | null = await dynamoUtil.getRawOrder(orderHash);
					if (!rawOrder) {
						util.logDebug('no signed order specified, failed to add');
						return;
					}
					signedOrder = rawOrder.signedOrder as IStringSignedOrder;
				}
				const rawSignedOrder: SignedOrder = orderUtil.parseSignedOrder(signedOrder);

				if (!(await this.web3Util.validateOrderFillable(rawSignedOrder))) {
					util.logDebug(orderHash + ' not fillable, send update');
					await this.updateOrder({
						method: CST.DB_UPDATE,
						status: CST.DB_UPDATE,
						requestor: CST.DB_ORDER_WATCHER,
						pair: this.pair,
						orderHash: orderHash,
						balance: 0
					});
				}

				await this.orderWatcher.addOrderAsync(rawSignedOrder);
				this.watchingOrders[orderHash] = rawSignedOrder;
				util.logDebug('successfully added ' + orderHash);
			}
		} catch (e) {
			util.logDebug('failed to add ' + orderHash + 'error is ' + e);
		}
	}

	public removeFromWatch(orderHash: string) {
		if (!this.watchingOrders[orderHash]) {
			util.logDebug('order is not currently watched');
			return;
		}
		try {
			if (this.orderWatcher && this.watchingOrders[orderHash]) {
				this.orderWatcher.removeOrder(orderHash);
				delete this.watchingOrders[orderHash];
				util.logDebug('successfully removed ' + orderHash);
			}
		} catch (e) {
			util.logDebug('failed to remove ' + orderHash + 'error is ' + e);
		}
	}

	public handleOrderUpdate(channel: string, orderQueueItem: IOrderQueueItem) {
		util.logDebug('receive update from channel: ' + channel);
		if (orderQueueItem.requestor === CST.DB_ORDER_WATCHER) {
			util.logDebug('ignore order update requested by self');
			return;
		}

		const method = orderQueueItem.method;
		switch (method) {
			case CST.DB_ADD:
				this.addIntoWatch(orderQueueItem.liveOrder.orderHash, orderQueueItem.signedOrder);
				break;
			case CST.DB_TERMINATE:
				this.removeFromWatch(orderQueueItem.liveOrder.orderHash);
				break;
			default:
				util.logDebug('neither add nor terminate, ignore this update');
				break;
		}
	}

	public async loadOrders() {
		const prevOrderHashes = Object.keys(this.watchingOrders);

		const currentOrdersOrderHash = Object.keys(
			await orderPersistenceUtil.getAllLiveOrdersInPersistence(this.pair)
		);
		util.logInfo('loaded live orders : ' + Object.keys(currentOrdersOrderHash).length);
		const ordersToRemove = prevOrderHashes.filter(
			orderHash => !currentOrdersOrderHash.includes(orderHash)
		);
		for (const orderHash of ordersToRemove) await this.removeFromWatch(orderHash);
		for (const orderHash of currentOrdersOrderHash) await this.addIntoWatch(orderHash);
		util.logInfo('added live orders into watch');
	}

	public async startServer(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		this.orderWatcher = new OrderWatcher(
			this.web3Util.getProvider(),
			option.live ? CST.NETWORK_ID_MAIN : CST.NETWORK_ID_KOVAN,
			undefined,
			{
				cleanupJobIntervalMs: 30000,
				expirationMarginMs: 3 * CST.ONE_MINUTE_MS
			}
		);
		this.pair = option.token + '|' + CST.TOKEN_WETH;
		this.token = this.web3Util.getTokenByCode(option.token);

		orderPersistenceUtil.subscribeOrderUpdate(this.pair, (channel, orderQueueItem) =>
			this.handleOrderUpdate(channel, orderQueueItem)
		);

		await this.loadOrders();
		setInterval(() => this.loadOrders(), CST.ONE_MINUTE_MS * 60);

		this.orderWatcher.subscribe(async (err, orderState) => {
			if (err || !orderState) {
				util.logError(err ? err : 'orderState empty');
				return;
			}

			this.handleOrderWatcherUpdate(orderState);
		});

		if (option.server) {
			dynamoUtil.updateStatus(this.pair);
			setInterval(
				() =>
					dynamoUtil.updateStatus(
						this.pair,
						this.orderWatcher ? this.orderWatcher.getStats().orderCount : 0
					),
				10000
			);
		}
	}
}

const orderWatcherServer = new OrderWatcherServer();
export default orderWatcherServer;

// // check expiring
// const currentTime = moment().valueOf();
// if (rightLiveOrder.expiry - currentTime < 3 * 60 * 1000) {
// 	util.logDebug(
// 		`the order ${
// 			rightLiveOrder.orderHash
// 		} is expiring in 3 minutes, removing this order`
// 	);
// 	obj.right.newBalance = 0;
// 	obj.right.method = CST.DB_TERMINATE;
// 	shouldReturn = true;
// }
// if (leftLiveOrder.expiry - currentTime < 3 * 60 * 1000) {
// 	util.logDebug(
// 		`the order ${leftLiveOrder.orderHash} is expiring in 3 minutes, removing this order`
// 	);
// 	obj.left.newBalance = 0;
// 	obj.left.method = CST.DB_TERMINATE;
// 	shouldReturn = true;
// }
// if (shouldReturn) return obj;
