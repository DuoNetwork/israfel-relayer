import orderMatchingUtil from './orderMatchingUtil';
import orderPersistenceUtil from './orderPersistenceUtil';
import orderUtil from './orderUtil';
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
		matching: 0,
		fill: 0,
		side: 'bid',
		createdAt: 1234567890,
		expiry: 1234567890000,
		initialSequence: 1,
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
		matching: 0,
		fill: 0,
		side: 'bid',
		createdAt: 1234567890,
		expiry: 1234567890000,
		initialSequence: 2,
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
		matching: 0,
		fill: 0,
		side: 'ask',
		createdAt: 1234567890,
		expiry: 1234567890000,
		initialSequence: 3,
		currentSequence: 7,
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
		matching: 0,
		fill: 0,
		side: 'ask',
		createdAt: 1234567890,
		expiry: 1234567890000,
		initialSequence: 4,
		currentSequence: 8,
		fee: 1,
		feeAsset: 'feeAsset'
	}
};

test('findMatchingOrders, updatesRequired false, no matching', () => {
	expect(orderMatchingUtil.findMatchingOrders(orderBook, liveOrders, false)).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, no bids', () => {
	const orderBook1 = util.clone(orderBook);
	orderBook1.bids = [];
	expect(orderMatchingUtil.findMatchingOrders(orderBook1, liveOrders, false)).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, no ask live order', () => {
	const orderBook2 = util.clone(orderBook);
	const liveOrders2 = util.clone(liveOrders);
	liveOrders2.orderHash1.price = 0.04;
	orderBook2.bids[0].price = 0.04;
	delete liveOrders2.orderHash3;
	expect(orderMatchingUtil.findMatchingOrders(orderBook2, liveOrders2, false)).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, no bid live order', () => {
	const orderBook3 = util.clone(orderBook);
	const liveOrders3 = util.clone(liveOrders);
	liveOrders3.orderHash3.price = 0.02;
	orderBook3.asks[0].price = 0.02;
	delete liveOrders3.orderHash1;
	expect(orderMatchingUtil.findMatchingOrders(orderBook3, liveOrders3, false)).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, bid balance 0', () => {
	const orderBook4 = util.clone(orderBook);
	const liveOrders4 = util.clone(liveOrders);
	liveOrders4.orderHash1.price = 0.04;
	orderBook4.bids[0].price = 0.04;
	liveOrders4.orderHash2.price = 0.04;
	liveOrders4.orderHash2.balance = 0;
	orderBook4.bids[1].price = 0.04;
	orderBook4.bids[1].balance = 0;
	expect(orderMatchingUtil.findMatchingOrders(orderBook4, liveOrders4, false)).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired true, ask balance 0', () => {
	const orderBook5 = util.clone(orderBook);
	const liveOrders5 = util.clone(liveOrders);
	liveOrders5.orderHash3.price = 0.02;
	orderBook5.asks[0].price = 0.02;
	liveOrders5.orderHash4.price = 0.02;
	liveOrders5.orderHash4.balance = 0;
	orderBook5.asks[1].price = 0.02;
	orderBook5.asks[1].balance = 0;
	expect(orderMatchingUtil.findMatchingOrders(orderBook5, liveOrders5, true)).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired true, matching all, all partial filled', () => {
	const orderBook7 = util.clone(orderBook);
	const liveOrders7 = util.clone(liveOrders);
	liveOrders7.orderHash1.price = 0.05;
	orderBook7.bids[0].price = 0.05;
	liveOrders7.orderHash2.price = 0.04;
	orderBook7.bids[1].price = 0.04;
	expect(orderMatchingUtil.findMatchingOrders(orderBook7, liveOrders7, true)).toMatchSnapshot();
	expect(orderBook7).toMatchSnapshot();
	expect(liveOrders7).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired true, matching first bid and ask', () => {
	const orderBook9 = util.clone(orderBook);
	const liveOrders9 = util.clone(liveOrders);
	liveOrders9.orderHash1.price = 0.04;
	orderBook9.bids[0].price = 0.04;
	expect(orderMatchingUtil.findMatchingOrders(orderBook9, liveOrders9, true)).toMatchSnapshot();
	expect(orderBook9).toMatchSnapshot();
	expect(liveOrders9).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired true, bid balance after matching > 0', () => {
	const orderBook10 = util.clone(orderBook);
	const liveOrders10 = util.clone(liveOrders);
	liveOrders10.orderHash1.price = 0.04;
	orderBook10.bids[0].price = 0.04;
	liveOrders10.orderHash1.balance = 40;
	orderBook10.bids[0].balance = 40;
	expect(orderMatchingUtil.findMatchingOrders(orderBook10, liveOrders10, true)).toMatchSnapshot();
	expect(orderBook10).toMatchSnapshot();
	expect(liveOrders10).toMatchSnapshot();
});

const ordersToMatch = [
	{
		leftOrderHash: 'orderHash1',
		rightOrderHash: 'orderHash2',
		matchingAmount: 1
	},
	{
		leftOrderHash: 'orderHash1',
		rightOrderHash: 'orderHash5',
		matchingAmount: 2
	},
	{
		leftOrderHash: 'orderHash3',
		rightOrderHash: 'orderHash2',
		matchingAmount: 3
	},
	{
		leftOrderHash: 'orderHash3',
		rightOrderHash: 'orderHash4',
		matchingAmount: 4
	}
];

test('matchorders', async () => {
	orderUtil.parseSignedOrder = jest.fn((input: string) => input + 'signedOrder');
	const web3Util = {
		getTransactionCount: jest.fn(() => Promise.resolve(100)),
		getGasPrice: jest.fn(() => Promise.resolve(2000000000)),
		matchOrders: jest.fn(() => Promise.resolve())
	} as any;
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, orderHash) =>
		Promise.resolve({ signedOrder: pair + orderHash })
	);
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	await orderMatchingUtil.matchOrders(web3Util, 'code1|code2', ordersToMatch);
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('matchorders failed', async () => {
	orderUtil.parseSignedOrder = jest.fn((input: string) => input + 'signedOrder');
	const web3Util = {
		getTransactionCount: jest.fn(() => Promise.resolve(100)),
		getGasPrice: jest.fn(() => Promise.resolve(2000000000)),
		matchOrders: jest.fn((input: string) =>
			input.includes('orderHash1') ? Promise.reject() : Promise.resolve()
		)
	} as any;
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, orderHash) =>
		Promise.resolve({ signedOrder: pair + orderHash })
	);
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	await orderMatchingUtil.matchOrders(web3Util, 'code1|code2', ordersToMatch);
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('matchorders, no left raworder', async () => {
	orderUtil.parseSignedOrder = jest.fn((input: string) => input + 'signedOrder');
	const web3Util = {
		getTransactionCount: jest.fn(() => Promise.resolve(100)),
		getGasPrice: jest.fn(() => Promise.resolve(2000000000)),
		matchOrders: jest.fn(() => Promise.resolve())
	} as any;
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, orderHash) =>
		Promise.resolve(orderHash === 'orderHash1' ? null : { signedOrder: pair + orderHash })
	);
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	await orderMatchingUtil.matchOrders(web3Util, 'code1|code2', ordersToMatch);
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('matchorders, no right raworder', async () => {
	orderUtil.parseSignedOrder = jest.fn((input: string) => input + 'signedOrder');
	const web3Util = {
		getTransactionCount: jest.fn(() => Promise.resolve(100)),
		getGasPrice: jest.fn(() => Promise.resolve(2000000000)),
		matchOrders: jest.fn(() => Promise.resolve())
	} as any;
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, orderHash) =>
		Promise.resolve(orderHash === 'orderHash2' ? null : { signedOrder: pair + orderHash })
	);
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	await orderMatchingUtil.matchOrders(web3Util, 'code1|code2', ordersToMatch);
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('matchorders, no valid match', async () => {
	orderUtil.parseSignedOrder = jest.fn((input: string) => input + 'signedOrder');
	const web3Util = {
		getTransactionCount: jest.fn(() => Promise.resolve(100)),
		getGasPrice: jest.fn(() => Promise.resolve(2000000000)),
		matchOrders: jest.fn(() => Promise.resolve())
	} as any;
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	await orderMatchingUtil.matchOrders(web3Util, 'code1|code2', ordersToMatch);
	expect(web3Util.matchOrders as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.persistOrder as jest.Mock).not.toBeCalled();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});
