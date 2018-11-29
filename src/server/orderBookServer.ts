import * as CST from '../common/constants';
import {
	ILiveOrder,
	IMatchingCandidate,
	IOption,
	IOrderBook,
	// IOrderBookLevel,
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
// import redisUtil from '../utils/redisUtil';
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

		const leftLiveOrder = orderQueueItem.liveOrder;
		if (this.web3Util && method === CST.DB_ADD) {
			let matchable = true;
			const isLeftOrderBid = leftLiveOrder.side === CST.DB_BID;
			let rightLiveOrder;
			const ordersToMatch: IMatchingCandidate[] = [];
			while (matchable) {
				if (
					(isLeftOrderBid && !this.orderBook.asks.length) ||
					(!isLeftOrderBid && !this.orderBook.bids.length)
				) {
					matchable = false;
					break;
				}
				if (isLeftOrderBid) {
					const rightLevel = this.orderBook.asks.find(level => level.balance > 0);
					if (!rightLevel) {
						matchable = false;
						break;
					}
					rightLiveOrder = this.liveOrders[rightLevel.orderHash];
				} else {
					const rightLevel = this.orderBook.bids.find(level => level.balance > 0);
					if (!rightLevel) {
						matchable = false;
						break;
					}
					rightLiveOrder = this.liveOrders[rightLevel.orderHash];
				}

				if (
					(isLeftOrderBid && leftLiveOrder.price < rightLiveOrder.price) ||
					(!isLeftOrderBid && leftLiveOrder.price > rightLiveOrder.price)
				) {
					matchable = false;
					break;
				}
				const matchedAmt = Math.min(leftLiveOrder.balance, rightLiveOrder.balance);
				ordersToMatch.push({
					leftHash: leftLiveOrder.orderHash,
					rightHash: rightLiveOrder.orderHash,
					amount: matchedAmt
				});
				util.logDebug('matchinged amount ' + matchedAmt);
				leftLiveOrder.balance = leftLiveOrder.balance - matchedAmt;
				rightLiveOrder.balance = rightLiveOrder.balance - matchedAmt;
			}
			if (this.web3Util && ordersToMatch.length > 0) {
				await this.updateOrderBook([
					{
						liveOrder: leftLiveOrder,
						method: CST.DB_UPDATE
					},
					{
						liveOrder: rightLiveOrder as ILiveOrder,
						method: CST.DB_UPDATE
					}
				]);

				let currentNonce = await this.web3Util.getTransactionCount();
				ordersToMatch.map(order =>
					orderMatchingUtil.matchOrders(this.web3Util as Web3Util, order, {
						nonce: currentNonce++
					})
				);
				return;
			}
		}
		await this.updateOrderBook([
			{
				liveOrder: leftLiveOrder,
				method: method
			}
		]);
	}

	// public async processMatchingResult(
	// 	matchResult: IMatchingOrderResult,
	// 	leftLiveOrder: ILiveOrder
	// ): Promise<ILiveOrder[]> {
	// 	const resLeft = matchResult.left;
	// 	const resRight = matchResult.right;
	// 	leftLiveOrder.amount = resLeft.newBalance;
	// 	await this.updateOrderBook(leftLiveOrder, resLeft.method);
	// 	const rightLiveOrder = this.liveOrders[resRight.orderHash];
	// 	rightLiveOrder.amount = resRight.newBalance;
	// 	await this.updateOrderBook(rightLiveOrder, resRight.method);
	// 	return [leftLiveOrder, rightLiveOrder];
	// }

	public async updateOrderBook(orderUpdates: IOrderUpdateInput[]) {
		const orderBookSnapshotUpdate: IOrderBookSnapshotUpdate = {
			pair: this.pair,
			updates: [],
			prevVersion: this.orderBookSnapshot.version,
			version: util.getUTCNowTimestamp()
		};
		for (const update of orderUpdates) {
			const liveOrder = update.liveOrder;
			const method = update.method;
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

			orderBookSnapshotUpdate.updates.push({
				price: liveOrder.price,
				balance:
					(method === CST.DB_TERMINATE ? 0 : liveOrder.balance) -
					(this.liveOrders[orderHash] ? this.liveOrders[orderHash].balance : 0),
				count: count,
				side: liveOrder.side
			});

			if (method !== CST.DB_TERMINATE) this.liveOrders[orderHash] = liveOrder;
			else delete this.liveOrders[orderHash];
		}

		if (!this.loadingOrders) {
			orderBookUtil.updateOrderBookSnapshot(this.orderBookSnapshot, orderBookSnapshotUpdate);
			await orderBookPersistenceUtil.publishOrderBookUpdate(
				this.pair,
				this.orderBookSnapshot,
				orderBookSnapshotUpdate
			);
		}
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

			const ordersToMatch = [];
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
				ordersToMatch.push([bid.orderHash, ask.orderHash, matchBalance]);
				bid.balance -= matchBalance;
				ask.balance -= matchBalance;
				bidLiveOrder.balance -= matchBalance;
				askLiveOrder.balance -= matchBalance;
				if (bid.balance < ask.balance) bidIdx++;
				else if (bid.balance > ask.balance) askIdx++;
				else {
					bidIdx++;
					askIdx++;
				}

				if (bidIdx >= bidsToMatch.length || askIdx >= asksToMatch.length) done = true;
			}
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
