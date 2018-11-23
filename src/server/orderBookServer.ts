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
import orderMatchingUtil from '../utils/orderMatchingUtil';
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

		if (this.web3Util && method === CST.DB_ADD) {
			let matchable = true;
			const liveOrders: ILiveOrder[] = [];
			while (matchable) {
				const matchResult: IMatchingOrderResult | null = await orderMatchingUtil.matchOrders(
					this.web3Util,
					orderQueueItem.liveOrder,
					orderQueueItem.liveOrder.side === CST.DB_BID
						? this.liveOrders[this.orderBook.asks[0].orderHash]
						: this.liveOrders[this.orderBook.bids[0].orderHash]
				);
				if (matchResult)
					liveOrders.concat(
						await this.processMatchingResult(matchResult, orderQueueItem.liveOrder)
					);
				else matchable = false;
			}
			if (liveOrders.length > 0) await orderMatchingUtil.batchAddUserOrders(liveOrders);
		}
		await this.updateOrderBook(orderQueueItem.liveOrder, method);
	};

	public async processMatchingResult(
		matchResult: IMatchingOrderResult,
		liveOrder: ILiveOrder
	): Promise<ILiveOrder[]> {
		const resLeft = matchResult.left;
		const resRight = matchResult.right;
		liveOrder.currentSequence = resLeft.sequence;
		liveOrder.balance = resLeft.newBalance;
		await this.updateOrderBook(liveOrder, CST.DB_UPDATE);

		const rightLiveOrder = this.liveOrders[resRight.orderHash];
		rightLiveOrder.currentSequence = resRight.sequence;
		rightLiveOrder.balance = resRight.newBalance;
		await this.updateOrderBook(rightLiveOrder, CST.DB_UPDATE);
		return [liveOrder, rightLiveOrder];
	}

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
		await this.matchOrderBook();
		this.orderBookSnapshot = orderBookUtil.renderOrderBookSnapshot(this.pair, this.orderBook);
		await orderBookPersistenceUtil.publishOrderBookUpdate(this.pair, this.orderBookSnapshot);
		this.loadingOrders = false;
		for (const updateItem of this.pendingUpdates)
			await this.handleOrderUpdate('pending', updateItem);
		this.pendingUpdates = [];
	}

	public async matchOrderBook() {
		if (this.web3Util) {
			const liveOrders: ILiveOrder[] = [];
			for (const orderLevel of this.orderBook.bids) {
				const leftLiveOrder = this.liveOrders[orderLevel.orderHash];
				const res: IMatchingOrderResult | null = await orderMatchingUtil.matchOrders(
					this.web3Util,
					leftLiveOrder,
					this.liveOrders[this.orderBook.asks[0].orderHash]
				);
				if (!res) return;
				else
					liveOrders.concat(
						await this.processMatchingResult(res, this.liveOrders[orderLevel.orderHash])
					);
			}
		}
	}

	public async startServer(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		this.pair = option.token + '|' + CST.TOKEN_WETH;
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
