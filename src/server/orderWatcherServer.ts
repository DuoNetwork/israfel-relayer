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
	ILiveOrder,
	IOption,
	IOrderPersistRequest,
	IOrderQueueItem,
	IRawOrder,
	IStringSignedOrder
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import orderUtil from '../utils/orderUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class OrderWatcherServer {
	public pair: string = 'pair';
	public orderWatcher: OrderWatcher | null = null;
	public web3Util: Web3Util | null = null;
	public watchingOrders: {
		[orderHash: string]: {
			liveOrder: ILiveOrder;
			signedOrder: SignedOrder;
		};
	} = {};

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
		const orderHash = orderState.orderHash;
		if (!this.watchingOrders[orderHash]) {
			util.logDebug(orderHash + ' not in cache, ignored');
			return;
		}
		const liveOrder = this.watchingOrders[orderHash].liveOrder;
		const signedOrder = this.watchingOrders[orderHash].signedOrder;
		const orderPersistRequest: IOrderPersistRequest = {
			method: CST.DB_TERMINATE,
			status: CST.DB_TERMINATE,
			requestor: CST.DB_ORDER_WATCHER,
			pair: this.pair,
			orderHash: orderHash
		};
		util.logDebug(JSON.stringify(orderState));
		if (orderState.isValid) {
			const {
				remainingFillableTakerAssetAmount,
				filledTakerAssetAmount
			} = (orderState as OrderStateValid).orderRelevantState;
			if (
				remainingFillableTakerAssetAmount
					.add(filledTakerAssetAmount)
					.lessThan(signedOrder.takerAssetAmount)
			)
				orderPersistRequest.status = CST.DB_BALANCE;
			else if (Web3Util.fromWei(filledTakerAssetAmount)) {
				orderPersistRequest.balance =
					liveOrder.amount *
					Number(
						remainingFillableTakerAssetAmount
							.div(signedOrder.takerAssetAmount)
							.valueOf()
					);
				orderPersistRequest.method = CST.DB_UPDATE;
				orderPersistRequest.status = CST.DB_PFILL;
			} else return;
		} else {
			const error = (orderState as OrderStateInvalid).error;
			switch (error) {
				case ExchangeContractErrs.OrderFillRoundingError:
				case ExchangeContractErrs.OrderRemainingFillAmountZero:
					orderPersistRequest.status = CST.DB_FILL;
					break;
				case ExchangeContractErrs.InsufficientMakerBalance:
				case ExchangeContractErrs.InsufficientMakerAllowance:
					orderPersistRequest.status = CST.DB_BALANCE;
					break;
				case ExchangeContractErrs.OrderFillExpired:
				case ExchangeContractErrs.OrderCancelled:
					// orderPersistRequest.status = CST.DB_TERMINATE;
					break;
				default:
					return;
			}
		}

		if (orderPersistRequest.method === CST.DB_TERMINATE) this.removeFromWatch(orderHash);

		return this.updateOrder(orderPersistRequest);
	}

	public async addIntoWatch(liveOrder: ILiveOrder, signedOrder?: IStringSignedOrder) {
		const orderHash = liveOrder.orderHash;
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
				this.watchingOrders[orderHash] = {
					liveOrder: liveOrder,
					signedOrder: rawSignedOrder
				};
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
				this.addIntoWatch(orderQueueItem.liveOrder, orderQueueItem.signedOrder);
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

		const currentLiveOrders = await orderPersistenceUtil.getAllLiveOrdersInPersistence(
			this.pair
		);
		const currentOrdersOrderHash = Object.keys(currentLiveOrders);
		util.logInfo('loaded live orders : ' + Object.keys(currentOrdersOrderHash).length);
		const ordersToRemove = prevOrderHashes.filter(
			orderHash => !currentOrdersOrderHash.includes(orderHash)
		);
		for (const orderHash of ordersToRemove) await this.removeFromWatch(orderHash);
		for (const orderHash of currentOrdersOrderHash)
			await this.addIntoWatch(currentLiveOrders[orderHash]);
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
