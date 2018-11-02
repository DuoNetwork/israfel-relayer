import * as CST from '../common/constants';
import dynamoUtil from './dynamoUtil';
import orderUtil from './orderUtil';
import redisUtil from './redisUtil';
import Web3Util from './Web3Util';

const signedOrder = {
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
	signature: 'signature'
};

test('parseSignedOrder', () => expect(orderUtil.parseSignedOrder(signedOrder)).toMatchSnapshot());

test('constructNewLiveOrder', () => {
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_BID);
	expect(orderUtil.constructNewLiveOrder(signedOrder, 'pair', '0xOrderHash')).toMatchSnapshot();
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_ASK);
	expect(orderUtil.constructNewLiveOrder(signedOrder, 'pair', '0xOrderHash')).toMatchSnapshot();
});

const liveOrder = {
	account: '0xAccount',
	pair: 'pair',
	orderHash: '0xOrderHash',
	price: 0.123456789,
	amount: 456,
	side: CST.DB_BID,
	initialSequence: 1,
	currentSequence: 2
};

test('addUserOrderToDB', async () => {
	dynamoUtil.addUserOrder = jest.fn(() => Promise.resolve());
	expect(await orderUtil.addUserOrderToDB(liveOrder, 'type', 'status', 'updatedBy')).toMatchSnapshot();
})

test('addUserOrderToDB error', async () => {
	dynamoUtil.addUserOrder = jest.fn(() => Promise.reject('addUserOrderToDB'));
	expect(await orderUtil.addUserOrderToDB(liveOrder, 'type', 'status', 'updatedBy')).toMatchSnapshot();
})

const addOrderQueueItem = {
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

test('getLiveOrderInPersistence in cancel queue', async () => {
	redisUtil.hashGet = jest.fn(() => Promise.resolve('0xOrderHash'));
	expect(await orderUtil.getLiveOrderInPersistence('pair', '0xOrderHash')).toBeNull();
});

test('getLiveOrderInPersistence in add queue', async () => {
	redisUtil.hashGet = jest.fn((key: string, field: string) =>
		Promise.resolve(field.includes(CST.DB_ADD) ? JSON.stringify({ liveOrder: key }) : '')
	);
	expect(await orderUtil.getLiveOrderInPersistence('pair', '0xOrderHash')).toMatchSnapshot();
});

test('getLiveOrderInPersistence not exist', async () => {
	redisUtil.hashGet = jest.fn(() => Promise.resolve(''));
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
	expect(await orderUtil.getLiveOrderInPersistence('pair', '0xOrderHash')).toBeNull();
});

test('getLiveOrderInPersistence only in db', async () => {
	redisUtil.hashGet = jest.fn(() => Promise.resolve(''));
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([{ liveOrder: 'test' }]));
	expect(await orderUtil.getLiveOrderInPersistence('pair', '0xOrderHash')).toMatchSnapshot();
});

test('persistOrder', async () => {
	orderUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve({}));
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.hashSet = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn();
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve({}));

	expect(await orderUtil.persistOrder('method', {
		liveOrder: {
			orderHash: '0xOrderHash'
		} as any,
		signedOrder: 'may or may not exist' as any
	})).not.toBeNull();
	expect((redisUtil.hashSet as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.push as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
});

test('persistOrder add existing', async () => {
	orderUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve({}));
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.hashSet = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn();
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve({}));

	expect(await orderUtil.persistOrder('add', {
		liveOrder: {
			orderHash: '0xOrderHash'
		} as any,
		signedOrder: 'signedOrder' as any
	})).toBeNull();
	expect(redisUtil.hashSet as jest.Mock).not.toBeCalled()
	expect(redisUtil.push as jest.Mock).not.toBeCalled()
	expect(orderUtil.addUserOrderToDB as jest.Mock).not.toBeCalled()
});

test('persistOrder not add not existing', async () => {
	orderUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.hashSet = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn();
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve({}));

	expect(await orderUtil.persistOrder('method', {
		liveOrder: {
			orderHash: '0xOrderHash'
		} as any
	})).toBeNull();
	expect(redisUtil.hashSet as jest.Mock).not.toBeCalled()
	expect(redisUtil.push as jest.Mock).not.toBeCalled()
	expect(orderUtil.addUserOrderToDB as jest.Mock).not.toBeCalled()
});

test('processOrderQueue empty queue', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(''));
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.updateLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.processOrderQueue();
	expect(dynamoUtil.addRawOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.addLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.updateLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteRawOrderSignature as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteLiveOrder as jest.Mock).not.toBeCalled();
	expect(orderUtil.addUserOrderToDB as jest.Mock).not.toBeCalled();
	expect((redisUtil.pop as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect(isSuccess).toEqual(false);
});

test('processOrderQueue in queue but no key value', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('method|0xOrderHash'));
	redisUtil.hashGet = jest.fn(() => Promise.resolve(''));
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.updateLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.processOrderQueue();
	expect(dynamoUtil.addRawOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.addLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.updateLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteRawOrderSignature as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteLiveOrder as jest.Mock).not.toBeCalled();
	expect(orderUtil.addUserOrderToDB as jest.Mock).not.toBeCalled();
	expect((redisUtil.hashGet as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect(isSuccess).toEqual(false);
});

test('processOrderQueue add', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('add|0xOrderHash'));
	redisUtil.hashGet = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.hashDelete = jest.fn(() => Promise.resolve());
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.updateLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.processOrderQueue();
	expect((dynamoUtil.addRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((dynamoUtil.addLiveOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(dynamoUtil.updateLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteRawOrderSignature as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteLiveOrder as jest.Mock).not.toBeCalled();
	expect((orderUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect((redisUtil.hashDelete as jest.Mock).mock.calls).toMatchSnapshot();
	expect(isSuccess).toEqual(true);
});

test('processOrderQueue update', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('update|0xOrderHash'));
	redisUtil.hashGet = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.hashDelete = jest.fn(() => Promise.resolve());
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.updateLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.processOrderQueue();
	expect(dynamoUtil.addRawOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.addLiveOrder as jest.Mock).not.toBeCalled();
	expect((dynamoUtil.updateLiveOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(dynamoUtil.deleteRawOrderSignature as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteLiveOrder as jest.Mock).not.toBeCalled();
	expect((orderUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect((redisUtil.hashDelete as jest.Mock).mock.calls).toMatchSnapshot();
	expect(isSuccess).toEqual(true);
});

test('processOrderQueue cancel', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('cancel|0xOrderHash'));
	redisUtil.hashGet = jest.fn(() =>
		Promise.resolve(
			JSON.stringify({
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
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.processOrderQueue();
	expect(dynamoUtil.addRawOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.addLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.updateLiveOrder as jest.Mock).not.toBeCalled();
	expect((dynamoUtil.deleteRawOrderSignature as jest.Mock).mock.calls).toMatchSnapshot();
	expect((dynamoUtil.deleteLiveOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.putBack as jest.Mock).not.toBeCalled();
	expect((redisUtil.hashDelete as jest.Mock).mock.calls).toMatchSnapshot();
	expect(isSuccess).toEqual(true);
});

test('processOrderQueue failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('add|0xOrderHash'));
	redisUtil.hashGet = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.hashDelete = jest.fn(() => Promise.resolve());
	redisUtil.putBack = jest.fn();
	redisUtil.hashSet = jest.fn(() => Promise.resolve());
	dynamoUtil.addRawOrder = jest.fn(() => Promise.reject('processOrderQueue'));
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.updateLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.processOrderQueue();
	expect(dynamoUtil.addLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.updateLiveOrder as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteRawOrderSignature as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.deleteLiveOrder as jest.Mock).not.toBeCalled();
	expect(orderUtil.addUserOrderToDB as jest.Mock).not.toBeCalled();
	expect(redisUtil.hashDelete as jest.Mock).not.toBeCalled();
	expect((redisUtil.putBack as jest.Mock).mock.calls.length).toBe(1);
	expect((redisUtil.putBack as jest.Mock).mock.calls[0][0]).toEqual(
		(redisUtil.pop as jest.Mock).mock.calls[0][0]
	);
	expect((redisUtil.putBack as jest.Mock).mock.calls[0][1]).toEqual('add|0xOrderHash');
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
