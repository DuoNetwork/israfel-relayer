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

test('addOrderToDB no order', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(''));
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.addOrderToDB();
	expect((dynamoUtil.addRawOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((dynamoUtil.addLiveOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((dynamoUtil.addUserOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((redisUtil.pop as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(false);
});

test('addOrderToDB', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('0xorderHash'));
	redisUtil.get = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.set = jest.fn();
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.addOrderToDB();
	expect((dynamoUtil.addRawOrder as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect((dynamoUtil.addLiveOrder as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect((dynamoUtil.addUserOrder as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(true);
});

test('addOrderToDB rawOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('0xorderHash'));
	redisUtil.get = jest.fn(() => JSON.stringify(addOrderQueueItem))
	redisUtil.putBack = jest.fn();
	redisUtil.set = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.reject());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.addOrderToDB();
	expect((dynamoUtil.addLiveOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((dynamoUtil.addUserOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(1);
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls[0][0]).toEqual(
		(redisUtil.pop as jest.Mock<Promise<boolean>>).mock.calls[0][0]
	);
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls[0][1]).toEqual(
		'0xorderHash'
	);
	expect(isSuccess).toEqual(false);
});

test('addOrderToDB liveOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve('0xorderHash'));
	redisUtil.get = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.putBack = jest.fn();
	redisUtil.set = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.reject());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.addOrderToDB();
	expect((dynamoUtil.addUserOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(false);
});

test('addOrderToDB userOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(''));
	redisUtil.get = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.set = jest.fn();
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.reject());
	const isSuccess = await orderUtil.addOrderToDB();
	expect(isSuccess).toEqual(false);
});

test('cancelOrderInDB no order', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(''));
	redisUtil.putBack = jest.fn();
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.cancelOrderInDB();
	expect(
		(dynamoUtil.deleteRawOrderSignature as jest.Mock<Promise<boolean>>).mock.calls.length
	).toBe(0);
	expect((dynamoUtil.deleteLiveOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((dynamoUtil.addUserOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((redisUtil.pop as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(false);
});

test('cancelOrderInDB', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(liveOrder)));
	redisUtil.putBack = jest.fn();
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.cancelOrderInDB();
	expect(
		(dynamoUtil.deleteRawOrderSignature as jest.Mock<Promise<boolean>>).mock.calls
	).toMatchSnapshot();
	expect(
		(dynamoUtil.deleteLiveOrder as jest.Mock<Promise<boolean>>).mock.calls
	).toMatchSnapshot();
	expect((dynamoUtil.addUserOrder as jest.Mock<Promise<boolean>>).mock.calls).toMatchSnapshot();
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(true);
});

test('cancelOrderInDB rawOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(liveOrder)));
	redisUtil.putBack = jest.fn();
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.reject());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.cancelOrderInDB();
	expect((dynamoUtil.deleteLiveOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((dynamoUtil.addUserOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(1);
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls[0][0]).toEqual(
		(redisUtil.pop as jest.Mock<Promise<boolean>>).mock.calls[0][0]
	);
	expect((redisUtil.putBack as jest.Mock<Promise<boolean>>).mock.calls[0][1]).toEqual(
		JSON.stringify(liveOrder)
	);
	expect(isSuccess).toEqual(false);
});

test('cancelOrderInDB liveOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(liveOrder)));
	redisUtil.putBack = jest.fn();
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.reject());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.cancelOrderInDB();
	expect((dynamoUtil.addUserOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(false);
});

test('cancelOrderInDB userOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve());
	redisUtil.putBack = jest.fn();
	redisUtil.set = jest.fn();
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.reject());
	const isSuccess = await orderUtil.cancelOrderInDB();
	expect(isSuccess).toEqual(false);
});
