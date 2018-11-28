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
			const isBid =
				Web3Util.getSideFromSignedOrder(stringSignedOrder, this.token as IToken) ===
				CST.DB_BID;
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

			const fee = (this.token as IToken).fee[CST.TOKEN_WETH];
			const remainingPriceBeforeFee = orderUtil.getPriceBeforeFee(
				remainingTokenAfterFee,
				remainingBaseAfterFee,
				fee,
				isBid
			);
			orderPersistRequest.balance = remainingPriceBeforeFee.amount;
			const fill = Web3Util.fromWei(filledTakerAssetAmount);
			if (fill) {
				orderPersistRequest.fill = orderUtil.getFillBeforeFee(
					stringSignedOrder,
					fill,
					this.token as IToken,
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

	public handleOrderUpdate = (channel: string, orderQueueItem: IOrderQueueItem) => {
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
	};

	public async startServer(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		const provider = this.web3Util.web3Wrapper.getProvider();
		this.orderWatcher = new OrderWatcher(
			provider,
			option.live ? CST.NETWORK_ID_MAIN : CST.NETWORK_ID_KOVAN,
			undefined,
			{
				cleanupJobIntervalMs: 30000
			}
		);
		this.pair = option.token + '|' + CST.TOKEN_WETH;
		this.token = this.web3Util.tokens.find(t => t.code === option.token);

		orderPersistenceUtil.subscribeOrderUpdate(this.pair, (channel, orderQueueItem) =>
			this.handleOrderUpdate(channel, orderQueueItem)
		);

		const allOrders = await orderPersistenceUtil.getAllLiveOrdersInPersistence(this.pair);
		util.logInfo('loaded live orders : ' + Object.keys(allOrders).length);
		for (const orderHash in allOrders) await this.addIntoWatch(orderHash);
		util.logInfo('added live orders into watch');
		setInterval(async () => {
			const prevOrderHashes = Object.keys(this.watchingOrders);

			const currentOrdersOrderHash = Object.keys(
				await orderPersistenceUtil.getAllLiveOrdersInPersistence(this.pair)
			);
			util.logInfo('loaded live orders');
			const ordersToRemove = prevOrderHashes.filter(
				orderHash => !currentOrdersOrderHash.includes(orderHash)
			);
			for (const orderHash of ordersToRemove) await this.removeFromWatch(orderHash);
			for (const orderHash of currentOrdersOrderHash) await this.addIntoWatch(orderHash);
		}, CST.ONE_MINUTE_MS * 60);

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

		this.orderWatcher.subscribe(async (err, orderState) => {
			if (err || !orderState) {
				util.logError(err ? err : 'orderState empty');
				return;
			}

			this.handleOrderWatcherUpdate(orderState);
		});
	}
}

const orderWatcherServer = new OrderWatcherServer();
export default orderWatcherServer;
