import { BigNumber } from '0x.js';
import { IOrderMatchRequest, IRawOrder, IStringSignedOrder } from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderMatchingUtil from './orderMatchingUtil';
import orderPersistenceUtil from './orderPersistenceUtil';
import orderUtil from './orderUtil';
import redisUtil from './redisUtil';
import util from './util';

test('queueMatchRequest', () => {
	redisUtil.push = jest.fn();
	orderMatchingUtil.queueMatchRequest('matchRequest' as any);
	expect((redisUtil.push as jest.Mock).mock.calls).toMatchSnapshot();
});

test('subscribeTradeUpdate', () => {
	redisUtil.subscribe = jest.fn();
	redisUtil.onTradeUpdate = jest.fn();
	const handleTradeUpdate = jest.fn();
	orderMatchingUtil.subscribeTradeUpdate('pair', handleTradeUpdate);
	expect((redisUtil.subscribe as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.onTradeUpdate as jest.Mock).toBeCalledTimes(1);
	expect((redisUtil.onTradeUpdate as jest.Mock).mock.calls[0][0]).toBe(handleTradeUpdate);
})

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
		pair: 'code1|code2',
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
		pair: 'code1|code2',
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
		pair: 'code1|code2',
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
		pair: 'code1|code2',
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
	liveOrders7['orderHash1'].initialSequence = 5;
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
	liveOrders10.orderHash1.amount = 40;
	orderBook10.bids[0].balance = 40;
	expect(orderMatchingUtil.findMatchingOrders(orderBook10, liveOrders10, true)).toMatchSnapshot();
	expect(orderBook10).toMatchSnapshot();
	expect(liveOrders10).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired true, bid balance after matching > 0, price cross', () => {
	const orderBook10 = util.clone(orderBook);
	const liveOrders10 = util.clone(liveOrders);
	liveOrders10.orderHash1.price = 0.045;
	orderBook10.bids[0].price = 0.045;
	liveOrders10.orderHash1.balance = 40;
	liveOrders10.orderHash1.amount = 40;
	orderBook10.bids[0].balance = 40;
	expect(orderMatchingUtil.findMatchingOrders(orderBook10, liveOrders10, true)).toMatchSnapshot();
	expect(orderBook10).toMatchSnapshot();
	expect(liveOrders10).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired feeOnToken true, matching all, all partial filled', () => {
	const orderBook7 = util.clone(orderBook);
	const liveOrders7 = util.clone(liveOrders);
	for (const liveOrder in liveOrders7) liveOrders7[liveOrder].feeAsset = 'code1';
	liveOrders7.orderHash1.price = 0.05;
	orderBook7.bids[0].price = 0.05;
	liveOrders7.orderHash2.price = 0.04;
	orderBook7.bids[1].price = 0.04;
	expect(orderMatchingUtil.findMatchingOrders(orderBook7, liveOrders7, true)).toMatchSnapshot();
	expect(orderBook7).toMatchSnapshot();
	expect(liveOrders7).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired feeOnToken true, matching first bid and ask', () => {
	const orderBook9 = util.clone(orderBook);
	const liveOrders9 = util.clone(liveOrders);
	for (const liveOrder in liveOrders9) liveOrders9[liveOrder].feeAsset = 'code1';
	liveOrders9.orderHash1.price = 0.04;
	orderBook9.bids[0].price = 0.04;
	expect(orderMatchingUtil.findMatchingOrders(orderBook9, liveOrders9, true)).toMatchSnapshot();
	expect(orderBook9).toMatchSnapshot();
	expect(liveOrders9).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired feeOnToken true, bid balance after matching > 0', () => {
	const orderBook10 = util.clone(orderBook);
	const liveOrders10 = util.clone(liveOrders);
	for (const liveOrder in liveOrders10) liveOrders10[liveOrder].feeAsset = 'code1';
	liveOrders10.orderHash1.price = 0.04;
	orderBook10.bids[0].price = 0.04;
	liveOrders10.orderHash1.balance = 40;
	liveOrders10.orderHash1.amount = 40;
	orderBook10.bids[0].balance = 40;
	expect(orderMatchingUtil.findMatchingOrders(orderBook10, liveOrders10, true)).toMatchSnapshot();
	expect(orderBook10).toMatchSnapshot();
	expect(liveOrders10).toMatchSnapshot();
});

test('findMatchingOrders, updatesRequired feeOnToken true, bid balance after matching > 0 price cross', () => {
	const orderBook10 = util.clone(orderBook);
	const liveOrders10 = util.clone(liveOrders);
	for (const liveOrder in liveOrders10) liveOrders10[liveOrder].feeAsset = 'code1';
	liveOrders10.orderHash1.price = 0.045;
	orderBook10.bids[0].price = 0.045;
	liveOrders10.orderHash1.balance = 40;
	liveOrders10.orderHash1.amount = 40;
	orderBook10.bids[0].balance = 40;
	expect(orderMatchingUtil.findMatchingOrders(orderBook10, liveOrders10, true)).toMatchSnapshot();
	expect(orderBook10).toMatchSnapshot();
	expect(liveOrders10).toMatchSnapshot();
});

const orderMatchReq: IOrderMatchRequest = {
	pair: 'code1|code2',
	feeAsset: 'code1',
	bid: {
		orderAmount: 10,
		orderHash: '0xleftHash',
		matchingAmount: 10,
		price: 0.001,
		fee: 0.1
	},
	ask: {
		orderAmount: 10,
		orderHash: '0xrightHash',
		matchingAmount: 10,
		price: 0.001,
		fee: 0.1
	},
	takerSide: 'bid'
};

test('processMatchSuccess', async () => {
	const web3Util = {
		getFilledTakerAssetAmount: jest.fn(() => new BigNumber(1))
	} as any;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	redisUtil.publish = jest.fn(() => Promise.resolve());
	dynamoUtil.addTrade = jest.fn(() => Promise.resolve());
	const bidSignedOrder: IStringSignedOrder = {
		exchangeAddress: '0x48bacb9266a570d521063ef5dd96e61686dbe788',
		makerAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
		takerAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
		senderAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
		feeRecipientAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
		expirationTimeSeconds: '1538117918',
		salt: '15105341483720',
		makerAssetAmount: '1000000000000000000',
		takerAssetAmount: '1000000000000000000',
		makerAssetData:
			'0xf47261b0000000000000000000000000871dd7c2b4b25e1aa18728e9d5f2af4c4e431f5c',
		takerAssetData:
			'0xf47261b00000000000000000000000000b1ba0af832d7c05fd64161e0db78e85978e8082',
		makerFee: '0',
		takerFee: '0',
		signature: 'signature1'
	};
	const askSignedOrder: IStringSignedOrder = {
		exchangeAddress: '0x48bacb9266a570d521063ef5dd96e61686dbe788',
		makerAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
		takerAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
		senderAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
		feeRecipientAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
		expirationTimeSeconds: '1538117918',
		salt: '15105341483720',
		makerAssetAmount: '1000000000000000000',
		takerAssetAmount: '1000000000000000000',
		makerAssetData:
			'0xf47261b0000000000000000000000000871dd7c2b4b25e1aa18728e9d5f2af4c4e431f5c',
		takerAssetData:
			'0xf47261b00000000000000000000000000b1ba0af832d7c05fd64161e0db78e85978e8082',
		makerFee: '0',
		takerFee: '0',
		signature: 'signature2'
	};
	await orderMatchingUtil.processMatchSuccess(
		web3Util,
		'txHash',
		1234567890000,
		orderMatchReq,
		orderUtil.parseSignedOrder(bidSignedOrder),
		orderUtil.parseSignedOrder(askSignedOrder)
	);
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((dynamoUtil.addTrade as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock).mock.calls).toMatchSnapshot();
});

test('processMatchSuccess full fill', async () => {
	const web3Util = {
		getFilledTakerAssetAmount: jest.fn(() => new BigNumber(1000000000000000000))
	} as any;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	redisUtil.publish = jest.fn(() => Promise.resolve());
	dynamoUtil.addTrade = jest.fn(() => Promise.resolve());
	const bidSignedOrder: IStringSignedOrder = {
		exchangeAddress: '0x48bacb9266a570d521063ef5dd96e61686dbe788',
		makerAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
		takerAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
		senderAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
		feeRecipientAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
		expirationTimeSeconds: '1538117918',
		salt: '15105341483720',
		makerAssetAmount: '1000000000000000000',
		takerAssetAmount: '1000000000000000000',
		makerAssetData:
			'0xf47261b0000000000000000000000000871dd7c2b4b25e1aa18728e9d5f2af4c4e431f5c',
		takerAssetData:
			'0xf47261b00000000000000000000000000b1ba0af832d7c05fd64161e0db78e85978e8082',
		makerFee: '0',
		takerFee: '0',
		signature: 'signature1'
	};
	const askSignedOrder: IStringSignedOrder = {
		exchangeAddress: '0x48bacb9266a570d521063ef5dd96e61686dbe788',
		makerAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
		takerAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
		senderAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
		feeRecipientAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
		expirationTimeSeconds: '1538117918',
		salt: '15105341483720',
		makerAssetAmount: '1000000000000000000',
		takerAssetAmount: '1000000000000000000',
		makerAssetData:
			'0xf47261b0000000000000000000000000871dd7c2b4b25e1aa18728e9d5f2af4c4e431f5c',
		takerAssetData:
			'0xf47261b00000000000000000000000000b1ba0af832d7c05fd64161e0db78e85978e8082',
		makerFee: '0',
		takerFee: '0',
		signature: 'signature2'
	};
	await orderMatchingUtil.processMatchSuccess(
		web3Util,
		'txHash',
		1234567890000,
		orderMatchReq,
		orderUtil.parseSignedOrder(bidSignedOrder),
		orderUtil.parseSignedOrder(askSignedOrder)
	);
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((dynamoUtil.addTrade as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock).mock.calls).toMatchSnapshot();
});

test('processMatchSuccess ask', async () => {
	orderMatchReq.takerSide = 'ask';
	const web3Util = {
		getFilledTakerAssetAmount: jest.fn(() => new BigNumber(1))
	} as any;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	redisUtil.publish = jest.fn(() => Promise.resolve());
	dynamoUtil.addTrade = jest.fn(() => Promise.resolve());
	const bidSignedOrder: IStringSignedOrder = {
		exchangeAddress: '0x48bacb9266a570d521063ef5dd96e61686dbe788',
		makerAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
		takerAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
		senderAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
		feeRecipientAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
		expirationTimeSeconds: '1538117918',
		salt: '15105341483720',
		makerAssetAmount: '1000000000000000000',
		takerAssetAmount: '1000000000000000000',
		makerAssetData:
			'0xf47261b0000000000000000000000000871dd7c2b4b25e1aa18728e9d5f2af4c4e431f5c',
		takerAssetData:
			'0xf47261b00000000000000000000000000b1ba0af832d7c05fd64161e0db78e85978e8082',
		makerFee: '0',
		takerFee: '0',
		signature: 'signature1'
	};
	const askSignedOrder: IStringSignedOrder = {
		exchangeAddress: '0x48bacb9266a570d521063ef5dd96e61686dbe788',
		makerAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
		takerAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
		senderAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
		feeRecipientAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
		expirationTimeSeconds: '1538117918',
		salt: '15105341483720',
		makerAssetAmount: '1000000000000000000',
		takerAssetAmount: '1000000000000000000',
		makerAssetData:
			'0xf47261b0000000000000000000000000871dd7c2b4b25e1aa18728e9d5f2af4c4e431f5c',
		takerAssetData:
			'0xf47261b00000000000000000000000000b1ba0af832d7c05fd64161e0db78e85978e8082',
		makerFee: '0',
		takerFee: '0',
		signature: 'signature2'
	};
	await orderMatchingUtil.processMatchSuccess(
		web3Util,
		'txHash',
		1234567890000,
		orderMatchReq,
		orderUtil.parseSignedOrder(bidSignedOrder),
		orderUtil.parseSignedOrder(askSignedOrder)
	);
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((dynamoUtil.addTrade as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock).mock.calls).toMatchSnapshot();
});

test('processMatchQueue, empty queue', async () => {
	orderMatchReq.takerSide = 'bid';
	redisUtil.pop = jest.fn(() => null);
	redisUtil.putBack = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	const web3Util = {
		getTransactionCount: jest.fn(() => 1),
		getGasPrice: jest.fn(() => 100000000),
		matchOrders: jest.fn(() => Promise.resolve()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve())
	} as any;
	orderMatchingUtil.processMatchSuccess = jest.fn();
	const isSuccess = await orderMatchingUtil.processMatchQueue(web3Util);
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.persistOrder as jest.Mock).not.toBeCalled();
	expect(web3Util.getTransactionCount as jest.Mock).not.toBeCalled();
	expect(web3Util.getGasPrice as jest.Mock).not.toBeCalled();
	expect(web3Util.matchOrders as jest.Mock).not.toBeCalled();
	expect(web3Util.awaitTransactionSuccessAsync as jest.Mock).not.toBeCalled();
	expect(isSuccess).toEqual(false);
});

test('processMatchQueue, no leftRawOrder', async () => {
	redisUtil.pop = jest.fn(() => JSON.stringify(orderMatchReq));
	redisUtil.putBack = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn(() => Promise.resolve(null));
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	const web3Util = {
		tokens: [],
		getTransactionCount: jest.fn(() => 1),
		getGasPrice: jest.fn(() => 100000000),
		matchOrders: jest.fn(() => Promise.resolve()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve())
	} as any;
	orderMatchingUtil.processMatchSuccess = jest.fn();
	const isSuccess = await orderMatchingUtil.processMatchQueue(web3Util);
	expect((redisUtil.pop as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(orderPersistenceUtil.persistOrder as jest.Mock).not.toBeCalled();
	expect(web3Util.getTransactionCount as jest.Mock).not.toBeCalled();
	expect(web3Util.getGasPrice as jest.Mock).not.toBeCalled();
	expect(web3Util.matchOrders as jest.Mock).not.toBeCalled();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	// expect((redisUtil.putBack  as jest.Mock).mock.calls).toMatchSnapshot();
	expect(web3Util.awaitTransactionSuccessAsync as jest.Mock).not.toBeCalled();
	expect(isSuccess).toEqual(true);
});

test('processMatchQueue, no rightRawOrder', async () => {
	redisUtil.pop = jest.fn(() => JSON.stringify(orderMatchReq));
	redisUtil.putBack = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair: string, orderHash: string) =>
		Promise.resolve(orderHash === '0xrightHash' ? null : pair)
	);
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	const web3Util = {
		tokens: [],
		getTransactionCount: jest.fn(() => 1),
		getGasPrice: jest.fn(() => 100000000),
		matchOrders: jest.fn(() => Promise.resolve()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve())
	} as any;
	orderMatchingUtil.processMatchSuccess = jest.fn();
	const isSuccess = await orderMatchingUtil.processMatchQueue(web3Util);
	expect((redisUtil.pop as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(orderPersistenceUtil.persistOrder as jest.Mock).not.toBeCalled();
	expect(web3Util.getTransactionCount as jest.Mock).not.toBeCalled();
	expect(web3Util.getGasPrice as jest.Mock).not.toBeCalled();
	expect(web3Util.matchOrders as jest.Mock).not.toBeCalled();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect(web3Util.awaitTransactionSuccessAsync as jest.Mock).not.toBeCalled();
	expect(isSuccess).toEqual(true);
});

const rawOrders: { [key: string]: IRawOrder } = {
	'0xleftHash': {
		pair: 'pair',
		orderHash: '0xleftHash',
		signedOrder: {
			exchangeAddress: '0x48bacb9266a570d521063ef5dd96e61686dbe788',
			makerAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
			takerAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
			senderAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
			feeRecipientAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
			expirationTimeSeconds: '1538117918',
			salt: '15105341483720',
			makerAssetAmount: '1000000000000000000',
			takerAssetAmount: '1000000000000000000',
			makerAssetData:
				'0xf47261b0000000000000000000000000871dd7c2b4b25e1aa18728e9d5f2af4c4e431f5c',
			takerAssetData:
				'0xf47261b00000000000000000000000000b1ba0af832d7c05fd64161e0db78e85978e8082',
			makerFee: '0',
			takerFee: '0',
			signature: 'signature1'
		}
	},
	'0xrightHash': {
		pair: 'pair',
		orderHash: '0xrightHash',
		signedOrder: {
			exchangeAddress: '0x48bacb9266a570d521063ef5dd96e61686dbe788',
			makerAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f871',
			takerAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
			senderAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
			feeRecipientAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
			expirationTimeSeconds: '1538117918',
			salt: '15105341483720',
			makerAssetAmount: '1000000000000000000',
			takerAssetAmount: '1000000000000000000',
			makerAssetData:
				'0xf47261b0000000000000000000000000871dd7c2b4b25e1aa18728e9d5f2af4c4e431f5c',
			takerAssetData:
				'0xf47261b00000000000000000000000000b1ba0af832d7c05fd64161e0db78e85978e8082',
			makerFee: '0',
			takerFee: '0',
			signature: 'signature2'
		}
	}
};

test('processMatchQueue, matchOrder revert', async () => {
	redisUtil.pop = jest.fn(() => JSON.stringify(orderMatchReq));
	redisUtil.putBack = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, hash) => {
		rawOrders[hash].pair = pair;
		return Promise.resolve(rawOrders[hash]);
	});
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	const web3Util = {
		tokens: [],
		getTransactionCount: jest.fn(() => 1),
		getGasPrice: jest.fn(() => 100000000),
		matchOrders: jest.fn(() => Promise.reject()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve())
	} as any;

	orderMatchingUtil.availableAddrs = ['address1', 'address2', 'address3'];
	orderMatchingUtil.currentAddrIdx = 0;
	orderMatchingUtil.processMatchSuccess = jest.fn();
	const isSuccess = await orderMatchingUtil.processMatchQueue(web3Util);
	expect((redisUtil.pop as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect(web3Util.awaitTransactionSuccessAsync as jest.Mock).not.toBeCalled();
	expect(isSuccess).toEqual(true);
});

test('processMatchQueue, persistOrder reject', async () => {
	redisUtil.pop = jest.fn(() => JSON.stringify(orderMatchReq));
	redisUtil.putBack = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, hash) => {
		rawOrders[hash].pair = pair;
		return Promise.resolve(rawOrders[hash]);
	});
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.reject());
	const web3Util = {
		tokens: [],
		getTransactionCount: jest.fn(() => 1),
		getGasPrice: jest.fn(() => 100000000),
		matchOrders: jest.fn(() => Promise.reject()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve())
	} as any;

	orderMatchingUtil.availableAddrs = ['address1', 'address2', 'address3'];
	orderMatchingUtil.currentAddrIdx = 0;
	orderMatchingUtil.processMatchSuccess = jest.fn();
	const isSuccess = await orderMatchingUtil.processMatchQueue(web3Util);
	expect((redisUtil.pop as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.putBack as jest.Mock).mock.calls).toMatchSnapshot();
	expect(web3Util.awaitTransactionSuccessAsync as jest.Mock).not.toBeCalled();
	expect(isSuccess).toEqual(false);
});

test('processMatchQueue, awaitTransactionSuccessAsync revert', async () => {
	redisUtil.pop = jest.fn(() => JSON.stringify(orderMatchReq));
	redisUtil.putBack = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, hash) => {
		rawOrders[hash].pair = pair;
		return Promise.resolve(rawOrders[hash]);
	});
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	const web3Util = {
		tokens: [],
		getTransactionCount: jest.fn(() => 1),
		getGasPrice: jest.fn(() => 100000000),
		matchOrders: jest.fn(() => Promise.resolve()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.reject())
	} as any;

	orderMatchingUtil.availableAddrs = ['address1', 'address2', 'address3'];
	orderMatchingUtil.currentAddrIdx = 0;
	orderMatchingUtil.processMatchSuccess = jest.fn();
	const isSuccess = await orderMatchingUtil.processMatchQueue(web3Util);
	expect((redisUtil.pop as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect((web3Util.awaitTransactionSuccessAsync as jest.Mock).mock.calls).toMatchSnapshot();
	expect(isSuccess).toEqual(true);
});

test('processMatchQueue, awaitTransactionSuccessAsync success', async () => {
	redisUtil.pop = jest.fn(() => JSON.stringify(orderMatchReq));
	redisUtil.putBack = jest.fn(() => Promise.resolve());
	dynamoUtil.addTrade = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, hash) => {
		rawOrders[hash].pair = pair;
		return Promise.resolve(rawOrders[hash]);
	});
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	const web3Util = {
		tokens: [],
		getTransactionCount: jest.fn(() => 1),
		getGasPrice: jest.fn(() => 100000000),
		matchOrders: jest.fn(() => Promise.resolve()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve({}))
	} as any;

	orderMatchingUtil.availableAddrs = ['address1', 'address2', 'address3'];
	orderMatchingUtil.currentAddrIdx = 0;
	orderMatchingUtil.processMatchSuccess = jest.fn();
	const isSuccess = await orderMatchingUtil.processMatchQueue(web3Util);
	expect((redisUtil.pop as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect((web3Util.awaitTransactionSuccessAsync as jest.Mock).mock.calls).toMatchSnapshot();
	expect(isSuccess).toEqual(true);
});

test('processMatchQueue, awaitTransactionSuccessAsync success partial', async () => {
	redisUtil.pop = jest.fn(() => JSON.stringify(orderMatchReq));
	redisUtil.putBack = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, hash) => {
		rawOrders[hash].pair = pair;
		return Promise.resolve(rawOrders[hash]);
	});
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	const web3Util = {
		tokens: [],
		getTransactionCount: jest.fn(() => 1),
		getGasPrice: jest.fn(() => 100000000),
		matchOrders: jest.fn(() => Promise.resolve()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve({}))
	} as any;

	orderMatchingUtil.availableAddrs = ['address1', 'address2', 'address3'];
	orderMatchingUtil.currentAddrIdx = 0;
	orderMatchingUtil.processMatchSuccess = jest.fn();
	const isSuccess = await orderMatchingUtil.processMatchQueue(web3Util);
	expect((redisUtil.pop as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect((web3Util.awaitTransactionSuccessAsync as jest.Mock).mock.calls).toMatchSnapshot();
	expect(isSuccess).toEqual(true);
});

test('processMatchQueue, awaitTransactionSuccessAsync success, not feeOnToken', async () => {
	orderMatchReq.feeAsset = 'code2';
	redisUtil.pop = jest.fn(() => JSON.stringify(orderMatchReq));
	redisUtil.putBack = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn((pair, hash) => {
		rawOrders[hash].pair = pair;
		return Promise.resolve(rawOrders[hash]);
	});
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve({}));
	const web3Util = {
		tokens: [],
		getTransactionCount: jest.fn(() => 1),
		getGasPrice: jest.fn(() => 100000000),
		matchOrders: jest.fn(() => Promise.resolve()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve({}))
	} as any;

	orderMatchingUtil.availableAddrs = ['address1', 'address2', 'address3'];
	orderMatchingUtil.currentAddrIdx = 0;
	orderMatchingUtil.processMatchSuccess = jest.fn();
	const isSuccess = await orderMatchingUtil.processMatchQueue(web3Util);
	expect((redisUtil.pop as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getRawOrderInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((web3Util.matchOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect((web3Util.awaitTransactionSuccessAsync as jest.Mock).mock.calls).toMatchSnapshot();
	expect(isSuccess).toEqual(true);
});
