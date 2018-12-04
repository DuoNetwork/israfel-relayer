import { IStringSignedOrder } from '../common/types';
import orderMatchingUtil from './orderMatchingUtil';
import orderPersistenceUtil from './orderPersistenceUtil';
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

test('findMatchingOrders, updatesRequired false, no matching', () => {
	const res = orderMatchingUtil.findMatchingOrders(orderBook, liveOrders, false);
	expect(res).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, no bids', () => {
	const orderBook1 = util.clone(orderBook);
	orderBook1.bids = [];
	const res = orderMatchingUtil.findMatchingOrders(orderBook1, liveOrders, false);
	expect(res).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, no ask live order', () => {
	const orderBook3 = util.clone(orderBook);
	const liveOrders3 = util.clone(liveOrders);
	liveOrders3.orderHash1.price = 0.04;
	orderBook3.bids[0].price = 0.04;
	delete liveOrders3.orderHash3;
	const res = orderMatchingUtil.findMatchingOrders(orderBook3, liveOrders3, false);
	expect(res).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, no bid live order', () => {
	const orderBook4 = util.clone(orderBook);
	const liveOrders4 = util.clone(liveOrders);
	liveOrders4.orderHash3.price = 0.02;
	orderBook4.asks[0].price = 0.02;
	delete liveOrders4.orderHash1;
	const res = orderMatchingUtil.findMatchingOrders(orderBook4, liveOrders4, false);
	expect(res).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, matching first bid and ask', () => {
	const orderBook2 = util.clone(orderBook);
	const liveOrders2 = util.clone(liveOrders);
	liveOrders2.orderHash1.price = 0.04;
	orderBook2.bids[0].price = 0.04;
	const res = orderMatchingUtil.findMatchingOrders(orderBook2, liveOrders2, false);
	expect(res).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, matching all, all partial filled', () => {
	const orderBook5 = util.clone(orderBook);
	const liveOrders5 = util.clone(liveOrders);
	liveOrders5.orderHash1.price = 0.04;
	orderBook5.bids[0].price = 0.04;
	liveOrders5.orderHash2.price = 0.05;
	orderBook5.bids[1].price = 0.05;
	const res = orderMatchingUtil.findMatchingOrders(orderBook5, liveOrders5, false);
	expect(res).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, matching all and no partial fill', () => {
	const orderBook6 = util.clone(orderBook);
	const liveOrders6 = util.clone(liveOrders);
	liveOrders6.orderHash1.price = 0.04;
	orderBook6.bids[0].price = 0.04;
	liveOrders6.orderHash1.balance = 30;
	orderBook6.bids[0].balance = 30;
	liveOrders6.orderHash2.price = 0.05;
	orderBook6.bids[1].price = 0.05;
	const res = orderMatchingUtil.findMatchingOrders(orderBook6, liveOrders6, false);
	expect(res).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired true, matching first bid and ask', () => {
	const orderBook7 = util.clone(orderBook);
	const liveOrders7 = util.clone(liveOrders);
	liveOrders7.orderHash1.price = 0.04;
	orderBook7.bids[0].price = 0.04;
	const res = orderMatchingUtil.findMatchingOrders(orderBook7, liveOrders7, true);
	expect(res).toMatchSnapshot();
});

const ordersToMatch = [
	{
		left: {
			orderHash: 'orderHash1',
			balance: 40
		},
		right: {
			orderHash: 'orderHash2',
			balance: 20
		}
	},
	{
		left: {
			orderHash: 'orderHash3',
			balance: 20
		},
		right: {
			orderHash: 'orderHash4',
			balance: 40
		}
	}
];

const stringSignedOrders: { [key: string]: IStringSignedOrder } = {
	orderHash1: {
		senderAddress: 'senderAddress',
		makerAddress: 'makerAddress',
		takerAddress: 'takerAddress',
		makerFee: '0',
		takerFee: '0',
		makerAssetAmount: '123',
		takerAssetAmount: '456',
		makerAssetData: 'makerAssetData',
		takerAssetData: 'takerAssetData',
		salt: '789',
		exchangeAddress: 'exchangeAddress',
		feeRecipientAddress: 'feeRecipientAddress',
		expirationTimeSeconds: '1234567890',
		signature: 'signature1'
	},
	orderHash2: {
		senderAddress: 'senderAddress',
		makerAddress: 'makerAddress',
		takerAddress: 'takerAddress',
		makerFee: '0',
		takerFee: '0',
		makerAssetAmount: '123',
		takerAssetAmount: '456',
		makerAssetData: 'makerAssetData',
		takerAssetData: 'takerAssetData',
		salt: '789',
		exchangeAddress: 'exchangeAddress',
		feeRecipientAddress: 'feeRecipientAddress',
		expirationTimeSeconds: '1234567890',
		signature: 'signature2'
	},
	orderHash3: {
		senderAddress: 'senderAddress',
		makerAddress: 'makerAddress',
		takerAddress: 'takerAddress',
		makerFee: '0',
		takerFee: '0',
		makerAssetAmount: '123',
		takerAssetAmount: '456',
		makerAssetData: 'makerAssetData',
		takerAssetData: 'takerAssetData',
		salt: '789',
		exchangeAddress: 'exchangeAddress',
		feeRecipientAddress: 'feeRecipientAddress',
		expirationTimeSeconds: '1234567890',
		signature: 'signature3'
	},
	orderHash4: {
		senderAddress: 'senderAddress',
		makerAddress: 'makerAddress',
		takerAddress: 'takerAddress',
		makerFee: '0',
		takerFee: '0',
		makerAssetAmount: '123',
		takerAssetAmount: '456',
		makerAssetData: 'makerAssetData',
		takerAssetData: 'takerAssetData',
		salt: '789',
		exchangeAddress: 'exchangeAddress',
		feeRecipientAddress: 'feeRecipientAddress',
		expirationTimeSeconds: '1234567890',
		signature: 'signature4'
	}
};

test('matchorders', () => {
	const stringSignedOrder1 = util.clone(stringSignedOrders);
	const web3Util = {
		getTransactionCount: jest.fn(() => Promise.resolve(100)),
		getGasPrice: jest.fn(() => Promise.resolve(2000000000)),
		matchOrders: jest.fn(() => Promise.resolve())
	} as any;
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, orderHash) =>
		Promise.resolve({
			pair: pair,
			orderHash: orderHash,
			signedOrder: stringSignedOrder1[orderHash]
		})
	);
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	orderMatchingUtil.matchOrders(web3Util, 'code1|code2', ordersToMatch);
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('matchorders, no left raworder', () => {
	const stringSignedOrder2 = util.clone(stringSignedOrders);
	delete stringSignedOrder2['orderHash1'];
	const web3Util = {
		getTransactionCount: jest.fn(() => Promise.resolve(100)),
		getGasPrice: jest.fn(() => Promise.resolve(2000000000)),
		matchOrders: jest.fn(() => Promise.resolve())
	} as any;
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, orderHash) =>
		Promise.resolve({
			pair: pair,
			orderHash: orderHash,
			signedOrder: stringSignedOrder2[orderHash]
		})
	);
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	orderMatchingUtil.matchOrders(web3Util, 'code1|code2', ordersToMatch);
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.results
	).toMatchSnapshot();

	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('matchorders, no left raworder', () => {
	const stringSignedOrder2 = util.clone(stringSignedOrders);
	delete stringSignedOrder2['orderHash1'];
	// console.log(stringSignedOrder2);
	const web3Util = {
		getTransactionCount: jest.fn(() => Promise.resolve(100)),
		getGasPrice: jest.fn(() => Promise.resolve(2000000000)),
		matchOrders: jest.fn(() => Promise.resolve())
	} as any;
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, orderHash) =>
		Promise.resolve(
			stringSignedOrder2[orderHash]
				? {
						pair: pair,
						orderHash: orderHash,
						signedOrder: stringSignedOrder2[orderHash]
				}
				: null
		)
	);
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	orderMatchingUtil.matchOrders(web3Util, 'code1|code2', ordersToMatch);
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('matchorders, no right raworder', () => {
	const stringSignedOrder3 = util.clone(stringSignedOrders);
	delete stringSignedOrder3['orderHash2'];
	// console.log(stringSignedOrder2);
	const web3Util = {
		getTransactionCount: jest.fn(() => Promise.resolve(100)),
		getGasPrice: jest.fn(() => Promise.resolve(2000000000)),
		matchOrders: jest.fn(() => Promise.resolve())
	} as any;
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, orderHash) =>
		Promise.resolve(
			stringSignedOrder3[orderHash]
				? {
						pair: pair,
						orderHash: orderHash,
						signedOrder: stringSignedOrder3[orderHash]
				}
				: null
		)
	);
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	orderMatchingUtil.matchOrders(web3Util, 'code1|code2', ordersToMatch);
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});
