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
	public pair: string = 'pair';
	public orderWatcher: OrderWatcher | null = null;
	public web3Util: Web3Util | null = null;
	public watchingOrders: { [orderHash: string]: SignedOrder } = {};

	public async updateOrder(orderPersistRequest: IOrderPersistRequest) {
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

	public handleOrderWatcherUpdate(orderState: OrderState) {
		const orderPersistRequest: IOrderPersistRequest = {
			method: CST.DB_UPDATE,
			pair: this.pair,
			orderHash: orderState.orderHash,
			balance: -1
		};
		util.logDebug(JSON.stringify(orderState));
		if (orderState.isValid) {
			const remainingAmount = Web3Util.fromWei(
				(orderState as OrderStateValid).orderRelevantState.remainingFillableMakerAssetAmount
			);
			orderPersistRequest.balance = remainingAmount;
		} else {
			const error = (orderState as OrderStateInvalid).error;
			switch (error) {
				case ExchangeContractErrs.OrderCancelExpired:
				case ExchangeContractErrs.OrderFillExpired:
				case ExchangeContractErrs.OrderCancelled:
					orderPersistRequest.method = CST.DB_TERMINATE;
					break;
				case ExchangeContractErrs.OrderRemainingFillAmountZero:
				case ExchangeContractErrs.InsufficientRemainingFillAmount:
					orderPersistRequest.balance = 0;
					orderPersistRequest.method = CST.DB_TERMINATE;
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
					// OrderFillAmountZero = 'ORDER_FILL_AMOUNT_ZERO',
					// OrderFillRoundingError = "ORDER_FILL_ROUNDING_ERROR",
					// FillBalanceAllowanceError = "FILL_BALANCE_ALLOWANCE_ERROR",
					// TransactionSenderIsNotFillOrderTaker = "TRANSACTION_SENDER_IS_NOT_FILL_ORDER_TAKER",
					// MultipleMakersInSingleCancelBatchDisallowed = "MULTIPLE_MAKERS_IN_SINGLE_CANCEL_BATCH_DISALLOWED",
					// MultipleTakerTokensInFillUpToDisallowed = "MULTIPLE_TAKER_TOKENS_IN_FILL_UP_TO_DISALLOWED",
					// BatchOrdersMustHaveSameExchangeAddress = "BATCH_ORDERS_MUST_HAVE_SAME_EXCHANGE_ADDRESS",
					// BatchOrdersMustHaveAtLeastOneItem = "BATCH_ORDERS_MUST_HAVE_AT_LEAST_ONE_ITEM"
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
				const rawSignedOrder: SignedOrder = orderPersistenceUtil.parseSignedOrder(
					signedOrder
				);

				if (!(await this.web3Util.validateOrderFillable(rawSignedOrder))) {
					util.logDebug(orderHash + ' not fillable, send update');
					await this.updateOrder({
						method: CST.DB_UPDATE,
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
		this.pair = option.token + '-' + CST.TOKEN_WETH;

		redisUtil.onOrderUpdate((channel, orderPersistRequest) =>
			this.handleOrderUpdate(channel, orderPersistRequest)
		);

		redisUtil.subscribe(`${CST.DB_ORDERS}|${CST.DB_PUBSUB}|${this.pair}`);

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
				() => dynamoUtil.updateStatus(this.pair, Object.keys(this.watchingOrders).length),
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
