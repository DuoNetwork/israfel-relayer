import { BigNumber, OrderState } from '0x.js';
import * as CST from '../common/constants';
import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
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
	orderWatcherServer.orderWatcher = {
		addOrderAsync: jest.fn(() => Promise.resolve())
	} as any;
	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve({}));

	await orderWatcherServer.addIntoWatch('orderHash', signedOrder);
	expect(dynamoUtil.getRawOrder as jest.Mock).not.toBeCalled();
	expect(
		((orderWatcherServer.orderWatcher as any).addOrderAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('addIntoWatch no signed order', async () => {
	orderWatcherServer.orderWatcher = {
		addOrderAsync: jest.fn(() => Promise.resolve())
	} as any;

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
	orderWatcherServer.orderWatcher = {
		removeOrder: jest.fn(() => Promise.resolve())
	} as any;
	orderWatcherServer.watchingOrders = [];

	orderWatcherServer.removeFromWatch('orderHash');
	expect((orderWatcherServer.orderWatcher as any).removeOrder as jest.Mock).not.toBeCalled();
});

test('remove from watch, exisitng order', async () => {
	orderWatcherServer.orderWatcher = {
		removeOrder: jest.fn(() => Promise.resolve())
	} as any;

	orderWatcherServer.watchingOrders = ['orderHash'];

	await orderWatcherServer.removeFromWatch('orderHash');
	expect(
		((orderWatcherServer.orderWatcher as any).removeOrder as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(orderWatcherServer.watchingOrders.length).toBe(0);
});

const orderPersistRequest = {
	method: 'method',
	pair: 'pair',
	orderHash: 'orderHash',
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

const orderStateValid: OrderState = {
	isValid: true,
	orderHash: 'orderHash',
	orderRelevantState: {
		makerBalance: new BigNumber(123),
		makerProxyAllowance: new BigNumber(234),
		makerFeeBalance: new BigNumber(345),
		makerFeeProxyAllowance: new BigNumber(345),
		filledTakerAssetAmount: new BigNumber(456),
		remainingFillableMakerAssetAmount: new BigNumber(567),
		remainingFillableTakerAssetAmount: new BigNumber(678)
	}
};

test('handleOrderWatcherUpdate no liveOrder', async () => {
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate('pair', orderStateValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate ', async () => {
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate('pair', orderStateValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
});
