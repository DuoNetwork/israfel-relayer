// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';

import { BigNumber, ExchangeContractErrs, OrderState } from '0x.js';
import { Constants, Util, Web3Util } from '@finbook/israfel-common';
import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import orderWatcherServer from './orderWatcherServer';

test('removeFromWatch, not a existing order', async () => {
	const removeOrder = jest.fn();
	orderWatcherServer.orderWatcher = {
		removeOrder: removeOrder
	} as any;
	orderWatcherServer.watchingOrders = {};
	orderWatcherServer.removeFromWatch('orderHash');
	expect(removeOrder).not.toBeCalled();
	expect(orderWatcherServer.watchingOrders).toEqual({});
});

test('removeFromWatch, exisitng order', async () => {
	const removeOrder = jest.fn();
	orderWatcherServer.orderWatcher = {
		removeOrder: removeOrder
	} as any;

	orderWatcherServer.watchingOrders = { orderHash: {} } as any;
	await orderWatcherServer.removeFromWatch('orderHash');
	expect(removeOrder.mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.watchingOrders).toEqual({});
});

test('removeFromWatch, exisitng order, error', async () => {
	const removeOrder = jest.fn(() => {
		throw new Error('remove error');
	});
	orderWatcherServer.orderWatcher = {
		removeOrder: removeOrder
	} as any;

	orderWatcherServer.watchingOrders = { orderHash: {} } as any;
	await orderWatcherServer.removeFromWatch('orderHash');
	expect(removeOrder.mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.watchingOrders).toEqual({ orderHash: {} });
});

test('updateOrder isValid no userOrder', async () => {
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.updateOrder({
		method: 'method',
		status: 'status',
		requestor: Constants.DB_ORDER_WATCHER,
		pair: 'pair',
		orderHash: 'orderHash',
		fill: 123
	});
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
});

test('updateOrder persist failed', async () => {
	Util.sleep = jest.fn(() => Promise.resolve()) as any;
	orderPersistenceUtil.persistOrder = jest
		.fn()
		.mockRejectedValueOnce('persist error')
		.mockResolvedValueOnce('' as any) as any;
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.updateOrder({
		method: 'method',
		status: 'status',
		requestor: Constants.DB_ORDER_WATCHER,
		pair: 'pair',
		orderHash: 'orderHash',
		fill: 123
	});
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((Util.sleep as jest.Mock).mock.calls).toMatchSnapshot();
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

test('updateOrder isValid userOrder', async () => {
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(userOrder as any));
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.updateOrder({
		method: 'method',
		pair: 'pair',
		status: 'status',
		requestor: Constants.DB_ORDER_WATCHER,
		orderHash: '0xOrderHash',
		fill: 123
	});
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

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

test('addIntoWatch expired', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	const addOrderAsync = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {} as any;
	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve({} as any));
	orderWatcherServer.watchingOrders = {};
	orderWatcherServer.web3Util = {} as any;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn();
	await orderWatcherServer.addIntoWatch(
		{ orderHash: 'orderHash', pair: 'pair', expiry: 1234567890 + 3 * 60000 } as any,
		signedOrder
	);
	expect(dynamoUtil.getRawOrder as jest.Mock).not.toBeCalled();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect(addOrderAsync).not.toBeCalled();
	expect(orderWatcherServer.watchingOrders).toEqual({});
});

test('addIntoWatch no order watcher', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	orderWatcherServer.orderWatcher = null;
	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve({} as any));
	orderWatcherServer.watchingOrders = {};
	orderWatcherServer.web3Util = {
		validateOrderFillable: jest.fn(() => Promise.resolve(true))
	} as any;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	await orderWatcherServer.addIntoWatch(
		{ orderHash: 'orderHash', pair: 'pair', expiry: 2345678901 } as any,
		signedOrder
	);
	expect(dynamoUtil.getRawOrder as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.updateOrder as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.watchingOrders).toEqual({});
});

test('addIntoWatch with signed order fillable', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	const addOrderAsync = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		addOrderAsync: addOrderAsync
	} as any;
	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve({} as any));
	orderWatcherServer.watchingOrders = {};
	orderWatcherServer.web3Util = {
		validateOrderFillable: jest.fn(() => Promise.resolve(true))
	} as any;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	await orderWatcherServer.addIntoWatch(
		{ orderHash: 'orderHash', pair: 'pair', expiry: 2345678901 } as any,
		signedOrder
	);
	expect(dynamoUtil.getRawOrder as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.updateOrder as jest.Mock).not.toBeCalled();
	expect(addOrderAsync.mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.watchingOrders).toMatchSnapshot();
});

test('addIntoWatch with signed order non fillable', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	const addOrderAsync = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		addOrderAsync: addOrderAsync
	} as any;
	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve({} as any));
	orderWatcherServer.watchingOrders = {};
	Web3Util.getSideFromSignedOrder = jest.fn(() => Constants.DB_BID);
	orderWatcherServer.web3Util = {
		validateOrderFillable: jest.fn(() => Promise.resolve(false))
	} as any;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	await orderWatcherServer.addIntoWatch(
		{ orderHash: 'orderHash', pair: 'pair', expiry: 2345678901 } as any,
		signedOrder
	);
	expect(dynamoUtil.getRawOrder as jest.Mock).not.toBeCalled();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(addOrderAsync).not.toBeCalled();
	expect(orderWatcherServer.watchingOrders).toEqual({});
});

test('addIntoWatch no signed order fillable', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	const addOrderAsync = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		addOrderAsync: addOrderAsync
	} as any;
	orderWatcherServer.watchingOrders = {};
	orderWatcherServer.web3Util = {
		validateOrderFillable: jest.fn(() => Promise.resolve(true))
	} as any;
	dynamoUtil.getRawOrder = jest.fn(() =>
		Promise.resolve({
			orderHash: 'orderHash',
			signedOrder: signedOrder
		} as any)
	);
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	await orderWatcherServer.addIntoWatch({
		orderHash: 'orderHash',
		pair: 'pair',
		expiry: 2345678901
	} as any);
	expect(addOrderAsync.mock.calls).toMatchSnapshot();
	expect((dynamoUtil.getRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.updateOrder as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.watchingOrders).toMatchSnapshot();
});

test('addIntoWatch no signed order and no rawOrder', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	const addOrderAsync = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		addOrderAsync: addOrderAsync
	} as any;
	orderWatcherServer.watchingOrders = {};
	orderWatcherServer.web3Util = {
		validateOrderFillable: jest.fn(() => Promise.resolve(true))
	} as any;

	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve(null));
	await orderWatcherServer.addIntoWatch({
		orderHash: 'orderHash',
		pair: 'pair',
		expiry: 2345678901
	} as any);
	expect(addOrderAsync).not.toBeCalled();
	expect((orderWatcherServer.web3Util as any).validateOrderFillable).not.toBeCalled();
	expect(orderWatcherServer.watchingOrders).toEqual({});
});

test('addIntoWatch error', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	const addOrderAsync = jest.fn(() => Promise.reject('addOrderError'));
	orderWatcherServer.orderWatcher = {
		addOrderAsync: addOrderAsync
	} as any;
	orderWatcherServer.watchingOrders = {};
	orderWatcherServer.web3Util = {
		validateOrderFillable: jest.fn(() => Promise.resolve(true))
	} as any;
	dynamoUtil.getRawOrder = jest.fn(() =>
		Promise.resolve({
			orderHash: 'orderHash',
			signedOrder: signedOrder
		} as any)
	);
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	await orderWatcherServer.addIntoWatch({
		orderHash: 'orderHash',
		pair: 'pair',
		expiry: 2345678901
	} as any);
	expect(addOrderAsync.mock.calls).toMatchSnapshot();
	expect((dynamoUtil.getRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.updateOrder as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.watchingOrders).toEqual({});
});

const orderQueueItem = {
	method: 'method',
	status: 'status',
	requestor: Constants.DB_ORDER_WATCHER,
	liveOrder: {
		orderHash: '0xOrderHash'
	} as any,
	signedOrder: signedOrder
};

test('handleOrderUpdate orderWatcher requestor', async () => {
	orderWatcherServer.orderWatcher = null;
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	expect(await orderWatcherServer.handleOrderUpdate('channel', orderQueueItem)).toBe(undefined);
	expect(orderWatcherServer.addIntoWatch as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate invalid method', async () => {
	orderQueueItem.requestor = 'requestor';
	orderWatcherServer.orderWatcher = null;
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderUpdate('channel', orderQueueItem);
	expect(orderWatcherServer.addIntoWatch as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate add', async () => {
	orderQueueItem.requestor = 'requestor';
	orderWatcherServer.orderWatcher = null;
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderQueueItem.method = Constants.DB_ADD;
	await orderWatcherServer.handleOrderUpdate('channel', orderQueueItem);
	expect((orderWatcherServer.addIntoWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate terminate', async () => {
	orderQueueItem.requestor = 'requestor';
	orderWatcherServer.orderWatcher = null;
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderQueueItem.method = Constants.DB_TERMINATE;
	await orderWatcherServer.handleOrderUpdate('channel', orderQueueItem);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.addIntoWatch as jest.Mock).not.toBeCalled();
});

const orderStateValid: OrderState = {
	isValid: true,
	orderHash: 'orderHash',
	orderRelevantState: {
		filledTakerAssetAmount: new BigNumber(0),
		remainingFillableTakerAssetAmount: new BigNumber(456),
		remainingFillableMakerAssetAmount: new BigNumber(123)
	} as any
};

test('handleOrderWatcherUpdate not in cache', async () => {
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.watchingOrders = {};
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateValid);
	expect(orderWatcherServer.updateOrder as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handleOrderWatcherUpdate isValid no fill', async () => {
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.watchingOrders = {
		orderHash: {
			pair: 'pair',
			signedOrder: {
				takerAssetAmount: new BigNumber(456)
			}
		} as any
	};
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateValid);
	expect(orderWatcherServer.updateOrder as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handleOrderWatcherUpdate isValid balance plus fill less than orignial amount', async () => {
	orderStateValid.orderRelevantState.filledTakerAssetAmount = new BigNumber(1000000000000000000);
	orderStateValid.orderRelevantState.remainingFillableTakerAssetAmount = new BigNumber(
		400000000000000000000
	);
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.watchingOrders = {
		orderHash: {
			pair: 'pair',
			signedOrder: {
				takerAssetAmount: new BigNumber(456000000000000000000)
			}
		} as any
	};
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateValid);
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate isValid partial fill', async () => {
	orderStateValid.orderRelevantState.filledTakerAssetAmount = new BigNumber(1);
	orderStateValid.orderRelevantState.remainingFillableTakerAssetAmount = new BigNumber(455);
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.watchingOrders = {
		orderHash: {
			pair: 'pair',
			signedOrder: {
				takerAssetAmount: new BigNumber(456)
			}
		} as any
	};
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateValid);
	expect(orderWatcherServer.updateOrder as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

const orderStateInValid: OrderState = {
	isValid: false,
	orderHash: 'orderHash',
	error: ExchangeContractErrs.OrderFillRoundingError
};

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.OrderFillRoundingError', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: { pair: 'pair' } as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.OrderFillRoundingError;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.OrderFillExpired', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: { pair: 'pair' } as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.OrderFillExpired;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.OrderCancelled', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: { pair: 'pair' } as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.OrderCancelled;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.OrderRemainingFillAmountZero', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: { pair: 'pair' } as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.OrderRemainingFillAmountZero;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.InsufficientMakerBalance', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: { pair: 'pair' } as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.InsufficientMakerBalance;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.InsufficientMakerAllowance', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: { pair: 'pair' } as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.InsufficientMakerAllowance;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid default', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: { pair: 'pair' } as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = '' as any;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.updateOrder as jest.Mock).not.toBeCalled();
});

test('loadOrders', async () => {
	orderWatcherServer.pairs = ['pair1', 'pair2'];
	orderWatcherServer.watchingOrders = {
		orderHash3: {}
	} as any;
	orderPersistenceUtil.getAllLiveOrdersInPersistence = jest.fn(() =>
		Promise.resolve({
			orderHash1: {},
			orderHash2: {}
		} as any)
	);
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.loadOrders();
	expect((orderWatcherServer.addIntoWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderPersistenceUtil.getAllLiveOrdersInPersistence as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('initializeData', async () => {
	orderWatcherServer.handleOrderWatcherUpdate = jest.fn(() => Promise.resolve());
	const orderWatcher = {
		subscribe: jest.fn()
	};
	orderPersistenceUtil.subscribeOrderUpdate = jest.fn();
	orderWatcherServer.handleOrderUpdate = jest.fn(() => Promise.resolve());
	orderWatcherServer.loadOrders = jest.fn(() => Promise.resolve());
	global.setInterval = jest.fn();
	await orderWatcherServer.initializeData(
		{
			token: 'token',
			tokens: []
		} as any,
		orderWatcher as any
	);
	expect(orderWatcher.subscribe.mock.calls).toMatchSnapshot();
	await orderWatcher.subscribe.mock.calls[0][0]('err');
	await orderWatcher.subscribe.mock.calls[0][0]('');
	expect(orderWatcherServer.handleOrderWatcherUpdate as jest.Mock).not.toBeCalled();
	await orderWatcher.subscribe.mock.calls[0][0]('', 'orderState');
	expect((orderWatcherServer.handleOrderWatcherUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	await (orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).mock.calls[0][1](
		'channel',
		'orderQueueItem'
	);
	expect((orderWatcherServer.handleOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	expect((global.setInterval as jest.Mock).mock.calls).toMatchSnapshot();
	(global.setInterval as jest.Mock).mock.calls[0][0]();
	expect(orderWatcherServer.loadOrders as jest.Mock).toBeCalledTimes(2);
});

test('initializeData tokens', async () => {
	orderWatcherServer.handleOrderWatcherUpdate = jest.fn(() => Promise.resolve());
	const orderWatcher = {
		subscribe: jest.fn()
	};
	orderPersistenceUtil.subscribeOrderUpdate = jest.fn();
	orderWatcherServer.handleOrderUpdate = jest.fn(() => Promise.resolve());
	orderWatcherServer.loadOrders = jest.fn(() => Promise.resolve());
	global.setInterval = jest.fn();
	await orderWatcherServer.initializeData(
		{
			tokens: ['token']
		} as any,
		orderWatcher as any
	);
	expect(orderWatcher.subscribe.mock.calls).toMatchSnapshot();
	await orderWatcher.subscribe.mock.calls[0][0]('err');
	await orderWatcher.subscribe.mock.calls[0][0]('');
	expect(orderWatcherServer.handleOrderWatcherUpdate as jest.Mock).not.toBeCalled();
	await orderWatcher.subscribe.mock.calls[0][0]('', 'orderState');
	expect((orderWatcherServer.handleOrderWatcherUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	await (orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).mock.calls[0][1](
		'channel',
		'orderQueueItem'
	);
	expect((orderWatcherServer.handleOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	expect((global.setInterval as jest.Mock).mock.calls).toMatchSnapshot();
	(global.setInterval as jest.Mock).mock.calls[0][0]();
	expect(orderWatcherServer.loadOrders as jest.Mock).toBeCalledTimes(2);
});
