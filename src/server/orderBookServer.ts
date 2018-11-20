import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOption,
	IOrderBookSnapshot,
	IOrderBookUpdateItem,
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
	public snapshotSequence: number = 0;
	public orderBook: IOrderBookSnapshot | null = null;
	public processedUpdates: { [orderHash: string]: number } = {};

	public handleOrderUpdate = async (channel: string, orderQueueItem: IOrderQueueItem) => {
		util.logDebug('receive update from channel: ' + channel);
		if (this.loadingOrders) {
			this.pendingUpdates.push(orderQueueItem);
			util.logDebug('loading orders, queue update');
			return;
		}

		const { method, liveOrder } = orderQueueItem;
		if (![CST.DB_ADD, CST.DB_UPDATE, CST.DB_TERMINATE].includes(method)) {
			util.logDebug('invalid method, ignore');
			return;
		}
		const orderHash = liveOrder.orderHash;
		if (
			liveOrder.currentSequence <= this.snapshotSequence ||
			(this.processedUpdates[orderHash] &&
				this.processedUpdates[orderHash] >= liveOrder.currentSequence)
		) {
			util.logDebug('obsolete order, ignore');
			return;
		}

		this.processedUpdates[orderHash] = liveOrder.currentSequence;

		if (method === CST.DB_TERMINATE && !this.liveOrders[orderHash]) {
			util.logDebug('terminating order not found in cache, ignore');
			return;
		}

		const orderBookUpdate: IOrderBookUpdateItem = {
			pair: this.pair,
			price: liveOrder.price,
			amount:
				(method === CST.DB_TERMINATE ? 0 : liveOrder.amount) -
				(this.liveOrders[orderHash] ? this.liveOrders[orderHash].amount : 0),
			side: liveOrder.side,
			baseSequence: this.snapshotSequence,
			sequence: liveOrder.currentSequence
		};

		if (method !== CST.DB_TERMINATE)
			this.liveOrders[orderHash] = liveOrder;
		else
			delete this.liveOrders[orderHash];

		const updateDelta = [{ price: orderBookUpdate.price, amount: orderBookUpdate.amount }];
		this.orderBook = orderBookUtil.applyChangeOrderBook(
			this.orderBook,
			orderBookUpdate.sequence,
			orderBookUpdate.side === CST.DB_BID ? updateDelta : [],
			orderBookUpdate.side === CST.DB_ASK ? updateDelta : []
		);

		await this.publishOrderBookUpdate(orderBookUpdate);
	};

	private async publishOrderBookUpdate(orderBookUpdate: IOrderBookUpdateItem): Promise<boolean> {
		try {
			await redisUtil.set(
				`${CST.DB_ORDER_BOOKS}|${CST.DB_SNAPSHOT}|${this.pair}`,
				JSON.stringify(this.orderBook)
			);
			await redisUtil.publish(
				`${CST.DB_ORDER_BOOKS}|${CST.DB_UPDATE}|${this.pair}`,
				JSON.stringify(orderBookUpdate)
			);
			return true;
		} catch (err) {
			util.logError(err);
			return false;
		}
	}

	public updateSequences() {
		this.processedUpdates = {};
		let maxSequence = 0;
		for (const orderHash in this.liveOrders) {
			const liveOrder = this.liveOrders[orderHash];
			maxSequence = Math.max(maxSequence, liveOrder.currentSequence);
			this.processedUpdates[orderHash] = liveOrder.currentSequence;
		}

		this.snapshotSequence = maxSequence;
	}

	public async loadLiveOrders() {
		this.loadingOrders = true;
		this.liveOrders = await orderPersistenceUtil.getAllLiveOrdersInPersistence(this.pair);
		util.logInfo('loaded live orders : ' + Object.keys(this.liveOrders).length);
		this.updateSequences();
		this.orderBook = orderBookUtil.aggrOrderBook(this.liveOrders);
		await redisUtil.set(
			`${CST.DB_ORDER_BOOKS}|${CST.DB_SNAPSHOT}|${this.pair}`,
			JSON.stringify(this.orderBook)
		);
		this.loadingOrders = false;
		for (const updateItem of this.pendingUpdates)
			await this.handleOrderUpdate('pending', updateItem);
		this.pendingUpdates = [];
	}

	public async startServer(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		this.pair = option.token + '-' + CST.TOKEN_WETH;

		redisUtil.onOrderUpdate((channel, orderPersistRequest) =>
			this.handleOrderUpdate(channel, orderPersistRequest)
		);

		redisUtil.subscribe(`${CST.DB_ORDERS}|${CST.DB_PUBSUB}|${this.pair}`);

		await this.loadLiveOrders();
		setInterval(() => this.loadLiveOrders(), CST.ONE_MINUTE_MS * 15);

		if (option.server) {
			dynamoUtil.updateStatus(this.pair);
			setInterval(
				() => dynamoUtil.updateStatus(this.pair, Object.keys(this.liveOrders).length),
				10000
			);
		}
	}
}

const orderBookServer = new OrderBookServer();
export default orderBookServer;
