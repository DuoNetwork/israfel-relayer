import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOption,
	IOrderBook,
	IOrderBookLevelUpdate,
	IOrderBookSnapshot,
	IOrderBookSnapshotUpdate,
	IOrderQueueItem,
	IOrderUpdate
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderBookUtil from '../utils/orderBookUtil';
import orderMatchingUtil from '../utils/orderMatchingUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import util from '../utils/util';

class OrderBookServer {
	public pair: string = 'pair';
	public liveOrders: { [orderHash: string]: ILiveOrder } = {};
	public pendingUpdates: IOrderQueueItem[] = [];
	public loadingOrders: boolean = true;
	public orderSnapshotSequence: number = 0;
	public orderBook: IOrderBook = {
		bids: [],
		asks: []
	};
	public orderBookSnapshot: IOrderBookSnapshot = {
		pair: 'pair',
		version: 0,
		bids: [],
		asks: []
	};
	public processedUpdates: { [orderHash: string]: number } = {};

	public async handleOrderUpdate(channel: string, orderQueueItem: IOrderQueueItem) {
		util.logDebug('receive update from channel: ' + channel);

		if (
			orderQueueItem.requestor === CST.DB_ORDER_MATCHER &&
			orderQueueItem.method !== CST.DB_TERMINATE
		) {
			util.logDebug('ignore order update requested by self');
			return;
		}

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
			liveOrder.currentSequence <= this.orderSnapshotSequence ||
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

		const orderBookLevelUpdates: IOrderBookLevelUpdate[] = [
			this.updateOrderBook({
				liveOrder: orderQueueItem.liveOrder,
				method: method
			})
		];
		const leftLiveOrder = orderQueueItem.liveOrder;
		if (method !== CST.DB_TERMINATE && leftLiveOrder.balance > 0) {
			const matchinResult = orderMatchingUtil.findMatchingOrders(
				this.orderBook,
				this.liveOrders,
				true
			);
			matchinResult.orderMatchRequests.forEach(orderToMatch =>
				orderMatchingUtil.queueMatchRequest(orderToMatch)
			);
			orderBookLevelUpdates.push(...matchinResult.orderBookLevelUpdates);
		}

		await this.updateOrderBookSnapshot(orderBookLevelUpdates);
	}

	public updateOrderBook(orderUpdate: IOrderUpdate) {
		const liveOrder = orderUpdate.liveOrder;
		const method = orderUpdate.method;
		const orderHash = liveOrder.orderHash;
		const count = orderBookUtil.updateOrderBook(
			this.orderBook,
			{
				orderHash: orderHash,
				price: liveOrder.price,
				balance: liveOrder.balance,
				initialSequence: liveOrder.initialSequence
			},
			liveOrder.side === CST.DB_BID,
			method === CST.DB_TERMINATE
		);

		const orderBookLevelUpdates: IOrderBookLevelUpdate = {
			price: liveOrder.price,
			change:
				(method === CST.DB_TERMINATE ? 0 : liveOrder.balance) -
				(this.liveOrders[orderHash] ? this.liveOrders[orderHash].balance : 0),
			count: count,
			side: liveOrder.side
		};

		if (method !== CST.DB_TERMINATE) this.liveOrders[orderHash] = liveOrder;
		else delete this.liveOrders[orderHash];

		return orderBookLevelUpdates;
	}

	public async updateOrderBookSnapshot(orderBookLevelUpdates: IOrderBookLevelUpdate[]) {
		const orderBookSnapshotUpdate: IOrderBookSnapshotUpdate = {
			pair: this.pair,
			updates: [],
			prevVersion: this.orderBookSnapshot.version,
			version: util.getUTCNowTimestamp()
		};

		for (const update of orderBookLevelUpdates)
			orderBookSnapshotUpdate.updates.push({
				price: update.price,
				change: update.change,
				count: update.count,
				side: update.side
			});

		orderBookUtil.updateOrderBookSnapshot(this.orderBookSnapshot, orderBookSnapshotUpdate);
		await orderBookPersistenceUtil.publishOrderBookUpdate(
			this.pair,
			this.orderBookSnapshot,
			orderBookSnapshotUpdate
		);
	}

	public updateOrderSequences() {
		this.processedUpdates = {};
		let maxSequence = 0;
		for (const orderHash in this.liveOrders) {
			const liveOrder = this.liveOrders[orderHash];
			maxSequence = Math.max(maxSequence, liveOrder.currentSequence);
			this.processedUpdates[orderHash] = liveOrder.currentSequence;
		}

		this.orderSnapshotSequence = maxSequence;
	}

	public async loadLiveOrders() {
		this.loadingOrders = true;
		this.liveOrders = await orderPersistenceUtil.getAllLiveOrdersInPersistence(this.pair);
		util.logInfo('loaded live orders : ' + Object.keys(this.liveOrders).length);
		this.updateOrderSequences();
		this.orderBook = orderBookUtil.constructOrderBook(this.liveOrders);
		util.logDebug('start matchig ordderBook');
		const matchingResult = orderMatchingUtil.findMatchingOrders(
			this.orderBook,
			this.liveOrders,
			false
		);
		matchingResult.orderMatchRequests.forEach(omr => orderMatchingUtil.queueMatchRequest(omr));
		util.logInfo('completed matching orderBook as a whole in cold start');
		this.orderBookSnapshot = orderBookUtil.renderOrderBookSnapshot(this.pair, this.orderBook);
		await orderBookPersistenceUtil.publishOrderBookUpdate(this.pair, this.orderBookSnapshot);
		this.loadingOrders = false;
		for (const updateItem of this.pendingUpdates)
			await this.handleOrderUpdate('pending', updateItem);
		this.pendingUpdates = [];
	}

	public async startServer(option: IOption) {
		this.pair = option.token + '|' + CST.TOKEN_WETH;
		orderPersistenceUtil.subscribeOrderUpdate(this.pair, (channel, orderQueueItem) =>
			this.handleOrderUpdate(channel, orderQueueItem)
		);

		await this.loadLiveOrders();
		setInterval(() => this.loadLiveOrders(), CST.ONE_MINUTE_MS * 15);

		if (option.server) {
			dynamoUtil.updateStatus(this.pair);
			setInterval(
				() => dynamoUtil.updateStatus(this.pair, Object.keys(this.liveOrders).length),
				15000
			);
		}
	}
}

const orderBookServer = new OrderBookServer();
export default orderBookServer;
