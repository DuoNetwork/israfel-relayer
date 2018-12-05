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
	liveOrders4.orderHash1.balance = 0;
	orderBook4.bids[0].price = 0.04;
	orderBook4.bids[0].balance = 0;
	expect(orderMatchingUtil.findMatchingOrders(orderBook4, liveOrders4, false)).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, ask balance 0', () => {
	const orderBook5 = util.clone(orderBook);
	const liveOrders5 = util.clone(liveOrders);
	liveOrders5.orderHash3.price = 0.02;
	liveOrders5.orderHash3.balance = 0;
	orderBook5.asks[0].price = 0.02;
	orderBook5.asks[0].balance = 0;
	expect(orderMatchingUtil.findMatchingOrders(orderBook5, liveOrders5, false)).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, matching first bid and ask', () => {
	const orderBook6 = util.clone(orderBook);
	const liveOrders6 = util.clone(liveOrders);
	liveOrders6.orderHash1.price = 0.04;
	orderBook6.bids[0].price = 0.04;
	expect(orderMatchingUtil.findMatchingOrders(orderBook6, liveOrders6, false)).toMatchSnapshot();
	expect(orderBook6).toMatchSnapshot();
	expect(liveOrders6).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, matching all, all partial filled', () => {
	const orderBook7 = util.clone(orderBook);
	const liveOrders7 = util.clone(liveOrders);
	liveOrders7.orderHash1.price = 0.05;
	orderBook7.bids[0].price = 0.05;
	liveOrders7.orderHash2.price = 0.04;
	orderBook7.bids[1].price = 0.04;
	expect(orderMatchingUtil.findMatchingOrders(orderBook7, liveOrders7, false)).toMatchSnapshot();
	expect(orderBook7).toMatchSnapshot();
	expect(liveOrders7).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired false, matching all and no partial fill', () => {
	const orderBook8 = util.clone(orderBook);
	const liveOrders8 = util.clone(liveOrders);
	liveOrders8.orderHash1.price = 0.05;
	orderBook8.bids[0].price = 0.05;
	liveOrders8.orderHash1.balance = 20;
	liveOrders8.orderHash2.price = 0.04;
	orderBook8.bids[1].price = 0.04;
	orderBook8.bids[1].balance = 30;
	expect(orderMatchingUtil.findMatchingOrders(orderBook8, liveOrders8, false)).toMatchSnapshot();
	expect(orderBook8).toMatchSnapshot();
	expect(liveOrders8).toMatchSnapshot();
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
		makerAddress: 'makerAddress1',
		takerAddress: 'takerAddress',
		makerFee: '0',
		takerFee: '0',
		makerAssetAmount: '40000000000000000000',
		takerAssetAmount: '100000000000000000000',
		makerAssetData: 'makerAssetData',
		takerAssetData: 'takerAssetData',
		salt: '123456781',
		exchangeAddress: 'exchangeAddress',
		feeRecipientAddress: 'feeRecipientAddress',
		expirationTimeSeconds: '1234567890',
		signature: 'signature1'
	},
	orderHash2: {
		senderAddress: 'senderAddress',
		makerAddress: 'makerAddress2',
		takerAddress: 'takerAddress',
		makerFee: '0',
		takerFee: '0',
		makerAssetAmount: '20000000000000000000',
		takerAssetAmount: '50000000000000000000',
		makerAssetData: 'takerAssetData',
		takerAssetData: 'makerAssetData',
		salt: '123456782',
		exchangeAddress: 'exchangeAddress',
		feeRecipientAddress: 'feeRecipientAddress',
		expirationTimeSeconds: '1234567890',
		signature: 'signature2'
	},
	orderHash3: {
		senderAddress: 'senderAddress',
		makerAddress: 'makerAddress3',
		takerAddress: 'takerAddress',
		makerFee: '0',
		takerFee: '0',
		makerAssetAmount: '20000000000000000000',
		takerAssetAmount: '50000000000000000000',
		makerAssetData: 'makerAssetData',
		takerAssetData: 'takerAssetData',
		salt: '123456783',
		exchangeAddress: 'exchangeAddress',
		feeRecipientAddress: 'feeRecipientAddress',
		expirationTimeSeconds: '1234567890',
		signature: 'signature3'
	},
	orderHash4: {
		senderAddress: 'senderAddress',
		makerAddress: 'makerAddress4',
		takerAddress: 'takerAddress',
		makerFee: '0',
		takerFee: '0',
		makerAssetAmount: '40000000000000000000',
		takerAssetAmount: '100000000000000000000',
		makerAssetData: 'takerAssetData',
		takerAssetData: 'makerAssetData',
		salt: '123456784',
		exchangeAddress: 'exchangeAddress',
		feeRecipientAddress: 'feeRecipientAddress',
		expirationTimeSeconds: '1234567890',
		signature: 'signature4'
	}
};

test('matchorders', async () => {
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
	util.getUTCNowTimestamp = jest.fn(() => 1234567898);
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	await orderMatchingUtil.matchOrders(web3Util, 'code1|code2', ordersToMatch);
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('matchorders, no left raworder', async () => {
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
	util.getUTCNowTimestamp = jest.fn(() => 1234567898);
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	await orderMatchingUtil.matchOrders(web3Util, 'code1|code2', ordersToMatch);
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('matchorders, no right raworder', async () => {
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
	util.getUTCNowTimestamp = jest.fn(() => 1234567898);
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	await orderMatchingUtil.matchOrders(web3Util, 'code1|code2', ordersToMatch);
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});
