import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOption,
	IOrderBookSnapshot,
	IOrderBookUpdate,
	IOrderQueueItem
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookUtil from '../utils/orderBookUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import redisUtil from '../utils/redisUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class OrderBookServer {
	public pair: string = 'pair';
	public web3Util: Web3Util | null = null;
	public liveOrders: { [orderHash: string]: ILiveOrder } = {};
	public pendingUpdates: IOrderQueueItem[] = [];
	public loadingOrders: boolean = true;
	public lastSequence: number = 0;
	public orderBook: IOrderBookSnapshot | null = null;
	public processedHash: { [orderHash: string]: number } = {};

	public handleOrderUpdate = async (channel: string, orderQueueItem: IOrderQueueItem) => {
		util.logDebug('receive update from channel: ' + channel);
		if (this.loadingOrders) {
			this.pendingUpdates.push(orderQueueItem);
			return;
		}

		if (orderQueueItem.liveOrder.currentSequence <= this.lastSequence) return;
		if (
			this.processedHash[orderQueueItem.liveOrder.orderHash] &&
			this.processedHash[orderQueueItem.liveOrder.orderHash] >=
				orderQueueItem.liveOrder.currentSequence
		)
			return;

		// this.lastSequence = orderQueueItem.liveOrder.currentSequence;
		await this.processUpdate(orderQueueItem);
	};

	public getMaxSequence(liveOrders: { [orderHash: string]: ILiveOrder }) {
		let maxSequence = 0;
		for (const orderHash in liveOrders)
			maxSequence = Math.max(maxSequence, liveOrders[orderHash].currentSequence);

		return maxSequence;
	}

	private async processUpdate(updateItem: IOrderQueueItem): Promise<boolean> {
		const { price, pair, balance, currentSequence, orderHash, side } = updateItem.liveOrder;
		let updateAmt = 0;
		switch (updateItem.method) {
			case CST.DB_ADD:
				updateAmt = balance;
				break;
			case CST.DB_TERMINATE:
				updateAmt = -balance;
				break;
			case CST.DB_UPDATE:
				updateAmt = balance - this.liveOrders[orderHash].balance;
				break;
		}

		const orderBookUpdate: IOrderBookUpdate = {
			pair: pair,
			price: price,
			amount: updateAmt,
			side: side,
			baseSequence: this.orderBook ? this.orderBook.sequence : 0,
			sequence: currentSequence
		};
		try {
			await redisUtil.publish(
				`${CST.DB_ORDER_BOOKS}|${CST.DB_UPDATE}|${this.pair}`,
				JSON.stringify(orderBookUpdate)
			);
			const updateDelta = [{ price: price, amount: updateAmt }];
			this.orderBook = orderBookUtil.applyChangeOrderBook(
				this.orderBook,
				currentSequence,
				side === CST.DB_BID ? updateDelta : [],
				side === CST.DB_ASK ? updateDelta : []
			);
			redisUtil.set(
				`${CST.DB_ORDER_BOOKS}|${CST.DB_SNAPSHOT}|${this.pair}`,
				JSON.stringify(this.orderBook)
			);
			this.processedHash[orderHash] = currentSequence;
			return true;
		} catch (err) {
			util.logError(err);
			return false;
		}
	}

	public async processPendingUpdates(lastSequence: number) {
		for (let index = 0; index < this.pendingUpdates.length; index++) {
			const updateItem = this.pendingUpdates[index];
			const { currentSequence, orderHash } = updateItem.liveOrder;
			if (
				currentSequence <= lastSequence ||
				(this.processedHash[orderHash] && this.processedHash[orderHash] >= currentSequence)
			) {
				util.logDebug('sequence smarller than current value, stop processing!');
				delete this.pendingUpdates[index];
				return;
			}

			if (!this.liveOrders[orderHash]) {
				util.logDebug('updateItem does not exist, skip for now');
				return;
			}
			const updated = await this.processUpdate(updateItem);
			if (updated) delete this.pendingUpdates[index];
			else util.logInfo('error in processing update');
		}
		return;
	}

	public async startServer(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		this.pair = option.token + '-' + CST.TOKEN_WETH;

		redisUtil.onOrderUpdate((channel, orderPersistRequest) =>
			this.handleOrderUpdate(channel, orderPersistRequest)
		);

		redisUtil.subscribe(`${CST.DB_ORDERS}|${CST.DB_PUBSUB}|${this.pair}`);

		this.liveOrders = await orderPersistenceUtil.getAllLiveOrdersInPersistence(this.pair);
		util.logInfo('loaded live orders : ' + Object.keys(this.liveOrders).length);
		this.lastSequence = this.getMaxSequence(this.liveOrders);
		this.orderBook = orderBookUtil.aggrOrderBook(this.liveOrders);
		redisUtil.set(
			`${CST.DB_ORDER_BOOKS}|${CST.DB_SNAPSHOT}|${this.pair}`,
			JSON.stringify(this.orderBook)
		);
		Object.keys(this.liveOrders).forEach(
			orderHash =>
				(this.processedHash[orderHash] = this.liveOrders[orderHash].currentSequence)
		);
		this.loadingOrders = false;
		this.processPendingUpdates(this.lastSequence);

		setInterval(async () => {
			this.liveOrders = await orderPersistenceUtil.getAllLiveOrdersInPersistence(this.pair);
			util.logInfo('loaded live orders : ' + Object.keys(this.liveOrders).length);
			this.lastSequence = this.getMaxSequence(this.liveOrders);
			this.orderBook = orderBookUtil.aggrOrderBook(this.liveOrders);
			redisUtil.set(
				`${CST.DB_ORDER_BOOKS}|${CST.DB_SNAPSHOT}|${this.pair}`,
				JSON.stringify(this.orderBook)
			);
			this.processedHash = {};
			Object.keys(this.liveOrders).forEach(
				orderHash =>
					(this.processedHash[orderHash] = this.liveOrders[orderHash].currentSequence)
			);
			this.loadingOrders = false;
			this.processPendingUpdates(this.lastSequence);
		}, CST.ONE_MINUTE_MS * 30);

		if (option.server) {
			dynamoUtil.updateStatus(this.pair);
			setInterval(
				() => dynamoUtil.updateStatus(this.pair, Object.keys(this.liveOrders).length),
				10000
			);
		}
	}
}

const orderWatcherServer = new OrderBookServer();
export default orderWatcherServer;
