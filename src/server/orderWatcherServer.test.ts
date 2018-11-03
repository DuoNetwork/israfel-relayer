// import * as CST from '../common/constants';
import dynamoUtil from '../utils/dynamoUtil';
import redisUtil from '../utils/redisUtil';
import orderWatcherServer from './orderWatcherServer';

test('coldStart return if no orderWatcher', async () => {
	orderWatcherServer.orderWatcher = null;

	redisUtil.hashGetAll = jest.fn(() => Promise.resolve());
	orderWatcherServer.addIntoWatcher = jest.fn(() => Promise.resolve());
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
	await orderWatcherServer.coldStart('pair');
	expect(redisUtil.hashGetAll as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.addIntoWatcher as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.getLiveOrders as jest.Mock).not.toBeCalled();
});

test('coldStart cancel not to be added', async () => {
	(orderWatcherServer.orderWatcher as any) = {};
	orderWatcherServer.addIntoWatcher = jest.fn(() => Promise.resolve());

	redisUtil.hashGetAll = jest.fn(() =>
		Promise.resolve({
			'cancel|orderHash': 'xxx'
		})
	);
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
	await orderWatcherServer.coldStart('pair');
	expect((redisUtil.hashGetAll as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.addIntoWatcher as jest.Mock).not.toBeCalled();
});

test('coldStart old order not to be added', async () => {
	(orderWatcherServer.orderWatcher as any) = {};
	orderWatcherServer.addIntoWatcher = jest.fn(() => Promise.resolve());

	orderWatcherServer.watchingOrders = ['orderHash'];

	redisUtil.hashGetAll = jest.fn(() =>
		Promise.resolve({
			'add|orderHash': 'xxx'
		})
	);
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
	await orderWatcherServer.coldStart('pair');
	expect((redisUtil.hashGetAll as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.addIntoWatcher as jest.Mock).not.toBeCalled();
});

test('coldStart add cached order to watcher', async () => {
	(orderWatcherServer.orderWatcher as any) = {};
	orderWatcherServer.addIntoWatcher = jest.fn(() => Promise.resolve());
	orderWatcherServer.watchingOrders = ['orderHash'];

	redisUtil.hashGetAll = jest.fn(() =>
		Promise.resolve({
			'add|orderHash1': '{orderHash1: 123}'
		})
	);
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
	await orderWatcherServer.coldStart('pair');
	expect((redisUtil.hashGetAll as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.addIntoWatcher as jest.Mock).mock.calls).toMatchSnapshot();
});

test('coldStart existing live order not to be added', async () => {
	(orderWatcherServer.orderWatcher as any) = {};
	orderWatcherServer.addIntoWatcher = jest.fn(() => Promise.resolve());
	orderWatcherServer.watchingOrders = ['orderHash'];
	redisUtil.hashGetAll = jest.fn(() => Promise.resolve({}));
	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([{ orderHash: 'orderHash' }]));
	await orderWatcherServer.coldStart('pair');
	expect((redisUtil.hashGetAll as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.addIntoWatcher as jest.Mock).not.toBeCalled();
});

test('coldStart new live order not to be added', async () => {
	(orderWatcherServer.orderWatcher as any) = {};
	orderWatcherServer.addIntoWatcher = jest.fn(() => Promise.resolve());
	orderWatcherServer.watchingOrders = ['orderHash'];
	redisUtil.hashGetAll = jest.fn(() => Promise.resolve({}));
	dynamoUtil.getLiveOrders = jest.fn(() =>
		Promise.resolve([{ orderHash: 'orderHash1' }, { orderHash: 'orderHash2' }])
	);
	await orderWatcherServer.coldStart('pair');
	expect((redisUtil.hashGetAll as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.addIntoWatcher as jest.Mock).mock.calls).toMatchSnapshot();
});
