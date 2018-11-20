import * as CST from '../common/constants';
// import { ILiveOrder } from '../common/types';
import liveOrders from '../samples/test/liveOrders.json';
import orderBookUtil from '../utils/orderBookUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import util from '../utils/util';
import orderBookServer from './orderBookServer';

// const liveOrders: { [orderhash: string]: ILiveOrder } =
orderBookServer.pair = 'pair';
const channel = 'xxx|xxx|pair';

const orderQueueItem = {
	method: CST.DB_ADD,
	liveOrder: liveOrders['orderHash1']
};
test('handleOrderUpdate, pair wrong', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	orderBookUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	await orderBookServer.handleOrderUpdate('xxx', orderQueueItem);
	expect(orderBookServer.pendingUpdates.length).toBe(0);
	expect(orderBookServer.processedUpdates).toMatchObject({});
	expect(util.getUTCNowTimestamp as jest.Mock).not.toBeCalled();
	expect(orderBookUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate, method wrong, not loadingPairs', async () => {
	orderQueueItem.method = 'xxx';
	orderBookServer.loadingOrders = false;
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	orderBookUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates.length).toBe(0);
	expect(orderBookServer.processedUpdates).toMatchObject({});
	expect(util.getUTCNowTimestamp as jest.Mock).not.toBeCalled();
	expect(orderBookUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate,loading Pairs', async () => {
	orderBookServer.loadingOrders = true;
	orderQueueItem.method = CST.DB_ADD;
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	orderBookUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates).toMatchSnapshot();
	expect(orderBookServer.pendingUpdates.length).toBe(1);
	expect(orderBookServer.processedUpdates).toMatchObject({});
	expect(util.getUTCNowTimestamp as jest.Mock).not.toBeCalled();
	expect(orderBookUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('updateOrderSequences', async () => {
	orderBookServer.liveOrders = liveOrders;
	orderBookServer.updateOrderSequences();
	expect(orderBookServer.orderSnapshotSequence).toMatchSnapshot();
});

test('loadLiveOrders', async () => {
	orderPersistenceUtil.getAllLiveOrdersInPersistence = jest.fn(() => Promise.resolve(liveOrders));
	orderBookUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	orderBookServer.handleOrderUpdate = jest.fn(() => Promise.resolve());
	expect(orderBookServer.loadingOrders).toBeTruthy();
	await orderBookServer.loadLiveOrders();
	expect(orderBookServer.orderBook).toMatchSnapshot();
	expect(orderBookServer.orderBookSnapshot).toMatchSnapshot();
	expect((orderBookUtil.publishOrderBookUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookServer.handleOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookServer.pendingUpdates).toMatchSnapshot();
	expect(orderBookServer.loadingOrders).toBeFalsy();
});
