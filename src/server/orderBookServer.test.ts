// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import * as CST from '../common/constants';
import liveOrders from '../samples/test/liveOrders.json';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderBookUtil from '../utils/orderBookUtil';
import orderMatchingUtil from '../utils/orderMatchingUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import util from '../utils/util';
import orderBookServer from './orderBookServer';

orderBookServer.pair = 'code1|code2';
orderBookServer.loadingOrders = false;
orderBookServer.custodianInTrading = true;

test('terminateOrder', async () => {
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	await orderBookServer.terminateOrder('orderHash');
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('updateOrderBook add', () => {
	orderBookServer.liveOrders = {};
	orderBookUtil.updateOrderBook = jest.fn(() => 1);
	expect(
		orderBookServer.updateOrderBook({
			liveOrder: {
				orderHash: 'orderHash',
				price: 123,
				balance: 456,
				initialSequence: 111,
				side: CST.DB_BID
			} as any,
			method: CST.DB_ADD
		})
	).toMatchSnapshot();
	expect((orderBookUtil.updateOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookServer.liveOrders).toMatchSnapshot();
});

test('updateOrderBook update', () => {
	orderBookUtil.updateOrderBook = jest.fn(() => 0);
	expect(
		orderBookServer.updateOrderBook({
			liveOrder: {
				orderHash: 'orderHash',
				price: 123,
				balance: 400,
				initialSequence: 111,
				side: CST.DB_BID
			} as any,
			method: CST.DB_UPDATE
		})
	).toMatchSnapshot();
	expect((orderBookUtil.updateOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookServer.liveOrders).toMatchSnapshot();
});

test('updateOrderBook terminate', () => {
	orderBookUtil.updateOrderBook = jest.fn(() => 1);
	expect(
		orderBookServer.updateOrderBook({
			liveOrder: {
				orderHash: 'orderHash',
				price: 123,
				balance: 400,
				initialSequence: 111,
				side: CST.DB_BID
			} as any,
			method: CST.DB_TERMINATE
		})
	).toMatchSnapshot();
	expect((orderBookUtil.updateOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookServer.liveOrders).toEqual({});
});

test('updateOrderBookSnapshot', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	orderBookUtil.updateOrderBookSnapshot = jest.fn();
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve());
	await orderBookServer.updateOrderBookSnapshot([
		{ price: 1, change: 1, count: 0, side: CST.DB_BID },
		{ price: 2, change: 2, count: 1, side: CST.DB_BID }
	]);
	expect((orderBookUtil.updateOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
});

const channel = 'xxx|xxx|code1|code2';
const orderQueueItem = {
	method: CST.DB_ADD,
	status: 'status',
	requestor: 'requestor',
	liveOrder: liveOrders['orderHash1']
};

test('handleOrderUpdate ignore update by self', async () => {
	orderQueueItem.requestor = CST.DB_ORDER_BOOKS;
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates.length).toBe(0);
	expect(orderBookServer.processedUpdates).toEqual({});
});

test('handleOrderUpdate invalid method', async () => {
	orderQueueItem.requestor = 'requestor';
	orderQueueItem.method = 'xxx';
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates.length).toBe(0);
	expect(orderBookServer.processedUpdates).toEqual({});
});

test('handleOrderUpdate current sequence too small', async () => {
	orderQueueItem.method = CST.DB_ADD;
	orderBookServer.orderSnapshotSequence = 100;
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.processedUpdates).toEqual({});
});

test('handleOrderUpdate order processed already', async () => {
	orderQueueItem.method = CST.DB_ADD;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 200;
	orderBookServer.updateOrderBook = jest.fn(() => 'orderBookLevelUpdate');
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.updateOrderBook as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate terminate a non existing liveOrder', async () => {
	orderBookServer.orderSnapshotSequence = 1;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 1;
	orderBookServer.updateOrderBook = jest.fn(() => 'orderBookLevelUpdate');
	orderQueueItem.method = CST.DB_TERMINATE;
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.processedUpdates).toMatchSnapshot();
	expect(orderBookServer.updateOrderBook as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate add', async () => {
	orderBookServer.orderSnapshotSequence = 1;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 1;
	orderBookServer.updateOrderBook = jest.fn(() => 'orderBookLevelUpdate');
	orderBookServer.updateOrderBookSnapshot = jest.fn(() => Promise.resolve());
	orderQueueItem.method = CST.DB_ADD;
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		orderMatchRequests: [],
		orderBookLevelUpdates: []
	}));
	orderMatchingUtil.queueMatchRequest = jest.fn(() => Promise.resolve());
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderMatchingUtil.findMatchingOrders as jest.Mock).toBeCalled();
	expect(orderMatchingUtil.queueMatchRequest as jest.Mock).not.toBeCalled();
	expect((orderBookServer.updateOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookServer.updateOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderUpdate add match', async () => {
	orderBookServer.orderSnapshotSequence = 1;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 1;
	orderBookServer.updateOrderBook = jest.fn(() => 'orderBookLevelUpdate');
	orderBookServer.updateOrderBookSnapshot = jest.fn(() => Promise.resolve());
	orderQueueItem.method = CST.DB_ADD;
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		orderMatchRequests: ['orderMatchRequests'],
		orderBookLevelUpdates: ['orderBookLevelUpdates1', 'orderBookLevelUpdates2']
	}));
	orderMatchingUtil.queueMatchRequest = jest.fn(() => Promise.resolve());
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderMatchingUtil.findMatchingOrders as jest.Mock).toBeCalled();
	expect((orderMatchingUtil.queueMatchRequest as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookServer.updateOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookServer.updateOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderUpdate terminate', async () => {
	orderQueueItem.requestor = CST.DB_ORDER_MATCHER;
	orderBookServer.liveOrders[orderQueueItem.liveOrder.orderHash] = {} as any;
	orderBookServer.orderSnapshotSequence = 1;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 1;
	orderBookServer.updateOrderBook = jest.fn(() => 'orderBookLevelUpdate');
	orderBookServer.updateOrderBookSnapshot = jest.fn(() => Promise.resolve());
	orderQueueItem.method = CST.DB_TERMINATE;
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		orderMatchRequests: [],
		orderBookLevelUpdates: []
	}));
	orderMatchingUtil.queueMatchRequest = jest.fn(() => Promise.resolve());
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderMatchingUtil.findMatchingOrders as jest.Mock).not.toBeCalled();
	expect(orderMatchingUtil.queueMatchRequest as jest.Mock).not.toBeCalled();
	expect((orderBookServer.updateOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookServer.updateOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderUpdate loadingOrders', async () => {
	orderQueueItem.requestor = 'requestor';
	orderBookServer.loadingOrders = true;
	orderQueueItem.method = CST.DB_ADD;
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve());
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates).toMatchSnapshot();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate custodian not in trading terminate', async () => {
	orderBookServer.terminateOrder = jest.fn(() => Promise.resolve());
	orderBookServer.custodianInTrading = false;
	orderQueueItem.requestor = 'requestor';
	orderQueueItem.method = CST.DB_TERMINATE;
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve());
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.terminateOrder as jest.Mock).not.toBeCalled();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate custodian not in trading', async () => {
	orderBookServer.terminateOrder = jest.fn(() => Promise.resolve());
	orderBookServer.custodianInTrading = false;
	orderQueueItem.requestor = 'requestor';
	orderQueueItem.method = CST.DB_ADD;
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve());
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect((orderBookServer.terminateOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('updateOrderSequences', async () => {
	orderBookServer.liveOrders = liveOrders;
	orderBookServer.updateOrderSequences();
	expect(orderBookServer.orderSnapshotSequence).toMatchSnapshot();
	expect(orderBookServer.processedUpdates).toMatchSnapshot();
});

test('loadLiveOrders', async () => {
	orderBookServer.custodianInTrading = true;
	orderPersistenceUtil.getAllLiveOrdersInPersistence = jest.fn(() =>
		Promise.resolve('liveOrders')
	);
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	orderBookUtil.constructOrderBook = jest.fn(() => 'orderBook');
	orderBookUtil.renderOrderBookSnapshot = jest.fn(() => 'orderBookSnapshot');
	orderMatchingUtil.queueMatchRequest = jest.fn(() => Promise.resolve());
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		orderMatchRequests: ['orderMatchRequests'],
		orderBookLevelUpdates: []
	}));
	orderBookServer.updateOrderSequences = jest.fn();
	orderBookServer.handleOrderUpdate = jest.fn(() => Promise.resolve());
	await orderBookServer.loadLiveOrders();
	expect(orderBookServer.updateOrderSequences as jest.Mock).toBeCalled();
	expect(orderBookServer.orderBook).toMatchSnapshot();
	expect(orderBookServer.orderBookSnapshot).toMatchSnapshot();
	expect((orderBookUtil.constructOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookUtil.renderOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderMatchingUtil.findMatchingOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderMatchingUtil.queueMatchRequest as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((orderBookServer.handleOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookServer.pendingUpdates).toEqual([]);
	expect(orderBookServer.loadingOrders).toBeFalsy();
});

test('loadLiveOrders no match', async () => {
	orderBookServer.custodianInTrading = true;
	orderPersistenceUtil.getAllLiveOrdersInPersistence = jest.fn(() =>
		Promise.resolve('liveOrders')
	);
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	orderBookUtil.constructOrderBook = jest.fn(() => 'orderBook');
	orderBookUtil.renderOrderBookSnapshot = jest.fn(() => 'orderBookSnapshot');
	orderMatchingUtil.queueMatchRequest = jest.fn(() => Promise.resolve());
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		orderMatchRequests: [],
		orderBookLevelUpdates: []
	}));
	orderBookServer.updateOrderSequences = jest.fn();
	orderBookServer.handleOrderUpdate = jest.fn(() => Promise.resolve());
	await orderBookServer.loadLiveOrders();
	expect(orderBookServer.updateOrderSequences as jest.Mock).toBeCalled();
	expect(orderBookServer.orderBook).toMatchSnapshot();
	expect(orderBookServer.orderBookSnapshot).toMatchSnapshot();
	expect((orderBookUtil.constructOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookUtil.renderOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderMatchingUtil.findMatchingOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderMatchingUtil.queueMatchRequest as jest.Mock).not.toBeCalled();
	expect(
		(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(orderBookServer.handleOrderUpdate as jest.Mock).not.toBeCalled();
	expect(orderBookServer.pendingUpdates).toEqual([]);
	expect(orderBookServer.loadingOrders).toBeFalsy();
});

test('loadLiveOrders custodian not in trading', async () => {
	orderBookServer.custodianInTrading = false;
	orderPersistenceUtil.getAllLiveOrdersInPersistence = jest.fn(() =>
		Promise.resolve('liveOrders')
	);
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	orderBookUtil.constructOrderBook = jest.fn(() => 'orderBook');
	orderBookUtil.renderOrderBookSnapshot = jest.fn(() => 'orderBookSnapshot');
	orderMatchingUtil.queueMatchRequest = jest.fn(() => Promise.resolve());
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		orderMatchRequests: [],
		orderBookLevelUpdates: []
	}));
	orderBookServer.updateOrderSequences = jest.fn();
	orderBookServer.handleOrderUpdate = jest.fn(() => Promise.resolve());
	await orderBookServer.loadLiveOrders();
	expect(orderBookServer.updateOrderSequences as jest.Mock).not.toBeCalled();
	expect(orderBookUtil.constructOrderBook as jest.Mock).not.toBeCalled();
	expect(orderBookUtil.renderOrderBookSnapshot as jest.Mock).not.toBeCalled();
	expect(orderMatchingUtil.findMatchingOrders as jest.Mock).not.toBeCalled();
	expect(orderMatchingUtil.queueMatchRequest as jest.Mock).not.toBeCalled();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
	expect(orderBookServer.handleOrderUpdate as jest.Mock).not.toBeCalled();
});

test('checkCustodianState not in trading', async () => {
	const dualClassWrapper = {
		getStates: jest.fn(() =>
			Promise.resolve({
				state: 'state'
			})
		)
	};

	orderBookServer.liveOrders = {
		orderHash: 'liveOrder' as any
	};
	orderBookServer.pendingUpdates = ['pendingUpdates' as any];
	orderBookServer.orderBookSnapshot = {
		pair: 'pair',
		version: 123,
		bids: [{ price: 123, balance: 456, count: 2 }],
		asks: [{ price: 456, balance: 123, count: 3 }]
	};
	orderBookServer.terminateOrder = jest.fn(() => Promise.resolve());
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve());
	orderBookUtil.constructOrderBook = jest.fn(() => 'orderBook');
	orderBookUtil.renderOrderBookSnapshot = jest.fn(() => ({
		pair: 'orderBookSnapshot',
		version: 1234567890
	}));
	await orderBookServer.checkCustodianState(dualClassWrapper as any);
	expect(orderBookServer.custodianInTrading).toBeFalsy();
	expect(orderBookServer.liveOrders).toEqual({});
	expect(orderBookServer.pendingUpdates).toEqual([]);
	expect(orderBookServer.orderBook).toMatchSnapshot();
	expect(orderBookServer.orderBookSnapshot).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((orderBookServer.terminateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('checkCustodianState in trading', async () => {
	const dualClassWrapper = {
		getStates: jest.fn(() =>
			Promise.resolve({
				state: 'Trading'
			})
		)
	};
	orderBookServer.terminateOrder = jest.fn(() => Promise.resolve());
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve());

	await orderBookServer.checkCustodianState(dualClassWrapper as any);
	expect(orderBookServer.custodianInTrading).toBeTruthy();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
	expect(orderBookServer.terminateOrder as jest.Mock).not.toBeCalled();
});
