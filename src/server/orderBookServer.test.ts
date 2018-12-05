import * as CST from '../common/constants';
import liveOrders from '../samples/test/liveOrders.json';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderBookUtil from '../utils/orderBookUtil';
import orderMatchingUtil from '../utils/orderMatchingUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import util from '../utils/util';
import orderBookServer from './orderBookServer';

orderBookServer.pair = 'code1|code2';
const channel = 'xxx|xxx|code1|code2';

const orderQueueItem = {
	method: CST.DB_ADD,
	status: 'status',
	requestor: 'requestor',
	liveOrder: liveOrders['orderHash1']
};

test('handleOrderUpdate, method wrong, not loadingPairs', async () => {
	orderQueueItem.method = 'xxx';
	orderBookServer.loadingOrders = false;
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates.length).toBe(0);
	expect(orderBookServer.processedUpdates).toMatchSnapshot();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate, current sequence too small', async () => {
	orderBookServer.loadingOrders = false;
	orderQueueItem.method = CST.DB_ADD;
	orderBookServer.orderSnapshotSequence = 100;
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates.length).toBe(0);
	expect(orderBookServer.processedUpdates).toMatchSnapshot();
	expect(util.getUTCNowTimestamp as jest.Mock).not.toBeCalled();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate, order processed already', async () => {
	orderQueueItem.method = CST.DB_ADD;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 200;
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates.length).toBe(0);
	expect(orderBookServer.processedUpdates).toMatchSnapshot();
	expect(util.getUTCNowTimestamp as jest.Mock).not.toBeCalled();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate, terminate a non existing liveOrder', async () => {
	orderBookServer.orderSnapshotSequence = 1;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 1;
	orderQueueItem.method = CST.DB_TERMINATE;
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates.length).toBe(0);
	expect(orderBookServer.processedUpdates).toMatchSnapshot();
	expect(util.getUTCNowTimestamp as jest.Mock).not.toBeCalled();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate, update orderBooks , add', async () => {
	orderBookServer.orderSnapshotSequence = 1;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 1;
	orderQueueItem.method = CST.DB_ADD;
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates.length).toBe(0);
	expect(orderBookServer.processedUpdates).toMatchSnapshot();
	expect(orderBookServer.liveOrders).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(orderBookServer.orderBook).toMatchSnapshot();
	expect(orderBookServer.orderBookSnapshot).toMatchSnapshot();
});

test('handleOrderUpdate, update orderBooks , terminate', async () => {
	orderBookServer.orderSnapshotSequence = 1;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 1;
	orderQueueItem.method = CST.DB_TERMINATE;
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates.length).toBe(0);
	expect(orderBookServer.processedUpdates).toMatchSnapshot();
	expect(orderBookServer.liveOrders).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(orderBookServer.orderBook).toMatchSnapshot();
	expect(orderBookServer.orderBookSnapshot).toMatchSnapshot();
});

test('handleOrderUpdate,loading Pairs', async () => {
	orderBookServer.loadingOrders = true;
	orderQueueItem.method = CST.DB_ADD;
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates).toMatchSnapshot();
	expect(orderBookServer.pendingUpdates.length).toBe(1);
	expect(orderBookServer.processedUpdates).toMatchSnapshot();
	expect(util.getUTCNowTimestamp as jest.Mock).not.toBeCalled();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('updateOrderSequences', async () => {
	orderBookServer.liveOrders = liveOrders;
	orderBookServer.updateOrderSequences();
	expect(orderBookServer.orderSnapshotSequence).toMatchSnapshot();
	expect(orderBookServer.processedUpdates).toMatchSnapshot();
});

test('loadLiveOrders', async () => {
	orderPersistenceUtil.getAllLiveOrdersInPersistence = jest.fn(() => Promise.resolve('liveOrders'));
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	orderBookUtil.constructOrderBook = jest.fn(() => 'orderBook');
	orderBookUtil.renderOrderBookSnapshot = jest.fn(() => 'orderBookSnapshot');
	orderMatchingUtil.matchOrders = jest.fn(() => Promise.resolve());
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		ordersToMatch: ['ordersToMatch'],
		orderBookLevelUpdates: []
	}));
	orderBookServer.updateOrderSequences = jest.fn();
	orderBookServer.handleOrderUpdate = jest.fn(() => Promise.resolve());
	await orderBookServer.loadLiveOrders();
	expect(orderBookServer.updateOrderSequences as jest.Mock).toBeCalled();
	expect(orderBookServer.orderBook).toMatchSnapshot();
	expect(orderBookServer.orderBookSnapshot).toMatchSnapshot();
	expect(
		(orderBookUtil.constructOrderBook as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(
		(orderBookUtil.renderOrderBookSnapshot as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(
		(orderMatchingUtil.findMatchingOrders as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(
		(orderMatchingUtil.matchOrders as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((orderBookServer.handleOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookServer.pendingUpdates).toEqual([]);
	expect(orderBookServer.loadingOrders).toBeFalsy();
});
