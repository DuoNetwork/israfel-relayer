// import * as CST from '../common/constants';
import dynamoUtil from '../utils/dynamoUtil';
// import redisUtil from '../utils/redisUtil';
import orderWatcherServer from './orderWatcherServer';

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

test('addIntoWatch with signed order', async () => {
	(orderWatcherServer.orderWatcher as any) = {
		addOrderAsync: jest.fn(() => Promise.resolve())
	};
	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve({}));

	await orderWatcherServer.addIntoWatch('orderHash', signedOrder);
	expect(dynamoUtil.getRawOrder as jest.Mock).not.toBeCalled();
	expect(
		((orderWatcherServer.orderWatcher as any).addOrderAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('addIntoWatch no signed order', async () => {
	(orderWatcherServer.orderWatcher as any) = {
		addOrderAsync: jest.fn(() => Promise.resolve())
	};

	dynamoUtil.getRawOrder = jest.fn(() =>
		Promise.resolve({
			orderHash: 'orderHash',
			signedOrder: signedOrder
		})
	);
	await orderWatcherServer.addIntoWatch('orderHash');
	expect(
		((orderWatcherServer.orderWatcher as any).addOrderAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

// test('coldStart return if no orderWatcher', async () => {
// 	orderWatcherServer.orderWatcher = null;

// 	redisUtil.hashGetAll = jest.fn(() => Promise.resolve());
// 	orderWatcherServer.addIntoWatching = jest.fn(() => Promise.resolve());
// 	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
// 	await orderWatcherServer.coldStart('pair');
// 	expect(redisUtil.hashGetAll as jest.Mock).not.toBeCalled();
// 	expect(orderWatcherServer.addIntoWatching as jest.Mock).not.toBeCalled();
// 	expect(dynamoUtil.getLiveOrders as jest.Mock).not.toBeCalled();
// });

// test('coldStart cancel not to be added', async () => {
// 	(orderWatcherServer.orderWatcher as any) = {};
// 	orderWatcherServer.addIntoWatching = jest.fn(() => Promise.resolve());

// 	redisUtil.hashGetAll = jest.fn(() =>
// 		Promise.resolve({
// 			'cancel|orderHash': 'xxx'
// 		})
// 	);
// 	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
// 	await orderWatcherServer.coldStart('pair');
// 	expect((redisUtil.hashGetAll as jest.Mock).mock.calls).toMatchSnapshot();
// 	expect(orderWatcherServer.addIntoWatching as jest.Mock).not.toBeCalled();
// });

// test('coldStart old order not to be added', async () => {
// 	(orderWatcherServer.orderWatcher as any) = {};
// 	orderWatcherServer.addIntoWatching = jest.fn(() => Promise.resolve());

// 	orderWatcherServer.watchingOrders = ['orderHash'];

// 	redisUtil.hashGetAll = jest.fn(() =>
// 		Promise.resolve({
// 			'add|orderHash': 'xxx'
// 		})
// 	);
// 	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
// 	await orderWatcherServer.coldStart('pair');
// 	expect((redisUtil.hashGetAll as jest.Mock).mock.calls).toMatchSnapshot();
// 	expect(orderWatcherServer.addIntoWatching as jest.Mock).not.toBeCalled();
// });

// test('coldStart add cached order to watcher', async () => {
// 	(orderWatcherServer.orderWatcher as any) = {};
// 	orderWatcherServer.addIntoWatching = jest.fn(() => Promise.resolve());
// 	orderWatcherServer.watchingOrders = ['orderHash'];

// 	redisUtil.hashGetAll = jest.fn(() =>
// 		Promise.resolve({
// 			'add|orderHash1': '{orderHash1: 123}'
// 		})
// 	);
// 	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([]));
// 	await orderWatcherServer.coldStart('pair');
// 	expect((redisUtil.hashGetAll as jest.Mock).mock.calls).toMatchSnapshot();
// 	expect((orderWatcherServer.addIntoWatching as jest.Mock).mock.calls).toMatchSnapshot();
// });

// test('coldStart existing live order not to be added', async () => {
// 	(orderWatcherServer.orderWatcher as any) = {};
// 	orderWatcherServer.addIntoWatching = jest.fn(() => Promise.resolve());
// 	orderWatcherServer.watchingOrders = ['orderHash'];
// 	redisUtil.hashGetAll = jest.fn(() => Promise.resolve({}));
// 	dynamoUtil.getLiveOrders = jest.fn(() => Promise.resolve([{ orderHash: 'orderHash' }]));
// 	await orderWatcherServer.coldStart('pair');
// 	expect((redisUtil.hashGetAll as jest.Mock).mock.calls).toMatchSnapshot();
// 	expect(orderWatcherServer.addIntoWatching as jest.Mock).not.toBeCalled();
// });

// test('coldStart new live order not to be added', async () => {
// 	(orderWatcherServer.orderWatcher as any) = {};
// 	orderWatcherServer.addIntoWatching = jest.fn(() => Promise.resolve());
// 	orderWatcherServer.watchingOrders = ['orderHash'];
// 	redisUtil.hashGetAll = jest.fn(() => Promise.resolve({}));
// 	dynamoUtil.getLiveOrders = jest.fn(() =>
// 		Promise.resolve([{ orderHash: 'orderHash1' }, { orderHash: 'orderHash2' }])
// 	);
// 	await orderWatcherServer.coldStart('pair');
// 	expect((redisUtil.hashGetAll as jest.Mock).mock.calls).toMatchSnapshot();
// 	expect((orderWatcherServer.addIntoWatching as jest.Mock).mock.calls).toMatchSnapshot();
// });
