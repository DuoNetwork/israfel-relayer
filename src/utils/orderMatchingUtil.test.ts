// import { IOrderBook, IOrderBookLevel } from '../common/types';
import orderMatchingUtil from './orderMatchingUtil';
import util from './util';

const orderBook = {
	bids: [
		{ orderHash: 'orderHash1', price: 0.02, balance: 20, initialSequence: 1 },
		{ orderHash: 'orderHash2', price: 0.01, balance: 30, initialSequence: 2 }
	],
	asks: [
		{ orderHash: 'orderHash3', price: 0.04, balance: 30, initialSequence: 3 },
		{ orderHash: 'orderHash4', price: 0.05, balance: 20, initialSequence: 4 }
	]
};

const liveOrders = {
	orderHash1: {
		account: 'account1',
		pair: 'pair',
		orderHash: 'orderHash1',
		price: 0.02,
		amount: 20,
		balance: 20,
		fill: 1,
		side: 'bid',
		createdAt: 1234567890,
		expiry: 1234567890000,
		initialSequence: 5,
		currentSequence: 5,
		fee: 1,
		feeAsset: 'feeAsset'
	},
	orderHash2: {
		account: 'account2',
		pair: 'pair',
		orderHash: 'orderHash2',
		price: 0.01,
		amount: 30,
		balance: 30,
		fill: 1,
		side: 'bid',
		createdAt: 1234567890,
		expiry: 1234567890000,
		initialSequence: 6,
		currentSequence: 6,
		fee: 1,
		feeAsset: 'feeAsset'
	},
	orderHash3: {
		account: 'account3',
		pair: 'pair',
		orderHash: 'orderHash3',
		price: 0.04,
		amount: 30,
		balance: 30,
		fill: 1,
		side: 'bid',
		createdAt: 1234567890,
		expiry: 1234567890000,
		initialSequence: 5,
		currentSequence: 5,
		fee: 1,
		feeAsset: 'feeAsset'
	},
	orderHash4: {
		account: 'account4',
		pair: 'pair',
		orderHash: 'orderHash4',
		price: 0.05,
		amount: 20,
		balance: 20,
		fill: 1,
		side: 'ask',
		createdAt: 1234567890,
		expiry: 1234567890000,
		initialSequence: 6,
		currentSequence: 6,
		fee: 1,
		feeAsset: 'feeAsset'
	}
};

test('orderMatchingUtil, updatesRequired false, no matching', () => {
	const res = orderMatchingUtil.findMatchingOrders(orderBook, liveOrders, false);
	expect(res).toMatchSnapshot();
});

test('orderMatchingUtil, updatesRequired false, no bids', () => {
	const orderBook1 = util.clone(orderBook);
	orderBook1.bids = [];
	const res = orderMatchingUtil.findMatchingOrders(orderBook1, liveOrders, false);
	expect(res).toMatchSnapshot();
});

test('orderMatchingUtil, updatesRequired false, no ask live order', () => {
	const orderBook3 = util.clone(orderBook);
	const liveOrders3 = util.clone(liveOrders);
	liveOrders3.orderHash1.price = 0.04;
	orderBook3.bids[0].price = 0.04;
	delete liveOrders3.orderHash3;
	const res = orderMatchingUtil.findMatchingOrders(orderBook3, liveOrders3, false);
	expect(res).toMatchSnapshot();
});

test('orderMatchingUtil, updatesRequired false, no bid live order', () => {
	const orderBook4 = util.clone(orderBook);
	const liveOrders4 = util.clone(liveOrders);
	liveOrders4.orderHash3.price = 0.02;
	orderBook4.asks[0].price = 0.02;
	delete liveOrders4.orderHash1;
	const res = orderMatchingUtil.findMatchingOrders(orderBook4, liveOrders4, false);
	expect(res).toMatchSnapshot();
});

test('orderMatchingUtil, updatesRequired false, matching equally', () => {
	const orderBook2 = util.clone(orderBook);
	const liveOrders2 = util.clone(liveOrders);
	liveOrders2.orderHash1.price = 0.04;
	orderBook2.bids[0].price = 0.04;
	const res = orderMatchingUtil.findMatchingOrders(orderBook2, liveOrders2, false);
	expect(res).toMatchSnapshot();
});

test('orderMatchingUtil, updatesRequired false, matching equally', () => {
	const orderBook5 = util.clone(orderBook);
	const liveOrders5 = util.clone(liveOrders);
	liveOrders5.orderHash1.price = 0.04;
	orderBook5.bids[0].price = 0.04;
	liveOrders5.orderHash2.price = 0.05;
	orderBook5.bids[1].price = 0.05;
	const res = orderMatchingUtil.findMatchingOrders(orderBook5, liveOrders5, false);
	expect(res).toMatchSnapshot();
});

// test('orderMatchingUtil, updatesRequired true, no matching', () => {
// 	const res = orderMatchingUtil.findMatchingOrders(orderBook, liveOrders, false);
// 	expect(res).toMatchSnapshot();
// });
