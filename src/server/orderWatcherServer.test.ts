// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';

import { BigNumber, ExchangeContractErrs, OrderState } from '0x.js';
import * as CST from '../common/constants';
import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import orderUtil from '../utils/orderUtil';
import Web3Util from '../utils/Web3Util';
import orderWatcherServer from './orderWatcherServer';

test('remove from watch, not a existing order', async () => {
	const removeOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		removeOrder: removeOrder
	} as any;
	orderWatcherServer.watchingOrders = {};
	orderWatcherServer.removeFromWatch('orderHash');
	expect(removeOrder).not.toBeCalled();
	expect(orderWatcherServer.watchingOrders).toEqual({});
});

test('remove from watch, exisitng order', async () => {
	const removeOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		removeOrder: removeOrder
	} as any;

	orderWatcherServer.watchingOrders = { orderHash: {} } as any;
	await orderWatcherServer.removeFromWatch('orderHash');
	expect(removeOrder.mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.watchingOrders).toEqual({});
});

test('updateOrder isValid no userOrder', async () => {
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.updateOrder({
		method: 'method',
		status: 'status',
		requestor: CST.DB_ORDER_WATCHER,
		pair: 'pair',
		orderHash: 'orderHash',
		balance: -1
	});
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

test('updateOrder isValid userOrder', async () => {
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(userOrder));
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.updateOrder({
		method: 'method',
		pair: 'pair',
		status: 'status',
		requestor: CST.DB_ORDER_WATCHER,
		orderHash: '0xOrderHash',
		balance: -1
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

test('addIntoWatch with signed order fillable', async () => {
	const addOrderAsync = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		addOrderAsync: addOrderAsync
	} as any;
	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve({}));
	orderWatcherServer.watchingOrders = {};
	orderWatcherServer.web3Util = {
		validateOrderFillable: jest.fn(() => Promise.resolve(true))
	} as any;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	await orderWatcherServer.addIntoWatch('orderHash', signedOrder);
	expect(dynamoUtil.getRawOrder as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.updateOrder as jest.Mock).not.toBeCalled();
	expect(addOrderAsync.mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.watchingOrders).toMatchSnapshot();
});

test('addIntoWatch with signed order non fillable', async () => {
	const addOrderAsync = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		addOrderAsync: addOrderAsync
	} as any;
	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve({}));
	orderWatcherServer.watchingOrders = {};
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_BID);
	orderWatcherServer.web3Util = {
		validateOrderFillable: jest.fn(() => Promise.resolve(false))
	} as any;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	await orderWatcherServer.addIntoWatch('orderHash', signedOrder);
	expect(dynamoUtil.getRawOrder as jest.Mock).not.toBeCalled();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(addOrderAsync.mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.watchingOrders).toMatchSnapshot();
});

test('addIntoWatch no signed order fillable', async () => {
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
		})
	);
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	await orderWatcherServer.addIntoWatch('orderHash');
	expect(addOrderAsync.mock.calls).toMatchSnapshot();
	expect((dynamoUtil.getRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.updateOrder as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.watchingOrders).toMatchSnapshot();
});

test('addIntoWatch no signed order and no rawOrder', async () => {
	const addOrderAsync = jest.fn(() => Promise.resolve());
	orderWatcherServer.orderWatcher = {
		addOrderAsync: addOrderAsync
	} as any;
	orderWatcherServer.watchingOrders = {};
	orderWatcherServer.web3Util = {
		validateOrderFillable: jest.fn(() => Promise.resolve(true))
	} as any;

	dynamoUtil.getRawOrder = jest.fn(() => Promise.resolve());
	await orderWatcherServer.addIntoWatch('orderHash');
	expect(addOrderAsync).not.toBeCalled();
	expect((orderWatcherServer.web3Util as any).validateOrderFillable).not.toBeCalled();
	expect(orderWatcherServer.watchingOrders).toEqual({});
});

const orderQueueItem = {
	method: 'method',
	status: 'status',
	requestor: CST.DB_ORDER_WATCHER,
	liveOrder: {
		orderHash: '0xOrderHash'
	} as any,
	signedOrder: signedOrder
};

test('handle orderUpdate orderWatcher requestor', () => {
	orderWatcherServer.orderWatcher = null;
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	expect(orderWatcherServer.handleOrderUpdate('channel', orderQueueItem)).toBe(undefined);
	expect(orderWatcherServer.addIntoWatch as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handle orderUpdate invalid method', () => {
	orderQueueItem.requestor = 'requestor';
	orderWatcherServer.orderWatcher = null;
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.handleOrderUpdate('channel', orderQueueItem);
	expect(orderWatcherServer.addIntoWatch as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handle orderUpdate add', () => {
	orderQueueItem.requestor = 'requestor';
	orderWatcherServer.orderWatcher = null;
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderQueueItem.method = CST.DB_ADD;
	orderWatcherServer.handleOrderUpdate('channel', orderQueueItem);
	expect((orderWatcherServer.addIntoWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handle orderUpdate terminate', () => {
	orderQueueItem.requestor = 'requestor';
	orderWatcherServer.orderWatcher = null;
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderQueueItem.method = CST.DB_TERMINATE;
	orderWatcherServer.handleOrderUpdate('channel', orderQueueItem);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.addIntoWatch as jest.Mock).not.toBeCalled();
});

const orderStateValid: OrderState = {
	isValid: true,
	orderHash: 'orderHash',
	orderRelevantState: {
		filledTakerAssetAmount: new BigNumber(0),
		remainingFillableTakerAssetAmount: new BigNumber(567),
		remainingFillableMakerAssetAmount: new BigNumber(123)
	} as any
};

test('handleOrderWatcherUpdate no web3Util', async () => {
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.web3Util = null;
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateValid);
	expect(orderWatcherServer.updateOrder as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handleOrderWatcherUpdate not in cache', async () => {
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_BID);
	orderWatcherServer.web3Util = {} as any;
	orderWatcherServer.watchingOrders = {};
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateValid);
	expect(orderWatcherServer.updateOrder as jest.Mock).not.toBeCalled();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handleOrderWatcherUpdate isValid bid no fill', async () => {
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_BID);
	orderWatcherServer.web3Util = {} as any;
	orderUtil.getPriceBeforeFee = jest.fn(() => ({
		amount: 111
	}));
	orderWatcherServer.token = {
		feeSchedules: {}
	} as any;
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateValid);
	expect((orderUtil.getPriceBeforeFee as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handleOrderWatcherUpdate isValid ask no fill', async () => {
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_ASK);
	orderWatcherServer.web3Util = {} as any;
	orderUtil.getPriceBeforeFee = jest.fn(() => ({
		amount: 111
	}));
	orderWatcherServer.token = {
		feeSchedules: {}
	} as any;
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateValid);
	expect((orderUtil.getPriceBeforeFee as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handleOrderWatcherUpdate isValid bid fill', async () => {
	orderStateValid.orderRelevantState.filledTakerAssetAmount = new BigNumber(1);
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_BID);
	orderUtil.getPriceBeforeFee = jest.fn(() => ({
		amount: 111
	}));
	orderUtil.getFillBeforeFee = jest.fn(() => 2);
	orderWatcherServer.token = {
		feeSchedules: {}
	} as any;
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateValid);
	expect((orderUtil.getPriceBeforeFee as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderUtil.getFillBeforeFee as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

test('handleOrderWatcherUpdate isValid ask fill', async () => {
	orderStateValid.orderRelevantState.filledTakerAssetAmount = new BigNumber(1);
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_ASK);
	orderWatcherServer.web3Util = {} as any;
	orderUtil.getPriceBeforeFee = jest.fn(() => ({
		amount: 111
	}));
	orderUtil.getFillBeforeFee = jest.fn(() => 2);
	orderWatcherServer.token = {
		feeSchedules: {}
	} as any;
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateValid);
	expect((orderUtil.getPriceBeforeFee as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderUtil.getFillBeforeFee as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
});

const orderStateInValid: OrderState = {
	isValid: false,
	orderHash: 'orderHash',
	error: ExchangeContractErrs.OrderFillRoundingError
};

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.OrderFillRoundingError', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
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
		orderHash: 'orderHash' as any
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
		orderHash: 'orderHash' as any
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
		orderHash: 'orderHash' as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.OrderRemainingFillAmountZero;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.OrderRemainingFillAmountZero', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.OrderRemainingFillAmountZero;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.InsufficientTakerBalance', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.InsufficientTakerBalance;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.InsufficientTakerAllowance', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.InsufficientTakerAllowance;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.InsufficientMakerBalance', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
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
		orderHash: 'orderHash' as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.InsufficientMakerAllowance;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.InsufficientTakerFeeBalance', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.InsufficientTakerFeeBalance;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.InsufficientTakerFeeAllowance', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.InsufficientTakerFeeAllowance;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.InsufficientMakerFeeBalance', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.InsufficientMakerFeeBalance;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid ExchangeContractErrs.InsufficientMakerFeeAllowance', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = ExchangeContractErrs.InsufficientMakerFeeAllowance;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderWatcherUpdate invalid default', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash: 'orderHash' as any
	};
	orderWatcherServer.web3Util = {} as any;
	orderStateInValid.error = '' as any;
	orderWatcherServer.updateOrder = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.handleOrderWatcherUpdate(orderStateInValid);
	expect(orderWatcherServer.removeFromWatch as jest.Mock).not.toBeCalled();
	expect((orderWatcherServer.updateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('loadOrders', async () => {
	orderWatcherServer.watchingOrders = {
		orderHash3: {}
	} as any;
	orderPersistenceUtil.getAllLiveOrdersInPersistence = jest.fn(() =>
		Promise.resolve({
			orderHash1: {},
			orderHash2: {}
		})
	);
	orderWatcherServer.addIntoWatch = jest.fn(() => Promise.resolve());
	orderWatcherServer.removeFromWatch = jest.fn(() => Promise.resolve());
	await orderWatcherServer.loadOrders();
	expect((orderWatcherServer.addIntoWatch as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.removeFromWatch as jest.Mock).mock.calls).toMatchSnapshot();
});
