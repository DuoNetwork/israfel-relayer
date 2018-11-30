import * as CST from '../common/constants';
import {
	ILiveOrder,
	IMatchingCandidate,
	IOption,
	IOrderBook,
	IOrderBookLevelUpdate,
	IOrderBookSnapshot,
	IOrderBookSnapshotUpdate,
	IOrderQueueItem,
	IOrderUpdateInput
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

	public async handleOrderUpdate(channel: string, orderQueueItem: IOrderQueueItem) {
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
		const ordersToMatch: IMatchingCandidate[] = [];
		const leftLiveOrder = orderQueueItem.liveOrder;
		if (method !== CST.DB_TERMINATE && leftLiveOrder.balance > 0) {
			// there can only be two cases
			// 1) add new orrder
			// 2) update, an existing order with balance 0 is updated to new balance
			const isLeftOrderBid = leftLiveOrder.side === CST.DB_BID;
			const leftOriginalBalance = leftLiveOrder.balance;

			const rightLevels = isLeftOrderBid
				? this.orderBook.asks.filter(a => a.price <= leftLiveOrder.price && a.balance > 0)
				: this.orderBook.bids.filter(b => b.price >= leftLiveOrder.price && b.balance > 0);
			const rightLiveOrders = rightLevels.map(level => this.liveOrders[level.orderHash]);

			if (rightLevels.length) {
				let rightIdx = 0;
				let rightLevel = rightLevels[0];
				let rightLiveOrder = rightLiveOrders[0];
				while (true) {
					const matchedAmt = Math.min(leftLiveOrder.balance, rightLevel.balance);
					rightLevel.balance = rightLevel.balance - matchedAmt;
					rightLiveOrder.balance = rightLiveOrder.balance - matchedAmt;
					leftLiveOrder.balance = leftLiveOrder.balance - matchedAmt;

					ordersToMatch.push({
						left: {
							orderHash: leftLiveOrder.orderHash,
							balance: leftLiveOrder.balance
						},
						right: {
							orderHash: rightLiveOrder.orderHash,
							balance: rightLiveOrder.balance
						}
					});

					orderBookLevelUpdates.push({
						price: rightLiveOrder.price,
						change: -matchedAmt,
						count: 0,
						side: rightLiveOrder.side
					});

					rightIdx++;
					if (rightLevel.balance > 0 || rightIdx >= rightLevels.length) break;
					rightLevel = rightLevels[rightIdx];
					rightLiveOrder = rightLiveOrders[rightIdx];
				}

				orderBookLevelUpdates.push({
					price: leftLiveOrder.price,
					change: leftLiveOrder.balance - leftOriginalBalance,
					count: leftLiveOrder.balance > 0 ? 0 : -1,
					side: leftLiveOrder.side
				});
			}
		}

		await this.updateOrderBookSnapshot(orderBookLevelUpdates);
		if (ordersToMatch.length > 0)
			await orderMatchingUtil.matchOrders(this.web3Util as Web3Util, this.pair, ordersToMatch);
	}

	public updateOrderBook(orderUpdate: IOrderUpdateInput) {
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
		// await this.updateOrderBookSnapshot(orderBookLevelUpdates);
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
		await this.matchOrderBook();
		util.logInfo('completed matching orderBook as a whole in cold start');
		this.orderBookSnapshot = orderBookUtil.renderOrderBookSnapshot(this.pair, this.orderBook);
		await orderBookPersistenceUtil.publishOrderBookUpdate(this.pair, this.orderBookSnapshot);
		this.loadingOrders = false;
		for (const updateItem of this.pendingUpdates)
			await this.handleOrderUpdate('pending', updateItem);
		this.pendingUpdates = [];
	}

	public async matchOrderBook() {
		const { bids, asks } = this.orderBook;
		if (this.web3Util && bids.length && asks.length) {
			const bestBid = bids.find(level => level.balance > 0);
			const bestAsk = asks.find(level => level.balance > 0);
			if (!bestBid || !bestAsk) return;

			if (bestAsk.price > bestBid.price) return;

			const bidsToMatch = bids.filter(b => b.price >= bestAsk.price && b.balance > 0);
			const asksToMatch = asks.filter(a => a.price <= bestBid.price && a.balance > 0);

			const ordersToMatch: IMatchingCandidate[] = [];
			let done = false;
			let bidIdx = 0;
			let askIdx = 0;
			while (!done) {
				const bid = bidsToMatch[bidIdx];
				const ask = asksToMatch[askIdx];
				const bidLiveOrder = this.liveOrders[bid.orderHash];
				if (!bidLiveOrder) {
					util.logDebug('missing live order for ' + bid.orderHash);
					bidIdx++;
					continue;
				}
				const askLiveOrder = this.liveOrders[ask.orderHash];
				if (!askLiveOrder) {
					util.logDebug('missing live order for ' + ask.orderHash);
					askIdx++;
					continue;
				}
				const matchBalance = Math.min(bid.balance, ask.balance);
				ordersToMatch.push({
					left: {
						orderHash: bid.orderHash,
						balance: bid.balance
					},
					right: {
						orderHash: ask.orderHash,
						balance: ask.balance
					}
				});
				if (bid.balance < ask.balance) bidIdx++;
				else if (bid.balance > ask.balance) askIdx++;
				else {
					bidIdx++;
					askIdx++;
				}

				bid.balance -= matchBalance;
				ask.balance -= matchBalance;
				bidLiveOrder.balance -= matchBalance;
				askLiveOrder.balance -= matchBalance;

				if (bidIdx >= bidsToMatch.length || askIdx >= asksToMatch.length) done = true;
			}

			if (ordersToMatch.length > 0)
				orderMatchingUtil.matchOrders(this.web3Util, this.pair, ordersToMatch);
		}
	}

	public async startServer(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
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
				10000
			);
		}
	}
}

const orderBookServer = new OrderBookServer();
export default orderBookServer;
