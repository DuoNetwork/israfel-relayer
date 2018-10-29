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

test('constructUserOrder', () => {
	expect(orderUtil.constructUserOrder(liveOrder, 'type', 'status', 'updatedBy'));
});

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
	redisUtil.get = jest.fn(() => Promise.resolve('0xOrderHash'));
	expect(await orderUtil.getLiveOrderInPersistence('pair', '0xOrderHash')).toBeNull();
});

test('getLiveOrderInPersistence in add queue', async () => {
	redisUtil.get = jest.fn((key: string) =>
		Promise.resolve(key.includes(CST.DB_ADD) ? JSON.stringify({ liveOrder: 'test' }) : '')
	);
	expect(await orderUtil.getLiveOrderInPersistence('pair', '0xOrderHash')).toMatchSnapshot();
});

test('getLiveOrderInPersistence not exist', async () => {
	redisUtil.get = jest.fn(() => Promise.resolve(''));
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
	expect(await orderUtil.getLiveOrderInPersistence('pair', '0xOrderHash')).toBeNull();
});

test('getLiveOrderInPersistence only in db', async () => {
	redisUtil.get = jest.fn(() => Promise.resolve(''));
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([{ liveOrder: 'test' }]));
	expect(await orderUtil.getLiveOrderInPersistence('pair', '0xOrderHash')).toMatchSnapshot();
});

test('addOrderToPersistence failed', async () => {
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.set = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn(() => {
		throw new Error('test');
	});

	expect(await orderUtil.addOrderToPersistence({} as any)).toBeNull();
});

test('addOrderToPersistence', async () => {
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.set = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn();
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());

	await orderUtil.addOrderToPersistence({
		liveOrder: {
			orderHash: '0xOrderHash'
		}
	} as any);
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect((redisUtil.push as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect(
		(orderUtil.addUserOrderToDB as jest.Mock<Promise<boolean>>).mock.calls
	).toMatchSnapshot();
});

test('cancelOrderInPersistence failed', async () => {
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.set = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn(() => {
		throw new Error('test');
	});

	expect(await orderUtil.cancelOrderInPersistence({} as any)).toBeNull();
});

test('cancelOrderInPersistence', async () => {
	redisUtil.multi = jest.fn(() => Promise.resolve());
	redisUtil.exec = jest.fn(() => Promise.resolve());
	redisUtil.set = jest.fn(() => Promise.resolve());
	redisUtil.push = jest.fn();
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());

	await orderUtil.cancelOrderInPersistence({
		orderHash: '0xOrderHash'
	} as any);

	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect((redisUtil.push as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect(
		(orderUtil.addUserOrderToDB as jest.Mock<Promise<boolean>>).mock.calls
	).toMatchSnapshot();
});

test('addOrderToDB not in queue', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(''));
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.addOrderToDB();
	expect((dynamoUtil.addRawOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((dynamoUtil.addLiveOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((orderUtil.addUserOrderToDB as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((redisUtil.pop as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(false);
});

test('addOrderToDB in queue but no key value', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('0xorderHash'));
	redisUtil.get = jest.fn(() => Promise.resolve(''));
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.addOrderToDB();
	expect((dynamoUtil.addRawOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((dynamoUtil.addLiveOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((orderUtil.addUserOrderToDB as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((redisUtil.pop as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(true);
});

test('addOrderToDB', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('0xorderHash'));
	redisUtil.get = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.set = jest.fn(() => Promise.resolve());
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.addOrderToDB();
	expect((dynamoUtil.addRawOrder as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect((dynamoUtil.addLiveOrder as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect(
		(orderUtil.addUserOrderToDB as jest.Mock<Promise<boolean>>).mock.calls
	).toMatchSnapshot();
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(1);
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls[0][0]).toEqual(
		(redisUtil.get as jest.Mock<Promise<boolean>>).mock.calls[0][0]
	);
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls[0][1]).toEqual('');
	expect(isSuccess).toEqual(true);
});

test('addOrderToDB rawOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('0xorderHash'));
	redisUtil.get = jest.fn(() => JSON.stringify(addOrderQueueItem));
	redisUtil.putBack = jest.fn();
	redisUtil.set = jest.fn(() => Promise.resolve());
	dynamoUtil.addRawOrder = jest.fn(() => Promise.reject());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.addOrderToDB();
	expect((dynamoUtil.addLiveOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((orderUtil.addUserOrderToDB as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(1);
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls[0][0]).toEqual(
		(redisUtil.pop as jest.Mock<Promise<boolean>>).mock.calls[0][0]
	);
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls[0][1]).toEqual(
		'0xorderHash'
	);
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(1);
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls[0][0]).toEqual(
		(redisUtil.get as jest.Mock<Promise<boolean>>).mock.calls[0][0]
	);
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls[0][1]).toEqual(
		JSON.stringify(addOrderQueueItem)
	);
	expect(isSuccess).toEqual(false);
});

test('addOrderToDB liveOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('0xorderHash'));
	redisUtil.get = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.putBack = jest.fn();
	redisUtil.set = jest.fn(() => Promise.resolve());
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.reject());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.addOrderToDB();
	expect((orderUtil.addUserOrderToDB as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(false);
});

test('cancelOrderInDB no order', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(''));
	redisUtil.putBack = jest.fn();
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.cancelOrderInDB();
	expect(
		(dynamoUtil.deleteRawOrderSignature as jest.Mock<Promise<boolean>>).mock.calls.length
	).toBe(0);
	expect((dynamoUtil.deleteLiveOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((orderUtil.addUserOrderToDB as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((redisUtil.pop as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(false);
});

test('cancelOrderInDB', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(liveOrder)));
	redisUtil.putBack = jest.fn();
	redisUtil.set = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.cancelOrderInDB();
	expect(
		(dynamoUtil.deleteRawOrderSignature as jest.Mock<Promise<boolean>>).mock.calls
	).toMatchSnapshot();
	expect(
		(dynamoUtil.deleteLiveOrder as jest.Mock<Promise<boolean>>).mock.calls
	).toMatchSnapshot();
	expect(
		(orderUtil.addUserOrderToDB as jest.Mock<Promise<boolean>>).mock.calls
	).toMatchSnapshot();
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(1);
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls[0][0]).toMatchSnapshot();
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls[0][1]).toEqual('');
	expect(isSuccess).toEqual(true);
});

test('cancelOrderInDB rawOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(liveOrder)));
	redisUtil.putBack = jest.fn();
	redisUtil.set = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.reject());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.cancelOrderInDB();
	expect((dynamoUtil.deleteLiveOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((orderUtil.addUserOrderToDB as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(1);
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls[0][1]).toEqual(
		JSON.stringify(liveOrder)
	);
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(1);
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls[0][0]).toMatchSnapshot();
	expect((redisUtil.set as jest.Mock<Promise<boolean>>).mock.calls[0][1]).toEqual(
		liveOrder.orderHash
	);
	expect(isSuccess).toEqual(false);
});

test('cancelOrderInDB liveOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(liveOrder)));
	redisUtil.putBack = jest.fn();
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.reject());
	orderUtil.addUserOrderToDB = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.cancelOrderInDB();
	expect((orderUtil.addUserOrderToDB as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(false);
});
