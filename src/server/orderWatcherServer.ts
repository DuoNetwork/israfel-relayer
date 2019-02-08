import {
	ExchangeContractErrs,
	OrderState,
	OrderStateInvalid,
	OrderStateValid,
	OrderWatcher,
	SignedOrder
} from '0x.js';
import {
	Constants,
	ILiveOrder,
	IRawOrder,
	IStringSignedOrder,
	OrderUtil,
	Util,
	Web3Util
} from '../../../israfel-common/src';
import { ONE_MINUTE_MS } from '../common/constants';
import { IOption, IOrderPersistRequest, IOrderQueueItem } from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';

class OrderWatcherServer {
	public pairs: string[] = [];
	public orderWatcher: OrderWatcher | null = null;
	public web3Util: Web3Util | null = null;
	public watchingOrders: {
		[orderHash: string]: {
			pair: string;
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
				await Util.sleep(2000);
			}

		if (!userOrder) {
			Util.logInfo(`invalid orderHash ${orderPersistRequest.orderHash}, ignore`);
			this.removeFromWatch(orderPersistRequest.orderHash);
		}
	}

	public async handleOrderWatcherUpdate(orderState: OrderState) {
		const orderHash = orderState.orderHash;
		if (!this.watchingOrders[orderHash]) {
			Util.logDebug(orderHash + ' not in cache, ignored');
			return;
		}
		const signedOrder = this.watchingOrders[orderHash].signedOrder;
		const orderPersistRequest: IOrderPersistRequest = {
			method: Constants.DB_TERMINATE,
			status: Constants.DB_TERMINATE,
			requestor: Constants.DB_ORDER_WATCHER,
			pair: this.watchingOrders[orderHash].pair,
			orderHash: orderHash
		};
		Util.logDebug(JSON.stringify(orderState));
		if (orderState.isValid) {
			const {
				remainingFillableTakerAssetAmount,
				filledTakerAssetAmount
			} = (orderState as OrderStateValid).orderRelevantState;
			Util.logDebug(
				`remainingFillableTakerAssetAmount ${remainingFillableTakerAssetAmount.valueOf()} filledTakerAssetAmount ${filledTakerAssetAmount.valueOf()} takerAssetAmount ${signedOrder.takerAssetAmount.valueOf()} add result: ${remainingFillableTakerAssetAmount.add(
					filledTakerAssetAmount
				)}`
			);
			const diff = signedOrder.takerAssetAmount
				.sub(remainingFillableTakerAssetAmount)
				.sub(filledTakerAssetAmount);
			if (diff.greaterThan(1000000) || diff.lessThan(-1000000))
				orderPersistRequest.status = Constants.DB_BALANCE;
			else return;
		} else {
			const error = (orderState as OrderStateInvalid).error;
			switch (error) {
				case ExchangeContractErrs.OrderFillRoundingError:
				case ExchangeContractErrs.OrderRemainingFillAmountZero:
					orderPersistRequest.status = Constants.DB_FILL;
					break;
				case ExchangeContractErrs.InsufficientMakerBalance:
				case ExchangeContractErrs.InsufficientMakerAllowance:
					orderPersistRequest.status = Constants.DB_BALANCE;
					break;
				case ExchangeContractErrs.OrderFillExpired:
				case ExchangeContractErrs.OrderCancelled:
					// orderPersistRequest.status = Constants.DB_TERMINATE;
					break;
				default:
					return;
			}
		}

		// if (orderPersistRequest.method === Constants.DB_TERMINATE)
		this.removeFromWatch(orderHash);

		return this.updateOrder(orderPersistRequest);
	}

	public async addIntoWatch(liveOrder: ILiveOrder, signedOrder?: IStringSignedOrder) {
		const orderHash = liveOrder.orderHash;
		if (OrderUtil.isExpired(liveOrder.expiry)) {
			Util.logDebug(orderHash + ' expired, send update');
			this.removeFromWatch(orderHash);
			await this.updateOrder({
				method: Constants.DB_TERMINATE,
				status: Constants.DB_TERMINATE,
				requestor: Constants.DB_ORDER_WATCHER,
				pair: liveOrder.pair,
				orderHash: orderHash
			});
			return;
		}

		if (this.orderWatcher && this.web3Util && !this.watchingOrders[orderHash])
			try {
				if (!signedOrder) {
					const rawOrder: IRawOrder | null = await dynamoUtil.getRawOrder(orderHash);
					if (!rawOrder) {
						Util.logDebug('no signed order specified, failed to add');
						return;
					}
					signedOrder = rawOrder.signedOrder as IStringSignedOrder;
				}
				const rawSignedOrder: SignedOrder = OrderUtil.parseSignedOrder(signedOrder);

				if (!(await this.web3Util.validateOrderFillable(rawSignedOrder))) {
					Util.logDebug(orderHash + ' not fillable, send update');
					await this.updateOrder({
						method: Constants.DB_TERMINATE,
						status: Constants.DB_BALANCE,
						requestor: Constants.DB_ORDER_WATCHER,
						pair: liveOrder.pair,
						orderHash: orderHash
					});
					return;
				}

				await this.orderWatcher.addOrderAsync(rawSignedOrder);
				this.watchingOrders[orderHash] = {
					pair: liveOrder.pair,
					signedOrder: rawSignedOrder
				};
				Util.logDebug('successfully added ' + orderHash);
			} catch (e) {
				Util.logDebug('failed to add ' + orderHash + 'error is ' + e);
			}
	}

	public removeFromWatch(orderHash: string) {
		if (!this.orderWatcher || !this.watchingOrders[orderHash]) {
			Util.logDebug('order is not currently watched');
			return;
		}

		try {
			this.orderWatcher.removeOrder(orderHash);
			delete this.watchingOrders[orderHash];
			Util.logDebug('successfully removed ' + orderHash);
		} catch (e) {
			Util.logDebug('failed to remove ' + orderHash + 'error is ' + e);
		}
	}

	public handleOrderUpdate(channel: string, orderQueueItem: IOrderQueueItem) {
		Util.logDebug('receive update from channel: ' + channel);
		if (orderQueueItem.requestor === Constants.DB_ORDER_WATCHER) {
			Util.logDebug('ignore order update requested by self');
			return Promise.resolve();
		}

		const method = orderQueueItem.method;
		switch (method) {
			case Constants.DB_ADD:
				return this.addIntoWatch(orderQueueItem.liveOrder, orderQueueItem.signedOrder);
			case Constants.DB_TERMINATE:
				this.removeFromWatch(orderQueueItem.liveOrder.orderHash);
				return Promise.resolve();
			default:
				Util.logDebug('neither add nor terminate, ignore this update');
				return Promise.resolve();
		}
	}

	public async loadOrders() {
		const prevOrderHashes = Object.keys(this.watchingOrders);

		const pairOrders = await Promise.all(
			this.pairs.map(pair => orderPersistenceUtil.getAllLiveOrdersInPersistence(pair))
		);
		const currentLiveOrders: { [orderHash: string]: ILiveOrder } = {};
		pairOrders.forEach(orders => Object.assign(currentLiveOrders, orders));
		const currentOrdersOrderHash = Object.keys(currentLiveOrders);
		Util.logInfo('loaded live orders : ' + Object.keys(currentOrdersOrderHash).length);
		const ordersToRemove = prevOrderHashes.filter(
			orderHash => !currentOrdersOrderHash.includes(orderHash)
		);
		for (const orderHash of ordersToRemove) await this.removeFromWatch(orderHash);
		for (const orderHash of currentOrdersOrderHash)
			await this.addIntoWatch(currentLiveOrders[orderHash]);
		Util.logInfo('added live orders into watch');
	}

	public async initializeData(option: IOption, orderWatcher: OrderWatcher) {
		orderWatcher.subscribe(async (err, orderState) => {
			if (err || !orderState) {
				Util.logError(err ? err : 'orderState empty');
				return;
			}

			return this.handleOrderWatcherUpdate(orderState);
		});

		if (option.tokens.length)
			this.pairs = option.tokens.map(token => token + '|' + Constants.TOKEN_WETH);
		else if (option.token) this.pairs = [option.token + '|' + Constants.TOKEN_WETH];

		for (const pair of this.pairs)
			orderPersistenceUtil.subscribeOrderUpdate(pair, (channel, orderQueueItem) =>
				this.handleOrderUpdate(channel, orderQueueItem)
			);

		await this.loadOrders();
		global.setInterval(() => this.loadOrders(), ONE_MINUTE_MS * 60);
	}

	public async startServer(option: IOption) {
		this.web3Util = new Web3Util(
			null,
			option.env === Constants.DB_LIVE,
			'',
			Constants.PROVIDER_LOCAL
		);
		this.web3Util.setTokens(await dynamoUtil.scanTokens());
		this.orderWatcher = new OrderWatcher(
			this.web3Util.getProvider(),
			option.env === Constants.DB_LIVE
				? Constants.NETWORK_ID_MAIN
				: Constants.NETWORK_ID_KOVAN,
			undefined,
			{
				cleanupJobIntervalMs: 30000,
				expirationMarginMs: Constants.EXPIRY_MARGIN_MS
			}
		);
		await this.initializeData(option, this.orderWatcher);
		if (option.server) {
			this.pairs.forEach(pair => dynamoUtil.updateStatus(pair));
			global.setInterval(
				() =>
					this.pairs.forEach(pair =>
						dynamoUtil.updateStatus(
							pair,
							this.orderWatcher ? this.orderWatcher.getStats().orderCount : 0
						)
					),
				15000
			);
		}
	}
}

const orderWatcherServer = new OrderWatcherServer();
export default orderWatcherServer;
