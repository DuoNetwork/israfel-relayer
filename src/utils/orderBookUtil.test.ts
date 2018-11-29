import { IOrderBook, IOrderBookLevel } from '../common/types';
import liveOrders from '../samples/test/liveOrders.json';
import orderBookSnapshot from '../samples/test/orderBookSnapshot.json';
import orderBookUtil from './orderBookUtil';
import util from './util';

const orderLevelsBids: IOrderBookLevel[] = [
	{
		orderHash: 'orderHash1',
		price: 100,
		balance: 20,
		initialSequence: 10
	},
	{
		orderHash: 'orderHash2',
		price: 120,
		balance: 20,
		initialSequence: 11
	},

	{
		orderHash: 'orderHash3',
		price: 100,
		balance: 30,
		initialSequence: 12
	},

	{
		orderHash: 'orderHash4',
		price: 100,
		balance: 20,
		initialSequence: 13
	}
];

test('sortOrderBookLevels | empty bid', () => {
	const emptySide: IOrderBookLevel[] = [];
	orderBookUtil.sortOrderBookLevels(emptySide, true);
	expect(emptySide).toEqual([]);
});

test('sortOrderBookLevels | bid', () => {
	orderBookUtil.sortOrderBookLevels(orderLevelsBids, true);
	expect(orderLevelsBids).toMatchSnapshot();
});

const orderLevelsAsks: IOrderBookLevel[] = [
	{
		orderHash: 'orderHash1',
		price: 120,
		balance: 20,
		initialSequence: 10
	},
	{
		orderHash: 'orderHash2',
		price: 140,
		balance: 20,
		initialSequence: 11
	},

	{
		orderHash: 'orderHash3',
		price: 120,
		balance: 30,
		initialSequence: 12
	},

	{
		orderHash: 'orderHash4',
		price: 120,
		balance: 20,
		initialSequence: 13
	}
];

test('sortOrderBookLevels | empty ask', () => {
	const emptySide: IOrderBookLevel[] = [];
	orderBookUtil.sortOrderBookLevels(emptySide, false);
	expect(emptySide).toEqual([]);
});

test('sortOrderBookLevels | ask', () => {
	orderBookUtil.sortOrderBookLevels(orderLevelsAsks, false);
	expect(orderLevelsAsks).toMatchSnapshot();
});

test('constructOrderBook', () => {
	const liveOrders1 = util.clone(liveOrders);
	expect(orderBookUtil.constructOrderBook(liveOrders1)).toMatchSnapshot();
});

const orderBook: IOrderBook = {
	bids: orderLevelsBids,
	asks: orderLevelsAsks
};

const newLevel = {
	orderHash: 'orderHash2',
	price: 120,
	balance: 20,
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
newLevel.balance = 30;
test('updateOrderBook, isBid true, isTerminate false, existing order', () => {
	orderBookUtil.updateOrderBook(orderBook, newLevel, true, false);
	expect(orderBook).toMatchSnapshot();
});

newLevel.orderHash = 'orderHash5';
newLevel.balance = 30;
newLevel.price = 120;
newLevel.initialSequence = 15;
test('updateOrderBook, isBid true, isTerminate false, not existing order', () => {
	orderBookUtil.updateOrderBook(orderBook, newLevel, true, false);
	expect(orderBook).toMatchSnapshot();
});

const newLevelAsk = {
	orderHash: 'orderHash2',
	price: 140,
	balance: 20,
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
newLevelAsk.balance = 30;
test('updateOrderBook, isBid false, isTerminate false, existing order', () => {
	orderBookUtil.updateOrderBook(orderBook, newLevelAsk, false, false);
	expect(orderBook).toMatchSnapshot();
});

newLevelAsk.orderHash = 'orderHash5';
newLevelAsk.balance = 30;
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
	expect(orderBookUtil.renderOrderBookSnapshot('pair', orderBook)).toMatchSnapshot();
});

const orderBookSnapshotUpdateBid = {
	pair: 'pair',
	updates: [
		{
			price: 110,
			balance: 10,
			count: 1,
			side: 'bid'
		}
	],
	prevVersion: 1234567890000,
	version: 1234567990000
};
test('updateOrderBookSnapshot, bid, existingLevel', () => {
	const orderBookSnapshotTest1 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest1, orderBookSnapshotUpdateBid);
	expect(orderBookSnapshotTest1).toMatchSnapshot();
});

test('updateOrderBookSnapshot, bid, existingLevel, updated to 0', () => {
	orderBookSnapshotUpdateBid.updates[0].balance = -10;
	const orderBookSnapshotTest2 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest2, orderBookSnapshotUpdateBid);
	expect(orderBookSnapshotTest2).toMatchSnapshot();
});

test('updateOrderBookSnapshot, bid, not existingLevel, count > 0', () => {
	orderBookSnapshotUpdateBid.updates[0].balance = 10;
	orderBookSnapshotUpdateBid.updates[0].price = 115;
	const orderBookSnapshotTest3 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest3, orderBookSnapshotUpdateBid);
	expect(orderBookSnapshotTest3).toMatchSnapshot();
});

test('updateOrderBookSnapshot, bid, not existingLevel, count = -1', () => {
	orderBookSnapshotUpdateBid.updates[0].balance = 10;
	orderBookSnapshotUpdateBid.updates[0].price = 115;
	orderBookSnapshotUpdateBid.updates[0].count = -1;
	const orderBookSnapshotTest4 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest4, orderBookSnapshotUpdateBid);
	expect(orderBookSnapshotTest4).toMatchSnapshot();
});

const orderBookSnapshotUpdateAsk = {
	pair: 'pair',
	updates: [
		{
			price: 140,
			balance: 10,
			count: 1,
			side: 'ask'
		}
	],
	prevVersion: 1234567890000,
	version: 1234567990000
};

test('updateOrderBookSnapshot, ask, existingLevel', () => {
	const orderBookSnapshotTest5 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest5, orderBookSnapshotUpdateAsk);
	expect(orderBookSnapshotTest5).toMatchSnapshot();
});

test('updateOrderBookSnapshot, ask, existingLevel, updated to 0', () => {
	orderBookSnapshotUpdateAsk.updates[0].balance = -10;
	const orderBookSnapshotTest6 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest6, orderBookSnapshotUpdateAsk);
	expect(orderBookSnapshotTest6).toMatchSnapshot();
});

test('updateOrderBookSnapshot, ask, not existingLevel, count > 0', () => {
	orderBookSnapshotUpdateAsk.updates[0].balance = 10;
	orderBookSnapshotUpdateAsk.updates[0].price = 145;
	const orderBookSnapshotTest7 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest7, orderBookSnapshotUpdateAsk);
	expect(orderBookSnapshotTest7).toMatchSnapshot();
});

test('updateOrderBookSnapshot, ask, not existingLevel, count = -1', () => {
	orderBookSnapshotUpdateAsk.updates[0].balance = 10;
	orderBookSnapshotUpdateAsk.updates[0].price = 145;
	orderBookSnapshotUpdateAsk.updates[0].count = -1;
	const orderBookSnapshotTest8 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest8, orderBookSnapshotUpdateAsk);
	expect(orderBookSnapshotTest8).toMatchSnapshot();
});
