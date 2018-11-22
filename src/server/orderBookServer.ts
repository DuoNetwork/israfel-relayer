import * as CST from '../common/constants';
import {
	ILiveOrder,
	IMatchingOrderResult,
	IOption,
	IOrderBook,
	IOrderBookSnapshot,
	IOrderBookSnapshotUpdate,
	IOrderQueueItem
	// IUserOrder
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderBookUtil from '../utils/orderBookUtil';
import { OrderMatcherUtil } from '../utils/OrderMatcherUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class OrderBookServer {
	public pair: string = 'pair';
	public web3Util: Web3Util | null = null;
	public liveOrders: { [orderHash: string]: ILiveOrder } = {};
	public pendingUpdates: IOrderQueueItem[] = [];
	public loadingOrders: boolean = true;
	public orderSnapshotSequence: number = 0;
	public orderMatcher: OrderMatcherUtil | null = null;
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

	public handleOrderUpdate = async (channel: string, orderQueueItem: IOrderQueueItem) => {
		util.logDebug('receive update from channel: ' + channel);
		const pair = channel.split('|')[2];
		if (pair !== this.pair) {
			util.logDebug(
				`received order for pair ${pair}, should only subscribe for ${this.pair}`
			);
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

		if (this.orderMatcher && method === CST.DB_ADD) {
			let matchable = true;
			const liveOrders: ILiveOrder[] = [];
			while (matchable) {
				const matchResult:
					| IMatchingOrderResult[]
					| null = await this.orderMatcher.matchOrders(this.orderBook, orderQueueItem);
				if (matchResult) {
					const resLeft = matchResult[0];
					const resRight = matchResult[1];

					orderQueueItem.liveOrder.currentSequence = resLeft.sequence;
					orderQueueItem.liveOrder.balance = resLeft.newBalance;
					await this.updateOrderBook(orderQueueItem.liveOrder, CST.DB_UPDATE);

					const rightLiveOrder = this.liveOrders[resRight.orderHash];
					rightLiveOrder.currentSequence = resRight.sequence;
					rightLiveOrder.balance = resRight.newBalance;
					await this.updateOrderBook(rightLiveOrder, CST.DB_UPDATE);
					liveOrders.push(orderQueueItem.liveOrder);
					liveOrders.push(rightLiveOrder);
				} else matchable = false;
			}
			if (liveOrders.length > 0) await this.orderMatcher.batchAddUserOrders(liveOrders);
		}
		await this.updateOrderBook(orderQueueItem.liveOrder, method);
	};

	public async updateOrderBook(liveOrder: ILiveOrder, method: string) {
		const orderHash = liveOrder.orderHash;
		const count = orderBookUtil.updateOrderBook(
			this.orderBook,
			{
				orderHash: orderHash,
				price: liveOrder.price,
				amount: liveOrder.amount,
				initialSequence: liveOrder.initialSequence
			},
			liveOrder.side === CST.DB_BID,
			method === CST.DB_TERMINATE
		);

		const orderBookSnapshotUpdate: IOrderBookSnapshotUpdate = {
			pair: this.pair,
			price: liveOrder.price,
			amount:
				(method === CST.DB_TERMINATE ? 0 : liveOrder.amount) -
				(this.liveOrders[orderHash] ? this.liveOrders[orderHash].amount : 0),
			count: count,
			side: liveOrder.side,
			prevVersion: this.orderBookSnapshot.version,
			version: util.getUTCNowTimestamp()
		};

		if (method !== CST.DB_TERMINATE) this.liveOrders[orderHash] = liveOrder;
		else delete this.liveOrders[orderHash];

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
		this.orderBookSnapshot = orderBookUtil.renderOrderBookSnapshot(this.pair, this.orderBook);
		await orderBookPersistenceUtil.publishOrderBookUpdate(this.pair, this.orderBookSnapshot);
		this.loadingOrders = false;
		for (const updateItem of this.pendingUpdates)
			await this.handleOrderUpdate('pending', updateItem);
		this.pendingUpdates = [];
	}

	public async startServer(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		this.orderMatcher = new OrderMatcherUtil(web3Util, option.live);
		this.pair = option.token + '-' + CST.TOKEN_WETH;
		orderPersistenceUtil.subscribeOrderUpdate(this.pair, (channel, orderPersistRequest) =>
			this.handleOrderUpdate(channel, orderPersistRequest)
		);

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
