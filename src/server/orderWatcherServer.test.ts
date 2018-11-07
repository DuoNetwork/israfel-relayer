import * as CST from '../common/constants';
import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
// import Web3Util from '../utils/Web3Util';
import orderWatcherServer from './orderWatcherServer';
// import redisUtil from '../utils/redisUtil';

// const web3Util = new Web3Util(null, false, '');

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

test('remove from watch, not a existing order', async () => {
	(orderWatcherServer.orderWatcher as any) = {
		removeOrder: jest.fn(() => Promise.resolve())
	};

	await orderWatcherServer.removeFromWatch('orderHash');
	expect((orderWatcherServer.orderWatcher as any).removeOrder as jest.Mock).not.toBeCalled();
});

test('remove from watch, exisitng order', async () => {
	(orderWatcherServer.orderWatcher as any) = {
		removeOrder: jest.fn(() => Promise.resolve())
	};

	orderWatcherServer.watchingOrders = ['orderHash'];

	await orderWatcherServer.removeFromWatch('orderHash');
	expect(
		((orderWatcherServer.orderWatcher as any).removeOrder as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(orderWatcherServer.watchingOrders.length).toBe(0);
});

test('reloadLiveOrders, no orderWatcher initiated', async () => {
	(orderWatcherServer.orderWatcher as any) = null;
	orderPersistenceUtil.getAllLiveOrdersInPersistence = jest.fn(() => Promise.resolve());

	await orderWatcherServer.reloadLiveOrders('pair');
	expect(orderPersistenceUtil.getAllLiveOrdersInPersistence as jest.Mock).not.toBeCalled();
});

const liveOrder1 = {
	account: 'account1',
	pair: 'pair1',
	orderHash: 'orderHash1',
	price: 123,
	amount: 456,
	side: 'sell1',
	initialSequence: 1,
	currentSequence: 2
};
const liveOrder2 = {
	account: 'account2',
	pair: 'pair2',
	orderHash: 'orderHash2',
	price: 123,
	amount: 456,
	side: 'buy',
	initialSequence: 3,
	currentSequence: 4
};
test('reloadLiveOrders', async () => {
	(orderWatcherServer.orderWatcher as any) = null;
	orderPersistenceUtil.getAllLiveOrdersInPersistence = jest.fn(() =>
		Promise.resolve({
			orderHash1: liveOrder1,
			orderHash2: liveOrder2
		})
	);

	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());

	await orderWatcherServer.reloadLiveOrders('pair');
	expect(orderWatcherServer.watchingOrders).toMatchSnapshot();
	expect((orderWatcherServer.addIntoWatch as jest.Mock).mock.calls).toMatchSnapshot();
});

const orderPersistRequest = {
	method: 'method',
	pair: 'pair1',
	orderHash: 'orderHash1',
	amount: 456,
	signedOrder: signedOrder
};
test('handle orderUpdate no method', async () => {
	orderWatcherServer.orderWatcher = null;
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderUpdate('channel', orderPersistRequest);
	expect(orderWatcherServer.addIntoWatch as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handle orderUpdate ADD', async () => {
	orderWatcherServer.orderWatcher = null;
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderPersistRequest.method = CST.DB_ADD;
	await orderWatcherServer.handleOrderUpdate('channel', orderPersistRequest);
	expect((orderWatcherServer.addIntoWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handle orderUpdate terminate', async () => {
	orderWatcherServer.orderWatcher = null;
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderPersistRequest.method = CST.DB_TERMINATE;
	await orderWatcherServer.handleOrderUpdate('channel', orderPersistRequest);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.addIntoWatch as jest.Mock).not.toBeCalled();
});

// const option = {
// 	live: false,
// 	token: 'token',
// 	maker: 1,
// 	spender: 2,
// 	amount: 3,
// 	debug: false,
// 	server: false
// };
// test('start order watcher', async () => {
// 	orderWatcherServer.web3Util = web3Util;
// 	orderWatcherServer.web3Util.web3Wrapper.getProvider = jest.fn(() => 'provider');
// 	redisUtil.onOrderUpdate = jest.fn(()=> Promise.resolve());
// });
