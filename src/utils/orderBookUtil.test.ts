import { ILiveOrder, IOrderBook, IOrderBookLevel } from '../common/types';
import orderBookSnapshot from '../samples/test/orderBookSnapshot.json';
import orderBookUtil from './orderBookUtil';
import redisUtil from './redisUtil';
import util from './util';

test('subscribeOrderBookUpdate', () => {
	redisUtil.onOrderUpdate = jest.fn();
	redisUtil.subscribe = jest.fn();
	orderBookUtil.subscribeOrderBookUpdate('pair', (() => ({})) as any);
	expect((redisUtil.subscribe as jest.Mock).mock.calls).toMatchSnapshot();
})

test('unsubscribeOrderBookUpdate', () => {
	redisUtil.unsubscribe = jest.fn();
	orderBookUtil.unsubscribeOrderBookUpdate('pair');
	expect((redisUtil.unsubscribe as jest.Mock).mock.calls).toMatchSnapshot();
})

const orderLevelsBids: IOrderBookLevel[] = [
	{
		orderHash: 'orderHash1',
		price: 100,
		amount: 20,
		initialSequence: 10
	},
	{
		orderHash: 'orderHash2',
		price: 120,
		amount: 20,
		initialSequence: 11
	},

	{
		orderHash: 'orderHash3',
		price: 100,
		amount: 30,
		initialSequence: 12
	},

	{
		orderHash: 'orderHash4',
		price: 100,
		amount: 20,
		initialSequence: 13
	}
];

test('sortOrderBookLevels | bid', () => {
	orderBookUtil.sortOrderBookLevels(orderLevelsBids, true);
	expect(orderLevelsBids).toMatchSnapshot();
});

const orderLevelsAsks: IOrderBookLevel[] = [
	{
		orderHash: 'orderHash1',
		price: 120,
		amount: 20,
		initialSequence: 10
	},
	{
		orderHash: 'orderHash2',
		price: 140,
		amount: 20,
		initialSequence: 11
	},

	{
		orderHash: 'orderHash3',
		price: 120,
		amount: 30,
		initialSequence: 12
	},

	{
		orderHash: 'orderHash4',
		price: 120,
		amount: 20,
		initialSequence: 13
	}
];

test('sortOrderBookLevels | ask', () => {
	orderBookUtil.sortOrderBookLevels(orderLevelsAsks, false);
	expect(orderLevelsAsks).toMatchSnapshot();
});

const liveOrders: { [orderhash: string]: ILiveOrder } = {
	orderHash1: {
		account: 'account1',
		pair: 'pair',
		orderHash: 'orderHash1',
		price: 100,
		amount: 10,
		balance: 5,
		fill: 1,
		side: 'bid',
		initialSequence: 1,
		currentSequence: 5
	},
	orderHash2: {
		account: 'account2',
		pair: 'pair',
		orderHash: 'orderHash2',
		price: 110,
		amount: 10,
		balance: 5,
		fill: 1,
		side: 'bid',
		initialSequence: 2,
		currentSequence: 6
	},
	orderHash3: {
		account: 'account3',
		pair: 'pair',
		orderHash: 'orderHash3',
		price: 100,
		amount: 20,
		balance: 5,
		fill: 1,
		side: 'bid',
		initialSequence: 3,
		currentSequence: 7
	},
	orderHash4: {
		account: 'account2',
		pair: 'pair',
		orderHash: 'orderHash4',
		price: 100,
		amount: 10,
		balance: 5,
		fill: 1,
		side: 'bid',
		initialSequence: 4,
		currentSequence: 8
	},
	orderHash5: {
		account: 'account5',
		pair: 'pair',
		orderHash: 'orderHash5',
		price: 110,
		amount: 10,
		balance: 5,
		fill: 1,
		side: 'ask',
		initialSequence: 9,
		currentSequence: 13
	},
	orderHash6: {
		account: 'account6',
		pair: 'pair',
		orderHash: 'orderHash6',
		price: 120,
		amount: 10,
		balance: 5,
		fill: 1,
		side: 'ask',
		initialSequence: 10,
		currentSequence: 14
	},
	orderHash7: {
		account: 'account7',
		pair: 'pair',
		orderHash: 'orderHash7',
		price: 110,
		amount: 20,
		balance: 5,
		fill: 1,
		side: 'ask',
		initialSequence: 11,
		currentSequence: 15
	},
	orderHash8: {
		account: 'account8',
		pair: 'pair',
		orderHash: 'orderHash8',
		price: 110,
		amount: 10,
		balance: 5,
		fill: 1,
		side: 'ask',
		initialSequence: 12,
		currentSequence: 16
	}
};

test('constructOrderBook', () =>
	expect(orderBookUtil.constructOrderBook(liveOrders)).toMatchSnapshot());

const orderBook: IOrderBook = {
	bids: orderLevelsBids,
	asks: orderLevelsAsks
};

const newLevel = {
	orderHash: 'orderHash2',
	price: 120,
	amount: 20,
	initialSequence: 11
};
test('updateOrderBook, isBid true, isTerminate true', () => {
	orderBookUtil.updateOrderBook(orderBook, newLevel, true, true);
	expect(orderBook).toMatchSnapshot();
});

newLevel.orderHash = 'xxx';
test('updateOrderBook, isBid true, isTerminate true, newLevel does not exist', () => {
	orderBookUtil.updateOrderBook(orderBook, newLevel, true, true);
	expect(orderBook).toMatchSnapshot();
});

newLevel.orderHash = 'orderHash2';
newLevel.amount = 30;
test('updateOrderBook, isBid true, isTerminate false, existing order', () => {
	orderBookUtil.updateOrderBook(orderBook, newLevel, true, false);
	expect(orderBook).toMatchSnapshot();
});

newLevel.orderHash = 'orderHash5';
newLevel.amount = 30;
newLevel.price = 120;
newLevel.initialSequence = 15;
test('updateOrderBook, isBid true, isTerminate false, not existing order', () => {
	orderBookUtil.updateOrderBook(orderBook, newLevel, true, false);
	expect(orderBook).toMatchSnapshot();
});

const newLevelAsk = {
	orderHash: 'orderHash2',
	price: 140,
	amount: 20,
	initialSequence: 11
};
test('updateOrderBook, isBid false, isTerminate true', () => {
	orderBookUtil.updateOrderBook(orderBook, newLevelAsk, false, true);
	expect(orderBook).toMatchSnapshot();
});

newLevelAsk.orderHash = 'xxx';
test('updateOrderBook, isBid false, isTerminate true, newLevel does not exist', () => {
	orderBookUtil.updateOrderBook(orderBook, newLevelAsk, false, true);
	expect(orderBook).toMatchSnapshot();
});

newLevelAsk.orderHash = 'orderHash2';
newLevelAsk.amount = 30;
test('updateOrderBook, isBid false, isTerminate false, existing order', () => {
	orderBookUtil.updateOrderBook(orderBook, newLevelAsk, false, false);
	expect(orderBook).toMatchSnapshot();
});

newLevelAsk.orderHash = 'orderHash5';
newLevelAsk.amount = 30;
newLevelAsk.price = 140;
newLevelAsk.initialSequence = 15;
test('updateOrderBook, isBid false, isTerminate false, not existing order', () => {
	orderBookUtil.updateOrderBook(orderBook, newLevelAsk, false, false);
	expect(orderBook).toMatchSnapshot();
});

test('renderOrderBookSnapshotSide', () => {
	expect(orderBookUtil.renderOrderBookSnapshotSide(orderLevelsBids)).toMatchSnapshot();
	expect(orderBookUtil.renderOrderBookSnapshotSide(orderLevelsAsks)).toMatchSnapshot();
});

test('renderOrderBookSnapshot', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890000);
	expect(orderBookUtil.renderOrderBookSnapshot(orderBook)).toMatchSnapshot();
});

const orderBookSnapshotUpdateBid = {
	pair: 'pair',
	price: 110,
	amount: 10,
	count: 1,
	side: 'bid',
	timestamp: 1234567990000
};
test('updateOrderBookSnapshot, bid, existingLevel', () => {
	const orderBookSnapshotTest1 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest1, orderBookSnapshotUpdateBid);
	expect(orderBookSnapshotTest1).toMatchSnapshot();
});

test('updateOrderBookSnapshot, bid, existingLevel, updated to 0', () => {
	orderBookSnapshotUpdateBid.amount = -10;
	const orderBookSnapshotTest2 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest2, orderBookSnapshotUpdateBid);
	expect(orderBookSnapshotTest2).toMatchSnapshot();
});

test('updateOrderBookSnapshot, bid, not existingLevel, count > 0', () => {
	orderBookSnapshotUpdateBid.amount = 10;
	orderBookSnapshotUpdateBid.price = 115;
	const orderBookSnapshotTest3 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest3, orderBookSnapshotUpdateBid);
	expect(orderBookSnapshotTest3).toMatchSnapshot();
});

test('updateOrderBookSnapshot, bid, not existingLevel, count = -1', () => {
	orderBookSnapshotUpdateBid.amount = 10;
	orderBookSnapshotUpdateBid.price = 115;
	orderBookSnapshotUpdateBid.count = -1;
	const orderBookSnapshotTest4 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest4, orderBookSnapshotUpdateBid);
	expect(orderBookSnapshotTest4).toMatchSnapshot();
});

const orderBookSnapshotUpdateAsk = {
	pair: 'pair',
	price: 140,
	amount: 10,
	count: 1,
	side: 'ask',
	timestamp: 1234567990000
};

test('updateOrderBookSnapshot, ask, existingLevel', () => {
	const orderBookSnapshotTest5 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest5, orderBookSnapshotUpdateAsk);
	expect(orderBookSnapshotTest5).toMatchSnapshot();
});

test('updateOrderBookSnapshot, ask, existingLevel, updated to 0', () => {
	orderBookSnapshotUpdateAsk.amount = -10;
	const orderBookSnapshotTest6 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest6, orderBookSnapshotUpdateAsk);
	expect(orderBookSnapshotTest6).toMatchSnapshot();
});

test('updateOrderBookSnapshot, ask, not existingLevel, count > 0', () => {
	orderBookSnapshotUpdateAsk.amount = 10;
	orderBookSnapshotUpdateAsk.price = 145;
	const orderBookSnapshotTest7 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest7, orderBookSnapshotUpdateAsk);
	expect(orderBookSnapshotTest7).toMatchSnapshot();
});

test('updateOrderBookSnapshot, ask, not existingLevel, count = -1', () => {
	orderBookSnapshotUpdateAsk.amount = 10;
	orderBookSnapshotUpdateAsk.price = 145;
	orderBookSnapshotUpdateAsk.count = -1;
	const orderBookSnapshotTest8 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest8, orderBookSnapshotUpdateAsk);
	expect(orderBookSnapshotTest8).toMatchSnapshot();
});

test('publishOrderBookUpdate, with update', async () => {

	const orderBookSnapshotUpdate = {
		pair: 'pair',
		price: 1,
		amount: 2,
		count: 3,
		side: 'ask',
		timestamp: 1234567990000
	}
	redisUtil.publish = jest.fn(() => Promise.resolve({}));
	redisUtil.set = jest.fn(() => Promise.resolve({}));
	const res = await orderBookUtil.publishOrderBookUpdate('pair', orderBookSnapshot, orderBookSnapshotUpdate);
	expect((redisUtil.set as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock).mock.calls).toMatchSnapshot();
	expect(res).toBeTruthy();
});

test('publishOrderBookUpdate, withoutsnpashot update', async () => {
	redisUtil.publish = jest.fn(() => Promise.resolve({}));
	redisUtil.set = jest.fn(() => Promise.resolve({}));
	const res = await orderBookUtil.publishOrderBookUpdate('pair', orderBookSnapshot);
	expect((redisUtil.set as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock)).not.toBeCalled();
	expect(res).toBeTruthy();
});

test('publishOrderBookUpdate, throw Error', async () => {
	redisUtil.publish = jest.fn(() => Promise.resolve({}));
	redisUtil.set = jest.fn(() => Promise.reject());
	const res = await orderBookUtil.publishOrderBookUpdate('pair', orderBookSnapshot);
	expect((redisUtil.set as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock)).not.toBeCalled();
	expect(res).toBeFalsy();
});

test('getOrderBookSnapshot , with result', async () => {
	redisUtil.get = jest.fn(() => Promise.resolve(JSON.stringify(orderBookSnapshot)));
	const res = await orderBookUtil.getOrderBookSnapshot('pair');
	expect((redisUtil.get as jest.Mock).mock.calls).toMatchSnapshot();
	expect(res).toMatchSnapshot();
});

test('getOrderBookSnapshot , without result', async () => {
	redisUtil.get = jest.fn(() => Promise.resolve(''));
	const res = await orderBookUtil.getOrderBookSnapshot('pair');
	expect((redisUtil.get as jest.Mock).mock.calls).toMatchSnapshot();
	expect(res).toMatchSnapshot();
});
