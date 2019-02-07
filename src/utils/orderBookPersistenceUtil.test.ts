import orderBookSnapshot from '../samples/test/orderBookSnapshot.json';
import orderBookPersistenceUtil from './orderBookPersistenceUtil';
import redisUtil from './redisUtil';

test('subscribeOrderBookUpdate', () => {
	redisUtil.onOrderUpdate = jest.fn();
	redisUtil.subscribe = jest.fn();
	orderBookPersistenceUtil.subscribeOrderBookUpdate('pair', (() => ({})) as any);
	expect((redisUtil.subscribe as jest.Mock).mock.calls).toMatchSnapshot();
});

test('unsubscribeOrderBookUpdate', () => {
	redisUtil.unsubscribe = jest.fn();
	orderBookPersistenceUtil.unsubscribeOrderBookUpdate('pair');
	expect((redisUtil.unsubscribe as jest.Mock).mock.calls).toMatchSnapshot();
});

test('publishOrderBookUpdate, with update', async () => {
	const orderBookSnapshotUpdate = {
		pair: 'pair',
		updates: [
			{
				price: 1,
				change: 2,
				count: 3,
				side: 'ask'
			}
		],
		prevVersion: 1234567890000,
		version: 1234567990000
	};
	redisUtil.publish = jest.fn(() => Promise.resolve(1));
	redisUtil.set = jest.fn(() => Promise.resolve(''));
	const res = await orderBookPersistenceUtil.publishOrderBookUpdate(
		'pair',
		orderBookSnapshot,
		orderBookSnapshotUpdate
	);
	expect((redisUtil.set as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock).mock.calls).toMatchSnapshot();
	expect(res).toBeTruthy();
});

test('publishOrderBookUpdate, withoutsnpashot update', async () => {
	redisUtil.publish = jest.fn(() => Promise.resolve(1));
	redisUtil.set = jest.fn(() => Promise.resolve(''));
	const res = await orderBookPersistenceUtil.publishOrderBookUpdate('pair', orderBookSnapshot);
	expect((redisUtil.set as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.publish as jest.Mock).not.toBeCalled();
	expect(res).toBeTruthy();
});

test('publishOrderBookUpdate, throw Error', async () => {
	redisUtil.publish = jest.fn(() => Promise.resolve(1));
	redisUtil.set = jest.fn(() => Promise.reject());
	const res = await orderBookPersistenceUtil.publishOrderBookUpdate('pair', orderBookSnapshot);
	expect((redisUtil.set as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.publish as jest.Mock).not.toBeCalled();
	expect(res).toBeFalsy();
});

test('getOrderBookSnapshot , with result', async () => {
	redisUtil.get = jest.fn(() => Promise.resolve(JSON.stringify(orderBookSnapshot)));
	const res = await orderBookPersistenceUtil.getOrderBookSnapshot('pair');
	expect((redisUtil.get as jest.Mock).mock.calls).toMatchSnapshot();
	expect(res).toMatchSnapshot();
});

test('getOrderBookSnapshot , without result', async () => {
	redisUtil.get = jest.fn(() => Promise.resolve(''));
	const res = await orderBookPersistenceUtil.getOrderBookSnapshot('pair');
	expect((redisUtil.get as jest.Mock).mock.calls).toMatchSnapshot();
	expect(res).toMatchSnapshot();
});
