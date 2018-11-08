// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';

import { BigNumber, ExchangeContractErrs, OrderState } from '0x.js';
import * as CST from '../common/constants';
import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import Web3Util from '../utils/Web3Util';
import orderWatcherServer from './orderWatcherServer';

orderWatcherServer.web3Util = new Web3Util(null, false, '');

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
	const addOrderAsync = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		addOrderAsync: addOrderAsync
	} as any;
	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve({}));
	orderWatcherServer.watchingOrders = [];
	(orderWatcherServer.web3Util as any).validateOrderFillable = jest.fn(() =>
		Promise.resolve(true)
	);
	await orderWatcherServer.addIntoWatch('orderHash', signedOrder);
	expect(dynamoUtil.getRawOrder as jest.Mock).not.toBeCalled();
	expect(addOrderAsync.mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.watchingOrders).toMatchSnapshot();
});

test('addIntoWatch no signed order', async () => {
	const addOrderAsync = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		addOrderAsync: addOrderAsync
	} as any;
	orderWatcherServer.watchingOrders = [];
	(orderWatcherServer.web3Util as any).validateOrderFillable = jest.fn(() =>
		Promise.resolve(true)
	);
	dynamoUtil.getRawOrder = jest.fn(() =>
		Promise.resolve({
			orderHash: 'orderHash',
			signedOrder: signedOrder
		})
	);
	await orderWatcherServer.addIntoWatch('orderHash');
	expect(addOrderAsync.mock.calls).toMatchSnapshot();
	expect((dynamoUtil.getRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.watchingOrders).toMatchSnapshot();
});

test('addIntoWatch no signed order and no rawOrder', async () => {
	const addOrderAsync = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		addOrderAsync: addOrderAsync
	} as any;
	orderWatcherServer.watchingOrders = [];
	(orderWatcherServer.web3Util as any).validateOrderFillable = jest.fn(() =>
		Promise.resolve(true)
	);

	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve());
	await orderWatcherServer.addIntoWatch('orderHash');
	expect(addOrderAsync).not.toBeCalled();
	expect(orderWatcherServer.watchingOrders).toEqual([]);
});

test('remove from watch, not a existing order', async () => {
	const removeOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		removeOrder: removeOrder
	} as any;
	orderWatcherServer.watchingOrders = [];

	orderWatcherServer.removeFromWatch('orderHash');
	expect(removeOrder).not.toBeCalled();
	expect(orderWatcherServer.watchingOrders).toEqual([]);
});

test('remove from watch, exisitng order', async () => {
	const removeOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		removeOrder: removeOrder
	} as any;

	orderWatcherServer.watchingOrders = ['orderHash'];
	await orderWatcherServer.removeFromWatch('orderHash');
	expect(removeOrder.mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.watchingOrders).toEqual([]);
});

const orderPersistRequest = {
	method: 'method',
	pair: 'pair',
	orderHash: 'orderHash',
	amount: 456,
	signedOrder: signedOrder
};
test('handle orderUpdate invalid method', async () => {
	orderWatcherServer.orderWatcher = null;
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderUpdate('channel', orderPersistRequest);
	expect(orderWatcherServer.addIntoWatch as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handle orderUpdate add', async () => {
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
		remainingFillableMakerAssetAmount: new BigNumber(567)
	} as any
};

test('handleOrderWatcherUpdate isValid no userOrder', async () => {
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate('pair', orderStateValid);
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
});

const userOrder = {
	account: '0xAccount',
	pair: 'pair',
	type: 'type',
	status: 'status',
	orderHash: '0xOrderHash',
	price: 0.123456789,
	amount: 456,
	side: 'side',
	createdAt: 1234560000,
	initialSequence: 1,
	currentSequence: 2,
	updatedBy: 'updatedBy'
};

test('handleOrderWatcherUpdate isValid userOrder', async () => {
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(userOrder));
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate('pair', orderStateValid);
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

const orderStateInValid: OrderState = {
	isValid: false,
	orderHash: 'orderHash',
	error: ExchangeContractErrs.OrderCancelExpired
};

test('handleOrderWatcherUpdate inValid ExchangeContractErrs.OrderCancelExpired', async () => {
	orderStateInValid.error = ExchangeContractErrs.OrderCancelExpired;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(userOrder));
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate('pair', orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate inValid ExchangeContractErrs.OrderFillExpired', async () => {
	orderStateInValid.error = ExchangeContractErrs.OrderFillExpired;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(userOrder));
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate('pair', orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate inValid ExchangeContractErrs.OrderCancelled', async () => {
	orderStateInValid.error = ExchangeContractErrs.OrderCancelled;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(userOrder));
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate('pair', orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate inValid ExchangeContractErrs.OrderRemainingFillAmountZero', async () => {
	orderStateInValid.error = ExchangeContractErrs.OrderRemainingFillAmountZero;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(userOrder));
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate('pair', orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate inValid default', async () => {
	orderStateInValid.error = '' as any;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(userOrder));
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate('pair', orderStateInValid);
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.persistOrder as jest.Mock).not.toBeCalled();
});
