// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';

import * as CST from '../common/constants';
import dynamoUtil from './dynamoUtil';
import orderPersistenceUtil from './orderPersistenceUtil';
import orderUtil from './orderUtil';
import redisUtil from './redisUtil';
import Web3Util from './Web3Util';

test('subscribeOrderUpdate', () => {
	redisUtil.onOrderUpdate = jest.fn();
	redisUtil.subscribe = jest.fn();
	orderPersistenceUtil.subscribeOrderUpdate('code1|code2', (() => ({})) as any);
	expect((redisUtil.subscribe as jest.Mock).mock.calls).toMatchSnapshot();
});

test('subscribeOrderUpdate', () => {
	redisUtil.unsubscribe = jest.fn();
	orderPersistenceUtil.unsubscribeOrderUpdate('code1|code2');
	expect((redisUtil.unsubscribe as jest.Mock).mock.calls).toMatchSnapshot();
});

const liveOrder = {
	account: '0xAccount',
	pair: 'code1|code2',
	orderHash: '0xOrderHash',
	price: 0.123456789,
	amount: 456,
	balance: 123,
	matching: 99,
	fill: 234,
	side: CST.DB_BID,
	fee: 1,
	feeAsset: 'feeAsset',
	createdAt: 1111111111,
	expiry: 1234567890,
	initialSequence: 1,
	currentSequence: 2
};

test('addUserOrderToDB', async () => {
	dynamoUtil.addUserOrder = jest.fn(() => Promise.resolve());
	expect(
		await orderPersistenceUtil.addUserOrderToDB(liveOrder, 'type', 'status', 'updatedBy', true, 'txHash')
	).toMatchSnapshot();
});

test('addUserOrderToDB error', async () => {
	dynamoUtil.addUserOrder = jest.fn(() => Promise.reject('addUserOrderToDB'));
	expect(
		await orderPersistenceUtil.addUserOrderToDB(liveOrder, 'type', 'status', 'updatedBy', false, 'txHash')
	).toMatchSnapshot();
});

const addOrderQueueItem = {
	method: 'method',
	status: 'status',
	requestor: 'requestor',
	liveOrder: liveOrder,
	signedOrder: {
		senderAddress: 'senderAddress',
		makerAddress: 'makerAddress',
		takerAddress: 'takerAddress',
		makerFee: Web3Util.stringToBN('0'),
		takerFee: Web3Util.stringToBN('0'),
		makerAssetAmount: Web3Util.stringToBN('123'),
		takerAssetAmount: Web3Util.stringToBN('456'),
		makerAssetData: 'makerAssetData',
		takerAssetData: 'takerAssetData',
		salt: Web3Util.stringToBN('789'),
		exchangeAddress: 'exchangeAddress',
		feeRecipientAddress: 'feeRecipientAddress',
		expirationTimeSeconds: Web3Util.stringToBN('1234567890'),
		signature: 'signature'
	}
};

test('getLiveOrderInPersistence in terminate queue', async () => {
	redisUtil.hashMultiGet = jest.fn(() =>
		Promise.resolve({
			['code1|code2|terminate|0xOrderHash']: 'terminate',
			['code1|code2|update|0xOrderHash']: JSON.stringify({ liveOrder: 'liveOrder' }),
			['code1|code2|add|0xOrderhash']: JSON.stringify({ liveOrder: 'liveOrder' })
		})
	);
	expect(await orderPersistenceUtil.getLiveOrderInPersistence('code1|code2', '0xOrderHash')).toBeNull();
});

test('getLiveOrderInPersistence in update queue', async () => {
	redisUtil.hashMultiGet = jest.fn(() =>
		Promise.resolve({
			['code1|code2|terminate|0xOrderHash']: null,
			['code1|code2|update|0xOrderHash']: JSON.stringify({ liveOrder: 'liveOrder' }),
			['code1|code2|add|0xOrderhash']: JSON.stringify({ liveOrder: 'liveOrder' })
		})
	);
	expect(
		await orderPersistenceUtil.getLiveOrderInPersistence('code1|code2', '0xOrderHash')
	).toMatchSnapshot();
});

test('getLiveOrderInPersistence in add queue', async () => {
	redisUtil.hashMultiGet = jest.fn(() =>
		Promise.resolve({
			['code1|code2|terminate|0xOrderHash']: null,
			['code1|code2|update|0xOrderHash']: null,
			['code1|code2|add|0xOrderHash']: JSON.stringify({ liveOrder: 'liveOrder' })
		})
	);
	expect(
		await orderPersistenceUtil.getLiveOrderInPersistence('code1|code2', '0xOrderHash')
	).toMatchSnapshot();
});

test('getLiveOrderInPersistence not exist', async () => {
	redisUtil.hashMultiGet = jest.fn(() =>
		Promise.resolve({
			['code1|code2|terminate|0xOrderHash']: null,
			['code1|code2|update|0xOrderHash']: null,
			['code1|code2|add|0xOrderHash']: null
		})
	);
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
	expect(await orderPersistenceUtil.getLiveOrderInPersistence('code1|code2', '0xOrderHash')).toBeNull();
});

test('getLiveOrderInPersistence only in db', async () => {
	redisUtil.hashMultiGet = jest.fn(() =>
		Promise.resolve({
			['code1|code2|terminate|0xOrderHash']: null,
			['code1|code2|update|0xOrderHash']: null,
			['code1|code2|add|0xOrderHash']: null
		})
	);
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([{ liveOrder: 'test' }]));
	expect(
		await orderPersistenceUtil.getLiveOrderInPersistence('code1|code2', '0xOrderHash')
	).toMatchSnapshot();
});

test('persistOrder add missing token', async () => {
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
	redisUtil.increment = jest.fn(() => Promise.resolve(123));
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.hashSet = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn();
	redisUtil.publish = jest.fn(() => Promise.resolve());
	orderUtil.constructNewLiveOrder = jest.fn(() => ({ test: 'liveOrder' }));
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve({}));

	expect(
		await orderPersistenceUtil.persistOrder({
			method: CST.DB_ADD,
			status: 'status',
			requestor: 'requestor',
			pair: 'code1|code2',
			orderHash: '0xOrderHash',
			signedOrder: 'may or may not exist' as any
		})
	).toBeNull();
	expect(orderPersistenceUtil.getLiveOrderInPersistence as jest.Mock).not.toBeCalled();
	expect(redisUtil.hashSet as jest.Mock).not.toBeCalled();
	expect(redisUtil.push as jest.Mock).not.toBeCalled();
	expect(redisUtil.publish as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.addUserOrderToDB as jest.Mock).not.toBeCalled();
});

test('persistOrder add', async () => {
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
	redisUtil.increment = jest.fn(() => Promise.resolve(123));
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.hashSet = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn();
	redisUtil.publish = jest.fn(() => Promise.resolve());
	orderUtil.constructNewLiveOrder = jest.fn(() => ({ test: 'liveOrder' }));
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve({}));

	expect(
		await orderPersistenceUtil.persistOrder({
			method: CST.DB_ADD,
			status: 'status',
			requestor: 'requestor',
			pair: 'code1|code2',
			token: 'token' as any,
			orderHash: '0xOrderHash',
			signedOrder: 'may or may not exist' as any
		})
	).not.toBeNull();
	expect((redisUtil.hashSet as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.push as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
});

test('persistOrder not add fill', async () => {
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() =>
		Promise.resolve({
			amount: 100,
			matching: 50,
			balance: 40,
			fill: 10
		})
	);
	redisUtil.increment = jest.fn(() => Promise.resolve(123));
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.hashSet = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn();
	redisUtil.publish = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve({}));

	expect(
		await orderPersistenceUtil.persistOrder({
			method: 'method',
			status: 'status',
			requestor: 'requestor',
			pair: 'code1|code2',
			token: 'token' as any,
			orderHash: '0xOrderHash',
			fill: 40
		})
	).not.toBeNull();
	expect((redisUtil.hashSet as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.push as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
});

test('persistOrder not add match', async () => {
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() =>
		Promise.resolve({
			amount: 100,
			matching: 50,
			balance: 40,
			fill: 10
		})
	);
	redisUtil.increment = jest.fn(() => Promise.resolve(123));
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.hashSet = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn();
	redisUtil.publish = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve({}));

	expect(
		await orderPersistenceUtil.persistOrder({
			method: 'method',
			status: 'status',
			requestor: 'requestor',
			pair: 'code1|code2',
			token: 'token' as any,
			orderHash: '0xOrderHash',
			matching: 20,
			transactionHash: 'txHash'
		})
	).not.toBeNull();
	expect((redisUtil.hashSet as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.push as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
});

test('persistOrder add existing', async () => {
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve({}));
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.hashSet = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn();
	redisUtil.publish = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve({}));

	expect(
		await orderPersistenceUtil.persistOrder({
			method: CST.DB_ADD,
			status: 'status',
			requestor: 'requestor',
			pair: 'code1|code2',
			token: 'token' as any,
			orderHash: '0xOrderHash',
			signedOrder: 'signedOrder' as any
		})
	).toBeNull();
	expect(redisUtil.hashSet as jest.Mock).not.toBeCalled();
	expect(redisUtil.push as jest.Mock).not.toBeCalled();
	expect(redisUtil.publish as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.addUserOrderToDB as jest.Mock).not.toBeCalled();
});

test('persistOrder not add not existing', async () => {
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.hashSet = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn();
	redisUtil.publish = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve({}));

	expect(
		await orderPersistenceUtil.persistOrder({
			method: 'method',
			status: 'status',
			requestor: 'requestor',
			pair: 'code1|code2',
			token: 'token' as any,
			orderHash: '0xOrderHash'
		})
	).toBeNull();
	expect(redisUtil.hashSet as jest.Mock).not.toBeCalled();
	expect(redisUtil.push as jest.Mock).not.toBeCalled();
	expect(redisUtil.publish as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.addUserOrderToDB as jest.Mock).not.toBeCalled();
});

test('persistOrder terminate fill', async () => {
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() =>
		Promise.resolve({
			amount: 100
		})
	);
	redisUtil.increment = jest.fn(() => Promise.resolve(123));
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.hashSet = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn();
	redisUtil.publish = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve({}));

	expect(
		await orderPersistenceUtil.persistOrder({
			method: CST.DB_TERMINATE,
			status: CST.DB_FILL,
			requestor: 'requestor',
			pair: 'code1|code2',
			token: 'token' as any,
			orderHash: '0xOrderHash'
		})
	).not.toBeNull();
	expect((redisUtil.hashSet as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.push as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
});

test('processOrderQueue empty queue', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(''));
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.updateLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderPersistenceUtil.processOrderQueue();
	expect(dynamoUtil.addRawOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.addLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.updateLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteRawOrderSignature as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteLiveOrder as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.addUserOrderToDB as jest.Mock).not.toBeCalled();
	expect((redisUtil.pop as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect(isSuccess).toEqual(false);
});

test('processOrderQueue in queue but no key value', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('code1|code2|method|0xOrderHash'));
	redisUtil.hashGet = jest.fn(() => Promise.resolve(''));
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.updateLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderPersistenceUtil.processOrderQueue();
	expect(dynamoUtil.addRawOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.addLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.updateLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteRawOrderSignature as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteLiveOrder as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.addUserOrderToDB as jest.Mock).not.toBeCalled();
	expect((redisUtil.hashGet as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect(isSuccess).toEqual(true);
});

test('processOrderQueue add', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('code1|code2|add|0xOrderHash'));
	redisUtil.hashGet = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.hashDelete = jest.fn(() => Promise.resolve());
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.updateLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderPersistenceUtil.processOrderQueue();
	expect((dynamoUtil.addRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((dynamoUtil.addLiveOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(dynamoUtil.updateLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteRawOrderSignature as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteLiveOrder as jest.Mock).not.toBeCalled();
	expect((orderPersistenceUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.hashGet as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect((redisUtil.hashDelete as jest.Mock).mock.calls).toMatchSnapshot();
	expect(isSuccess).toEqual(true);
});

test('processOrderQueue update', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('code1|code2|update|0xOrderHash'));
	redisUtil.hashGet = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.hashDelete = jest.fn(() => Promise.resolve());
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.updateLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderPersistenceUtil.processOrderQueue();
	expect(dynamoUtil.addRawOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.addLiveOrder as jest.Mock).not.toBeCalled();
	expect((dynamoUtil.updateLiveOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(dynamoUtil.deleteRawOrderSignature as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteLiveOrder as jest.Mock).not.toBeCalled();
	expect((orderPersistenceUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.hashGet as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect((redisUtil.hashDelete as jest.Mock).mock.calls).toMatchSnapshot();
	expect(isSuccess).toEqual(true);
});

test('processOrderQueue terminate', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('code1|code2|terminate|0xOrderHash'));
	redisUtil.hashGet = jest.fn(() =>
		Promise.resolve(
			JSON.stringify({
				method: 'method',
				status: 'status',
				requestor: 'requestor',
				liveOrder: liveOrder
			})
		)
	);
	redisUtil.hashDelete = jest.fn(() => Promise.resolve());
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.updateLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderPersistenceUtil.processOrderQueue();
	expect(dynamoUtil.addRawOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.addLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.updateLiveOrder as jest.Mock).not.toBeCalled();
	expect((dynamoUtil.deleteRawOrderSignature as jest.Mock).mock.calls).toMatchSnapshot();
	expect((dynamoUtil.deleteLiveOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.hashGet as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect((redisUtil.hashDelete as jest.Mock).mock.calls).toMatchSnapshot();
	expect(isSuccess).toEqual(true);
});

test('processOrderQueue failed', async () => {
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.pop = jest.fn(() => Promise.resolve('code1|code2|add|0xOrderHash'));
	redisUtil.hashGet = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.hashDelete = jest.fn(() => Promise.resolve());
	redisUtil.putBack = jest.fn();
	redisUtil.hashSet = jest.fn(() => Promise.resolve());
	dynamoUtil.addRawOrder = jest.fn(() => Promise.reject('processOrderQueue'));
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.updateLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderPersistenceUtil.processOrderQueue();
	expect(dynamoUtil.addLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.updateLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteRawOrderSignature as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteLiveOrder as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.addUserOrderToDB as jest.Mock).not.toBeCalled();
	expect((redisUtil.hashGet as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.hashDelete as jest.Mock).not.toBeCalled();
	expect((redisUtil.putBack as jest.Mock).mock.calls.length).toBe(1);
	expect((redisUtil.putBack as jest.Mock).mock.calls[0][0]).toEqual(
		(redisUtil.pop as jest.Mock).mock.calls[0][0]
	);
	expect((redisUtil.putBack as jest.Mock).mock.calls[0][1]).toEqual('code1|code2|add|0xOrderHash');
	expect((redisUtil.hashSet as jest.Mock).mock.calls.length).toBe(1);
	expect((redisUtil.hashSet as jest.Mock).mock.calls[0][0]).toEqual(
		(redisUtil.hashGet as jest.Mock).mock.calls[0][0]
	);
	expect((redisUtil.hashSet as jest.Mock).mock.calls[0][1]).toEqual(
		(redisUtil.hashGet as jest.Mock).mock.calls[0][1]
	);
	expect((redisUtil.hashSet as jest.Mock).mock.calls[0][2]).toEqual(
		JSON.stringify(addOrderQueueItem)
	);
	expect(isSuccess).toEqual(false);
});

test('getAllLiveOrdersInPersistence only add in redis', async () => {
	redisUtil.hashGetAll = jest.fn(() =>
		Promise.resolve({
			'code1|code2|add|0xOrderHash': JSON.stringify({ liveOrder: 'add' })
		})
	);
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
	expect(await orderPersistenceUtil.getAllLiveOrdersInPersistence('code1|code2')).toMatchSnapshot();
	expect((redisUtil.hashGetAll as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getAllLiveOrdersInPersistence add and update in redis', async () => {
	redisUtil.hashGetAll = jest.fn(() =>
		Promise.resolve({
			'code1|code2|add|0xOrderHash': JSON.stringify({ liveOrder: 'add' }),
			'code1|code2|update|0xOrderHash': JSON.stringify({ liveOrder: 'update' })
		})
	);
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
	expect(await orderPersistenceUtil.getAllLiveOrdersInPersistence('code1|code2')).toMatchSnapshot();
});

test('getAllLiveOrdersInPersistence add and terminate in redis', async () => {
	redisUtil.hashGetAll = jest.fn(() =>
		Promise.resolve({
			'code1|code2|add|0xOrderHash': JSON.stringify({ liveOrder: 'add' }),
			'code1|code2|terminate|0xOrderHash': JSON.stringify({ liveOrder: 'terminate' })
		})
	);
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
	expect(await orderPersistenceUtil.getAllLiveOrdersInPersistence('code1|code2')).toEqual({});
});

test('getAllLiveOrdersInPersistence add, update and terminate in redis', async () => {
	redisUtil.hashGetAll = jest.fn(() =>
		Promise.resolve({
			'code1|code2|add|0xOrderHash': JSON.stringify({ liveOrder: 'add' }),
			'code1|code2|update|0xOrderHash': JSON.stringify({ liveOrder: 'update' }),
			'code1|code2|terminate|0xOrderHash': JSON.stringify({ liveOrder: 'terminate' })
		})
	);
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
	expect(await orderPersistenceUtil.getAllLiveOrdersInPersistence('code1|code2')).toEqual({});
});

test('getAllLiveOrdersInPersistence update in redis and exist in db', async () => {
	redisUtil.hashGetAll = jest.fn(() =>
		Promise.resolve({
			'code1|code2|update|0xOrderHash': JSON.stringify({ liveOrder: 'update' })
		})
	);
	dynamoUtil.getLiveOrders = jest.fn(() =>
		Promise.resolve([
			{
				orderHash: '0xOrderHash'
			}
		])
	);
	expect(await orderPersistenceUtil.getAllLiveOrdersInPersistence('code1|code2')).toMatchSnapshot();
});

test('getAllLiveOrdersInPersistence update and temrinate in redis and exist in db', async () => {
	redisUtil.hashGetAll = jest.fn(() =>
		Promise.resolve({
			'code1|code2|update|0xOrderHash': JSON.stringify({ liveOrder: 'update' }),
			'code1|code2|terminate|0xOrderHash': JSON.stringify({ liveOrder: 'terminate' })
		})
	);
	dynamoUtil.getLiveOrders = jest.fn(() =>
		Promise.resolve([
			{
				orderHash: '0xOrderHash'
			}
		])
	);
	expect(await orderPersistenceUtil.getAllLiveOrdersInPersistence('code1|code2')).toEqual({});
});

test('getAllLiveOrdersInPersistence temrinate in redis and exist in db', async () => {
	redisUtil.hashGetAll = jest.fn(() =>
		Promise.resolve({
			'code1|code2|terminate|0xOrderHash': JSON.stringify({ liveOrder: 'terminate' })
		})
	);
	dynamoUtil.getLiveOrders = jest.fn(() =>
		Promise.resolve([
			{
				orderHash: '0xOrderHash'
			}
		])
	);
	expect(await orderPersistenceUtil.getAllLiveOrdersInPersistence('code1|code2')).toEqual({});
});

test('getRawOrderInPersistence in terminate queue', async () => {
	redisUtil.hashMultiGet = jest.fn(() =>
		Promise.resolve({
			['code1|code2|terminate|0xOrderHash']: 'terminate',
			['code1|code2|add|0xOrderhash']: JSON.stringify({ liveOrder: 'liveOrder' })
		})
	);
	expect(await orderPersistenceUtil.getRawOrderInPersistence('code1|code2', '0xOrderHash')).toBeNull();
	expect((redisUtil.hashMultiGet as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getRawOrderInPersistence in add queue', async () => {
	redisUtil.hashMultiGet = jest.fn(() =>
		Promise.resolve({
			['code1|code2|terminate|0xOrderHash']: null,
			['code1|code2|add|0xOrderHash']: JSON.stringify({ signedOrder: 'signedOrder' })
		})
	);
	expect(await orderPersistenceUtil.getRawOrderInPersistence('code1|code2', '0xOrderHash')).toMatchSnapshot();
});

test('getRawOrderInPersistence in dynamo but no signature', async () => {
	redisUtil.hashMultiGet = jest.fn(() =>
		Promise.resolve({
			['code1|code2|terminate|0xOrderHash']: null,
			['code1|code2|add|0xOrderHash']: null
		})
	);
	dynamoUtil.getRawOrder = jest.fn(() =>
		Promise.resolve({
			orderHash: '0xOrderHash',
			signedOrder: {
				signature: ''
			}
		})
	);
	expect(await orderPersistenceUtil.getRawOrderInPersistence('code1|code2', '0xOrderHash')).toBeNull();
	expect((dynamoUtil.getRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getRawOrderInPersistence in dynamo', async () => {
	redisUtil.hashMultiGet = jest.fn(() =>
		Promise.resolve({
			['code1|code2|terminate|0xOrderHash']: null,
			['code1|code2|add|0xOrderHash']: null
		})
	);
	dynamoUtil.getRawOrder = jest.fn(() =>
		Promise.resolve({
			orderHash: '0xOrderHash',
			signedOrder: {
				signature: 'signature'
			}
		})
	);
	expect(await orderPersistenceUtil.getRawOrderInPersistence('code1|code2', '0xOrderHash')).toMatchSnapshot();
	expect((dynamoUtil.getRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getRawOrderInPersistence not in neither', async () => {
	redisUtil.hashMultiGet = jest.fn(() =>
		Promise.resolve({
			['code1|code2|terminate|0xOrderHash']: null,
			['code1|code2|add|0xOrderHash']: null
		})
	);
	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve(null));
	expect(await orderPersistenceUtil.getRawOrderInPersistence('code1|code2', '0xOrderHash')).toBeNull();
	expect((dynamoUtil.getRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
});
