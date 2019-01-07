import { IOrderBook, IOrderBookLevel } from '../common/types';
import liveOrders from '../samples/test/liveOrders.json';
import orderBookSnapshot from '../samples/test/orderBookSnapshot.json';
import orderBookUtil from './orderBookUtil';
import util from './util';

const orderLevelsBids: IOrderBookLevel[] = [
	{
		orderHash: 'orderHash1',
		price: 120,
		balance: 20,
		initialSequence: 11
	},
	{
		orderHash: 'orderHash2',
		price: 100,
		balance: 20,
		initialSequence: 10
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
		price: 120,
		balance: 30,
		initialSequence: 12
	},
	{
		orderHash: 'orderHash3',
		price: 120,
		balance: 20,
		initialSequence: 13
	},
	{
		orderHash: 'orderHash4',
		price: 140,
		balance: 20,
		initialSequence: 11
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

test('constructOrderBook, with zero balance liveOrder', () => {
	const liveOrders2 = util.clone(liveOrders);
	liveOrders2.orderHash1.balance = 0;
	expect(orderBookUtil.constructOrderBook(liveOrders2)).toMatchSnapshot();
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

test('updateOrderBook, isBid true, isTerminate false, existing order', () => {
	newLevel.balance = 30;
	expect(orderBookUtil.updateOrderBook(orderBook, newLevel, true, false)).toBe(0);
	expect(orderBook).toMatchSnapshot();
});

test('updateOrderBook, isBid true, isTerminate false, existing order, balance 0', () => {
	newLevel.balance = 0;
	expect(orderBookUtil.updateOrderBook(orderBook, newLevel, true, false)).toBe(-1);
	expect(orderBook).toMatchSnapshot();
});

test('updateOrderBook, isBid true, isTerminate true existing balance 0', () => {
	expect(orderBookUtil.updateOrderBook(orderBook, newLevel, true, true)).toBe(0);
	expect(orderBook).toMatchSnapshot();
});

test('updateOrderBook, isBid true, isTerminate false, not existing order', () => {
	newLevel.orderHash = 'orderHash5';
	newLevel.balance = 30;
	newLevel.price = 120;
	newLevel.initialSequence = 15;
	expect(orderBookUtil.updateOrderBook(orderBook, newLevel, true, false)).toBe(1);
	expect(orderBook).toMatchSnapshot();
});

test('updateOrderBook, isBid true, isTerminate true existing balance not 0', () => {
	expect(orderBookUtil.updateOrderBook(orderBook, newLevel, true, true)).toBe(-1);
	expect(orderBook).toMatchSnapshot();
});

test('updateOrderBook, isBid true, isTerminate true, newLevel does not exist', () => {
	newLevel.orderHash = 'xxx';
	expect(orderBookUtil.updateOrderBook(orderBook, newLevel, true, true)).toBe(0);
	expect(orderBook).toMatchSnapshot();
});

const newLevelAsk = {
	orderHash: 'orderHash2',
	price: 140,
	balance: 20,
	initialSequence: 11
};
test('updateOrderBook, isBid false, isTerminate false, existing order', () => {
	newLevelAsk.orderHash = 'orderHash2';
	newLevelAsk.balance = 30;
	expect(orderBookUtil.updateOrderBook(orderBook, newLevelAsk, false, false)).toBe(0);
	expect(orderBook).toMatchSnapshot();
});

test('updateOrderBook, isBid false, isTerminate false, existing order, balance 0', () => {
	newLevelAsk.balance = 0;
	expect(orderBookUtil.updateOrderBook(orderBook, newLevelAsk, false, false)).toBe(-1);
	expect(orderBook).toMatchSnapshot();
});

test('updateOrderBook, isBid false, isTerminate true', () => {
	expect(orderBookUtil.updateOrderBook(orderBook, newLevelAsk, false, true)).toBe(0);
	expect(orderBook).toMatchSnapshot();
});

test('updateOrderBook, isBid false, isTerminate false, not existing order', () => {
	newLevelAsk.orderHash = 'orderHash5';
	newLevelAsk.balance = 30;
	newLevelAsk.price = 140;
	newLevelAsk.initialSequence = 15;
	expect(orderBookUtil.updateOrderBook(orderBook, newLevelAsk, false, false)).toBe(1);
	expect(orderBook).toMatchSnapshot();
});

test('updateOrderBook, isBid false, isTerminate true', () => {
	expect(orderBookUtil.updateOrderBook(orderBook, newLevelAsk, false, true)).toBe(-1);
	expect(orderBook).toMatchSnapshot();
});

test('renderOrderBookSnapshotSide', () => {
	expect(orderBookUtil.renderOrderBookSnapshotSide(orderLevelsBids)).toMatchSnapshot();
});

test('renderOrderBookSnapshotSide, with zero level balance', () => {
	const orderLevelsBids1 = util.clone(orderLevelsBids);
	orderLevelsBids1[0].balance = 0;
	expect(orderBookUtil.renderOrderBookSnapshotSide(orderLevelsBids1)).toMatchSnapshot();
});

test('renderOrderBookSnapshotSide, with zero level count', () => {
	const orderLevelsBids1: IOrderBookLevel[] = util.clone(orderLevelsBids);
	orderLevelsBids1.forEach(bid => (bid.balance = 0));
	expect(orderBookUtil.renderOrderBookSnapshotSide(orderLevelsBids1)).toMatchSnapshot();
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
			change: 10,
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
	orderBookSnapshotUpdateBid.updates[0].change = -10;
	const orderBookSnapshotTest2 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest2, orderBookSnapshotUpdateBid);
	expect(orderBookSnapshotTest2).toMatchSnapshot();
});

test('updateOrderBookSnapshot, bid, not existingLevel, count > 0', () => {
	orderBookSnapshotUpdateBid.updates[0].change = 10;
	orderBookSnapshotUpdateBid.updates[0].price = 115;
	const orderBookSnapshotTest3 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest3, orderBookSnapshotUpdateBid);
	expect(orderBookSnapshotTest3).toMatchSnapshot();
});

test('updateOrderBookSnapshot, bid, not existingLevel, count = -1', () => {
	orderBookSnapshotUpdateBid.updates[0].change = 10;
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
			change: 10,
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
	orderBookSnapshotUpdateAsk.updates[0].change = -10;
	const orderBookSnapshotTest6 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest6, orderBookSnapshotUpdateAsk);
	expect(orderBookSnapshotTest6).toMatchSnapshot();
});

test('updateOrderBookSnapshot, ask, not existingLevel, count > 0', () => {
	orderBookSnapshotUpdateAsk.updates[0].change = 10;
	orderBookSnapshotUpdateAsk.updates[0].price = 145;
	const orderBookSnapshotTest7 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest7, orderBookSnapshotUpdateAsk);
	expect(orderBookSnapshotTest7).toMatchSnapshot();
});

test('updateOrderBookSnapshot, ask, not existingLevel, count = -1', () => {
	orderBookSnapshotUpdateAsk.updates[0].change = 10;
	orderBookSnapshotUpdateAsk.updates[0].price = 145;
	orderBookSnapshotUpdateAsk.updates[0].count = -1;
	const orderBookSnapshotTest8 = util.clone(orderBookSnapshot);
	orderBookUtil.updateOrderBookSnapshot(orderBookSnapshotTest8, orderBookSnapshotUpdateAsk);
	expect(orderBookSnapshotTest8).toMatchSnapshot();
});

test('getOrderBookSnapshotMid bids and asks', () => {
	expect(
		orderBookUtil.getOrderBookSnapshotMid({
			pair: 'pair',
			version: 1234567890,
			bids: [
				{
					price: 1,
					balance: 1,
					count: 1
				}
			],
			asks: [
				{
					price: 2,
					balance: 1,
					count: 1
				}
			]
		})
	).toBe(1.5);
});

test('getOrderBookSnapshotMid no bids', () => {
	expect(
		orderBookUtil.getOrderBookSnapshotMid({
			pair: 'pair',
			version: 1234567890,
			bids: [],
			asks: [
				{
					price: 2,
					balance: 1,
					count: 1
				}
			]
		})
	).toBe(Number.NEGATIVE_INFINITY);
});

test('getOrderBookSnapshotMid no asks', () => {
	expect(
		orderBookUtil.getOrderBookSnapshotMid({
			pair: 'pair',
			version: 1234567890,
			bids: [
				{
					price: 1,
					balance: 1,
					count: 1
				}
			],
			asks: []
		})
	).toBe(Number.POSITIVE_INFINITY);
});

test('getOrderBookSnapshotMid no bids and no asks', () => {
	expect(
		orderBookUtil.getOrderBookSnapshotMid({
			pair: 'pair',
			version: 1234567890,
			bids: [],
			asks: []
		})
	).toBe(0);
});

test('getOrderBookSnapshotSpread bids and asks', () => {
	expect(
		orderBookUtil.getOrderBookSnapshotSpread({
			pair: 'pair',
			version: 1234567890,
			bids: [
				{
					price: 1,
					balance: 1,
					count: 1
				}
			],
			asks: [
				{
					price: 2,
					balance: 1,
					count: 1
				}
			]
		})
	).toBe(1);
});

test('getOrderBookSnapshotSpread no bids', () => {
	expect(
		orderBookUtil.getOrderBookSnapshotSpread({
			pair: 'pair',
			version: 1234567890,
			bids: [],
			asks: [
				{
					price: 2,
					balance: 1,
					count: 1
				}
			]
		})
	).toBe(Number.POSITIVE_INFINITY);
});

test('getOrderBookSnapshotMid no asks', () => {
	expect(
		orderBookUtil.getOrderBookSnapshotSpread({
			pair: 'pair',
			version: 1234567890,
			bids: [
				{
					price: 1,
					balance: 1,
					count: 1
				}
			],
			asks: []
		})
	).toBe(Number.POSITIVE_INFINITY);
});

test('getOrderBookSnapshotMid no bids and no asks', () => {
	expect(
		orderBookUtil.getOrderBookSnapshotSpread({
			pair: 'pair',
			version: 1234567890,
			bids: [],
			asks: []
		})
	).toBe(Number.POSITIVE_INFINITY);
});
