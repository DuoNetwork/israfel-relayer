import {
	Constants as WrapperConstants,
	DualClassWrapper,
	Web3Wrapper
} from '@finbook/duo-contract-wrapper';
import {
	Constants,
	ILiveOrder,
	IOrderBook,
	IOrderBookLevelUpdate,
	IOrderBookSnapshot,
	IOrderBookSnapshotUpdate,
	OrderBookUtil,
	Util
} from '@finbook/israfel-common';
import { ONE_MINUTE_MS } from '../common/constants';
import { IOption, IOrderQueueItem, IOrderUpdate } from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderMatchingUtil from '../utils/orderMatchingUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';

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
		Util.logDebug('receive update from channel: ' + channel);

		if (orderQueueItem.requestor === Constants.DB_ORDER_BOOKS) {
			Util.logDebug('ignore order update requested by self');
			return;
		}

		const { method, liveOrder } = orderQueueItem;
		const orderHash = liveOrder.orderHash;

		if (!this.custodianInTrading) {
			Util.logDebug('custodian not in trading, terminate incoming order');
			if (method !== Constants.DB_TERMINATE) this.terminateOrder(orderHash);
			return;
		}

		if (this.loadingOrders) {
			this.pendingUpdates.push(orderQueueItem);
			Util.logDebug('loading orders, queue update');
			return;
		}

		if (![Constants.DB_ADD, Constants.DB_UPDATE, Constants.DB_TERMINATE].includes(method)) {
			Util.logDebug('invalid method, ignore');
			return;
		}

		if (
			liveOrder.currentSequence <= this.orderSnapshotSequence ||
			(this.processedUpdates[orderHash] &&
				this.processedUpdates[orderHash] >= liveOrder.currentSequence)
		) {
			Util.logDebug('obsolete order, ignore');
			return;
		}

		this.processedUpdates[orderHash] = liveOrder.currentSequence;
		if (method === Constants.DB_TERMINATE && !this.liveOrders[orderHash]) {
			Util.logDebug('terminating order not found in cache, ignore');
			return;
		}

		const orderBookLevelUpdates: IOrderBookLevelUpdate[] = [
			this.updateOrderBook({
				liveOrder: orderQueueItem.liveOrder,
				method: method
			})
		];
		const leftLiveOrder = orderQueueItem.liveOrder;
		if (method !== Constants.DB_TERMINATE && leftLiveOrder.balance > 0) {
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
		const count = OrderBookUtil.updateOrderBook(
			this.orderBook,
			{
				orderHash: orderHash,
				price: liveOrder.price,
				balance: liveOrder.balance,
				initialSequence: liveOrder.initialSequence
			},
			liveOrder.side === Constants.DB_BID,
			method === Constants.DB_TERMINATE
		);

		const orderBookLevelUpdates: IOrderBookLevelUpdate = {
			price: liveOrder.price,
			change:
				(method === Constants.DB_TERMINATE ? 0 : liveOrder.balance) -
				(this.liveOrders[orderHash] ? this.liveOrders[orderHash].balance : 0),
			count: count,
			side: liveOrder.side
		};

		if (method !== Constants.DB_TERMINATE) this.liveOrders[orderHash] = liveOrder;
		else delete this.liveOrders[orderHash];

		return orderBookLevelUpdates;
	}

	public async updateOrderBookSnapshot(orderBookLevelUpdates: IOrderBookLevelUpdate[]) {
		const orderBookSnapshotUpdate: IOrderBookSnapshotUpdate = {
			pair: this.pair,
			updates: [],
			prevVersion: this.orderBookSnapshot.version,
			version: Util.getUTCNowTimestamp()
		};

		for (const update of orderBookLevelUpdates)
			orderBookSnapshotUpdate.updates.push({
				price: update.price,
				change: update.change,
				count: update.count,
				side: update.side
			});

		OrderBookUtil.updateOrderBookSnapshot(this.orderBookSnapshot, orderBookSnapshotUpdate);
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
			Util.logInfo('loaded live orders : ' + Object.keys(this.liveOrders).length);
			this.updateOrderSequences();
			this.orderBook = OrderBookUtil.constructOrderBook(this.liveOrders);
			Util.logDebug('start matchig ordderBook');
			const matchingResult = orderMatchingUtil.findMatchingOrders(
				this.orderBook,
				this.liveOrders,
				false
			);
			matchingResult.orderMatchRequests.forEach(omr =>
				orderMatchingUtil.queueMatchRequest(omr)
			);
			Util.logInfo('completed matching orderBook as a whole in cold start');
			this.orderBookSnapshot = OrderBookUtil.renderOrderBookSnapshot(
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
			method: Constants.DB_TERMINATE,
			status: Constants.DB_RESET,
			requestor: Constants.DB_ORDER_BOOKS,
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
					side: Constants.DB_BID
				})),
				...this.orderBookSnapshot.asks.map(ask => ({
					price: ask.price,
					change: ask.balance,
					count: -ask.count,
					side: Constants.DB_ASK
				}))
			];
			this.orderBook = OrderBookUtil.constructOrderBook({});
			this.orderBookSnapshot = OrderBookUtil.renderOrderBookSnapshot(
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
		global.setInterval(() => this.loadLiveOrders(), ONE_MINUTE_MS * 15);
	}

	public async startServer(option: IOption) {
		this.pair = option.token + '|' + Constants.TOKEN_WETH;
		const tokens = await dynamoUtil.scanTokens();
		const token = tokens.find(t => t.code === option.token);
		if (!token) {
			Util.logInfo('Invalid token, exit');
			return;
		}

		let infura = { token: '' };
		try {
			infura = require('../keys/infura.json');
		} catch (err) {
			Util.logError(JSON.stringify(err));
		}

		this.initialize(
			new DualClassWrapper(
				new Web3Wrapper(
					null,
					(option.env === Constants.DB_LIVE
						? Constants.PROVIDER_INFURA_MAIN
						: Constants.PROVIDER_INFURA_KOVAN) +
						'/' +
						infura.token,
					'',
					option.env === Constants.DB_LIVE
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
