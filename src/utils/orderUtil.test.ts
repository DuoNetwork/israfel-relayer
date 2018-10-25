import * as CST from '../common/constants';
import dynamoUtil from './dynamoUtil';
import orderUtil from './orderUtil';
import redisUtil from './redisUtil';
import util from './util';

test('parseSignedOrder', () =>
	expect(
		orderUtil.parseSignedOrder({
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
		})
	).toMatchSnapshot());

const liveOrder = {
	pair: 'pair',
	orderHash: '0xOrderHash',
	price: 0.123456789,
	amount: 456,
	side: CST.DB_BID,
	initialSequence: 1,
	currentSequence: 2
};

test('getUserOrder', () => {
	expect(orderUtil.getUserOrder('type', '0xAccount', liveOrder));
});

const addOrderQueueItem = {
	liveOrder: liveOrder,
	rawOrder: {
		orderHash: '0xOrderHash',
		signedOrder: {
			senderAddress: 'senderAddress',
			makerAddress: 'makerAddress',
			takerAddress: 'takerAddress',
			makerFee: util.stringToBN('0'),
			takerFee: util.stringToBN('0'),
			makerAssetAmount: util.stringToBN('123'),
			takerAssetAmount: util.stringToBN('456'),
			makerAssetData: 'makerAssetData',
			takerAssetData: 'takerAssetData',
			salt: util.stringToBN('789'),
			exchangeAddress: 'exchangeAddress',
			feeRecipientAddress: 'feeRecipientAddress',
			expirationTimeSeconds: util.stringToBN('1234567890'),
			signature: 'signature'
		}
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
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
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
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.putBack = jest.fn();
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
		JSON.stringify(addOrderQueueItem)
	);
	expect(isSuccess).toEqual(false);
});

test('addOrderToDB liveOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.reject());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.addOrderToDB();
	expect((dynamoUtil.addUserOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(false);
});

test('addOrderToDB userOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(addOrderQueueItem)));
	redisUtil.putBack = jest.fn();
	dynamoUtil.addRawOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.reject());
	const isSuccess = await orderUtil.addOrderToDB();
	expect(isSuccess).toEqual(false);
});

const cancelOrderQueueItem = {
	liveOrder: liveOrder,
	account: '0xAccount'
};

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
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(cancelOrderQueueItem)));
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
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(cancelOrderQueueItem)));
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
		JSON.stringify(cancelOrderQueueItem)
	);
	expect(isSuccess).toEqual(false);
});

test('cancelOrderInDB liveOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(cancelOrderQueueItem)));
	redisUtil.putBack = jest.fn();
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.reject());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.resolve());
	const isSuccess = await orderUtil.cancelOrderInDB();
	expect((dynamoUtil.addUserOrder as jest.Mock<Promise<boolean>>).mock.calls.length).toBe(0);
	expect(isSuccess).toEqual(false);
});

test('cancelOrderInDB userOrder failed', async () => {
	redisUtil.pop = jest.fn(() => Promise.resolve(JSON.stringify(cancelOrderQueueItem)));
	redisUtil.putBack = jest.fn();
	dynamoUtil.deleteRawOrderSignature = jest.fn(() => Promise.resolve());
	dynamoUtil.deleteLiveOrder = jest.fn(() => Promise.resolve());
	dynamoUtil.addUserOrder = jest.fn(() => Promise.reject());
	const isSuccess = await orderUtil.cancelOrderInDB();
	expect(isSuccess).toEqual(false);
});
