import { Constants as WrapperConstants, DualClassWrapper, Web3Wrapper } from '@finbook/duo-contract-wrapper';
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
	public custodianInTrading: boolean = false;

	public async handleOrderUpdate(channel: string, orderQueueItem: IOrderQueueItem) {
		util.logDebug('receive update from channel: ' + channel);

		if (orderQueueItem.requestor === CST.DB_ORDER_BOOKS) {
			util.logDebug('ignore order update requested by self');
			return;
		}

		const { method, liveOrder } = orderQueueItem;
		const orderHash = liveOrder.orderHash;

		if (!this.custodianInTrading) {
			util.logDebug('custodian not in trading, terminate incoming order');
			if (method !== CST.DB_TERMINATE) this.terminateOrder(orderHash);
			return;
		}

		if (this.loadingOrders) {
			this.pendingUpdates.push(orderQueueItem);
			util.logDebug('loading orders, queue update');
			return;
		}

		if (![CST.DB_ADD, CST.DB_UPDATE, CST.DB_TERMINATE].includes(method)) {
			util.logDebug('invalid method, ignore');
			return;
		}

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
		if (this.custodianInTrading) {
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
			matchingResult.orderMatchRequests.forEach(omr =>
				orderMatchingUtil.queueMatchRequest(omr)
			);
			util.logInfo('completed matching orderBook as a whole in cold start');
			this.orderBookSnapshot = orderBookUtil.renderOrderBookSnapshot(
				this.pair,
				this.orderBook
			);
			await orderBookPersistenceUtil.publishOrderBookUpdate(
				this.pair,
				this.orderBookSnapshot
			);
			this.loadingOrders = false;
			for (const updateItem of this.pendingUpdates)
				await this.handleOrderUpdate('pending', updateItem);
			this.pendingUpdates = [];
		}
	}

	public terminateOrder(orderHash: string) {
		return orderPersistenceUtil.persistOrder({
			method: CST.DB_TERMINATE,
			status: CST.DB_RESET,
			requestor: CST.DB_ORDER_BOOKS,
			pair: this.pair,
			orderHash: orderHash
		});
	}

	public async checkCustodianState(dualClassWrapper: DualClassWrapper) {
		const state = await dualClassWrapper.getStates();
		this.custodianInTrading = state.state === WrapperConstants.CTD_TRADING;
		if (!this.custodianInTrading) {
			const prevVersion = this.orderBookSnapshot.version;
			const updates = [
				...this.orderBookSnapshot.bids.map(bid => ({
					price: bid.price,
					change: bid.balance,
					count: -bid.count,
					side: CST.DB_BID
				})),
				...this.orderBookSnapshot.asks.map(ask => ({
					price: ask.price,
					change: ask.balance,
					count: -ask.count,
					side: CST.DB_ASK
				}))
			];
			this.orderBook = orderBookUtil.constructOrderBook({});
			this.orderBookSnapshot = orderBookUtil.renderOrderBookSnapshot(
				this.pair,
				this.orderBook
			);
			await orderBookPersistenceUtil.publishOrderBookUpdate(
				this.pair,
				this.orderBookSnapshot,
				{
					pair: this.pair,
					updates: updates,
					prevVersion: prevVersion,
					version: this.orderBookSnapshot.version
				}
			);
			for (const orderHash in this.liveOrders) await this.terminateOrder(orderHash);
			this.liveOrders = {};
			this.pendingUpdates = [];
		}
	}

	public async initialize(dualClassWrapper: DualClassWrapper) {
		await this.checkCustodianState(dualClassWrapper);
		global.setInterval(() => this.checkCustodianState(dualClassWrapper), 10000);

		orderPersistenceUtil.subscribeOrderUpdate(this.pair, (channel, orderQueueItem) =>
			this.handleOrderUpdate(channel, orderQueueItem)
		);

		await this.loadLiveOrders();
		global.setInterval(() => this.loadLiveOrders(), CST.ONE_MINUTE_MS * 15);
	}

	public async startServer(option: IOption) {
		this.pair = option.token + '|' + CST.TOKEN_WETH;
		const tokens = await dynamoUtil.scanTokens();
		const token = tokens.find(t => t.code === option.token);
		if (!token) {
			util.logInfo('Invalid token, exit');
			return;
		}

		let infura = {token: ''};
		try {
			infura = require('../keys/infura.json');
		} catch (err) {
			util.logError(JSON.stringify(err));
		}

		this.initialize(
			new DualClassWrapper(
				new Web3Wrapper(
					null,
					'infura',
					(option.env === CST.DB_LIVE
						? CST.PROVIDER_INFURA_MAIN
						: CST.PROVIDER_INFURA_KOVAN) +
						'/' +
						infura.token,
					option.env === CST.DB_LIVE
				),
				token.custodian
			)
		);
		if (option.server) {
			dynamoUtil.updateStatus(this.pair);
			global.setInterval(
				() => dynamoUtil.updateStatus(this.pair, Object.keys(this.liveOrders).length),
				15000
			);
		}
	}
}

const orderBookServer = new OrderBookServer();
export default orderBookServer;
