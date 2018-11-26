// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import * as CST from '../common/constants';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import util from '../utils/util';
import relayerServer from './relayerServer';

test('sendInfo', () => {
	const ws = {
		send: jest.fn()
	};
	relayerServer.web3Util = {
		tokens: ['token1']
	} as any;
	relayerServer.processStatus = ['status1'] as any;
	relayerServer.sendInfo(ws as any);
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});

test('sendResponse', () => {
	const ws = {
		send: jest.fn()
	};
	relayerServer.sendResponse(
		ws as any,
		{
			channel: 'channel',
			method: 'method',
			pair: 'pair'
		},
		'status'
	);
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});

test('sendErrorOrderResponse', () => {
	const ws = {
		send: jest.fn()
	};
	relayerServer.sendErrorOrderResponse(
		ws as any,
		{
			channel: 'channel',
			method: 'method',
			pair: 'pair',
			orderHash: '0xOrderHash'
		},
		'status'
	);
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});

test('sendUserOrderResponse', async () => {
	const ws = {
		send: jest.fn()
	};
	await relayerServer.sendUserOrderResponse(ws as any, { test: 'liveOrder' } as any, 'type');
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
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

test('handleAddOrderRequest invalid order', async () => {
	relayerServer.web3Util = null;
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'pair',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	relayerServer.web3Util = {
		validateOrder: jest.fn(() => '0xOrderHash'),
		validateOrderFillable: jest.fn(() => Promise.resolve(false))
	} as any;
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'pair',
		order: signedOrder,
		orderHash: '0xInvalidHash'
	});
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'pair',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	expect(orderPersistenceUtil.persistOrder as jest.Mock).not.toBeCalled();
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleAddOrderRequest invalid persist', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	relayerServer.web3Util = {
		validateOrder: jest.fn(() => '0xOrderHash'),
		validateOrderFillable: jest.fn(() => Promise.resolve(true)),
		getSideFromSignedOrder: jest.fn(() => 'side')
	} as any;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'pair',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleAddOrderRequest persist error', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	relayerServer.web3Util = {
		validateOrder: jest.fn(() => '0xOrderHash'),
		validateOrderFillable: jest.fn(() => Promise.resolve(true)),
		getSideFromSignedOrder: jest.fn(() => 'side')
	} as any;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.reject('handleAddOrderRequest'));
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'pair',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleAddOrderRequest', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	relayerServer.web3Util = {
		validateOrder: jest.fn(() => '0xOrderHash'),
		validateOrderFillable: jest.fn(() => Promise.resolve(true)),
		getSideFromSignedOrder: jest.fn(() => 'side')
	} as any;
	orderPersistenceUtil.persistOrder = jest.fn(() =>
		Promise.resolve({
			userOrder: 'userOrder'
		})
	);
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'pair',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerServer.sendUserOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.sendErrorOrderResponse as jest.Mock).not.toBeCalled();
});

test('handleTerminateOrderRequest invalid request and order', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleTerminateOrderRequest(
		{} as any,
		{
			channel: CST.DB_ORDERS,
			method: CST.DB_TERMINATE,
			pair: 'pair',
			orderHash: ''
		} as any
	);
	await relayerServer.handleTerminateOrderRequest(
		{} as any,
		{
			channel: CST.DB_ORDERS,
			method: CST.DB_TERMINATE,
			pair: 'pair',
			orderHash: '0xOrderHash'
		} as any
	);
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest persist error', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() =>
		Promise.reject('handleTerminateOrderRequest')
	);
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: 'pair',
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve({ userOrder: 'userOrder' }));
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: 'pair',
		orderHash: '0xOrderHash'
	});
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.sendErrorOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendUserOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistorySubscribeRequest new account new pair', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getUserOrders = jest.fn(() => Promise.resolve(['userOrders']));
	util.safeWsSend = jest.fn();
	await relayerServer.handleOrderHistorySubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair',
		account: 'account'
	});
	expect(relayerServer.clientPairs).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistorySubscribeRequest existing account existing pair', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getUserOrders = jest.fn(() => Promise.resolve(['userOrders']));
	util.safeWsSend = jest.fn();
	await relayerServer.handleOrderHistorySubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair',
		account: 'account'
	});
	expect(relayerServer.clientPairs).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistorySubscribeRequest existing account existing pair new ws', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getUserOrders = jest.fn(() => Promise.resolve(['userOrders']));
	util.safeWsSend = jest.fn();
	await relayerServer.handleOrderHistorySubscribeRequest('ws1' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair',
		account: 'account'
	});
	expect(relayerServer.clientPairs).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistorySubscribeRequest existing account new pair', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getUserOrders = jest.fn(() => Promise.resolve(['userOrders']));
	util.safeWsSend = jest.fn();
	await relayerServer.handleOrderHistorySubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair1',
		account: 'account'
	});
	expect(relayerServer.clientPairs).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistoryUnsubscribeRequest existing account existing pair', async () => {
	relayerServer.sendResponse = jest.fn();
	await relayerServer.handleOrderHistoryUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair1',
		account: 'account'
	});
	expect(relayerServer.clientPairs).toMatchSnapshot();
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistoryUnsubscribeRequest existing account existing pair more than one', async () => {
	relayerServer.sendResponse = jest.fn();
	await relayerServer.handleOrderHistoryUnsubscribeRequest('ws1' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair',
		account: 'account'
	});
	expect(relayerServer.clientPairs).toMatchSnapshot();
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistoryUnsubscribeRequest existing account clear up', async () => {
	relayerServer.sendResponse = jest.fn();
	await relayerServer.handleOrderHistoryUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair',
		account: 'account'
	});
	expect(relayerServer.clientPairs).toMatchSnapshot();
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistoryUnsubscribeRequest new account', async () => {
	relayerServer.sendResponse = jest.fn();
	await relayerServer.handleOrderHistoryUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair',
		account: 'account'
	});
	expect(relayerServer.clientPairs).toMatchSnapshot();
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderRequest invalid requests', async () => {
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleAddOrderRequest = jest.fn();
	relayerServer.handleTerminateOrderRequest = jest.fn();
	relayerServer.handleOrderHistorySubscribeRequest = jest.fn();
	relayerServer.handleOrderHistoryUnsubscribeRequest = jest.fn();
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'pair',
		orderHash: ''
	} as any);
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: 'pair',
		orderHash: ''
	} as any);
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: CST.DB_ORDERS,
		method: CST.WS_SUB,
		pair: 'pair',
		account: ''
	} as any);
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: CST.DB_ORDERS,
		method: CST.WS_UNSUB,
		pair: 'pair',
		account: ''
	} as any);
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: CST.DB_ORDERS,
		method: 'method',
		pair: 'pair'
	} as any);
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleAddOrderRequest as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleTerminateOrderRequest as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleOrderHistorySubscribeRequest as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleOrderHistoryUnsubscribeRequest as jest.Mock).not.toBeCalled();
});

test('handleOrderRequest add', async () => {
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleAddOrderRequest = jest.fn();
	relayerServer.handleTerminateOrderRequest = jest.fn();
	relayerServer.handleOrderHistorySubscribeRequest = jest.fn();
	relayerServer.handleOrderHistoryUnsubscribeRequest = jest.fn();
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'pair',
		orderHash: '0xOrderHash'
	} as any);
	expect(relayerServer.sendResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleAddOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleTerminateOrderRequest as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleOrderHistorySubscribeRequest as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleOrderHistoryUnsubscribeRequest as jest.Mock).not.toBeCalled();
});

test('handleOrderRequest terminate', async () => {
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleAddOrderRequest = jest.fn();
	relayerServer.handleTerminateOrderRequest = jest.fn();
	relayerServer.handleOrderHistorySubscribeRequest = jest.fn();
	relayerServer.handleOrderHistoryUnsubscribeRequest = jest.fn();
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: 'pair',
		orderHash: '0xOrderHash'
	} as any);
	expect(relayerServer.sendResponse as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleAddOrderRequest as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleTerminateOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleOrderHistorySubscribeRequest as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleOrderHistoryUnsubscribeRequest as jest.Mock).not.toBeCalled();
});

test('handleOrderRequest subscribe', async () => {
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleAddOrderRequest = jest.fn();
	relayerServer.handleTerminateOrderRequest = jest.fn();
	relayerServer.handleOrderHistorySubscribeRequest = jest.fn();
	relayerServer.handleOrderHistoryUnsubscribeRequest = jest.fn();
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: CST.DB_ORDERS,
		method: CST.WS_SUB,
		pair: 'pair',
		account: 'account'
	} as any);
	expect(relayerServer.sendResponse as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleAddOrderRequest as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleTerminateOrderRequest as jest.Mock).not.toBeCalled();
	expect(
		(relayerServer.handleOrderHistorySubscribeRequest as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(relayerServer.handleOrderHistoryUnsubscribeRequest as jest.Mock).not.toBeCalled();
});

test('handleOrderRequest unsubscribe', async () => {
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleAddOrderRequest = jest.fn();
	relayerServer.handleTerminateOrderRequest = jest.fn();
	relayerServer.handleOrderHistorySubscribeRequest = jest.fn();
	relayerServer.handleOrderHistoryUnsubscribeRequest = jest.fn();
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: CST.DB_ORDERS,
		method: CST.WS_UNSUB,
		pair: 'pair',
		account: 'account'
	} as any);
	expect(relayerServer.sendResponse as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleAddOrderRequest as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleTerminateOrderRequest as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleOrderHistorySubscribeRequest as jest.Mock).not.toBeCalled();
	expect(
		(relayerServer.handleOrderHistoryUnsubscribeRequest as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('handleOrderBookUpdate empty ws list', () => {
	relayerServer.orderBookPairs = {};
	util.safeWsSend = jest.fn();
	relayerServer.handleOrderBookUpdate('type|action|code1|code2', 'any' as any);
	relayerServer.orderBookPairs = {
		'code1|code2': []
	};
	relayerServer.handleOrderBookUpdate('type|action|code1|code2', 'any' as any);
	expect(util.safeWsSend as jest.Mock).not.toBeCalled();
});

test('handleOrderBookUpdate', () => {
	util.safeWsSend = jest.fn();
	relayerServer.orderBookPairs = {
		'code1|code2': ['ws1', 'ws2'] as any
	};
	relayerServer.handleOrderBookUpdate('type|action|code1|code2', 'any' as any);
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookSubscribeRequest new pair', async () => {
	relayerServer.orderBookPairs = {};
	orderBookPersistenceUtil.subscribeOrderBookUpdate = jest.fn();
	orderBookPersistenceUtil.getOrderBookSnapshot = jest.fn(() => Promise.resolve('snapshot'));
	util.safeWsSend = jest.fn();
	await relayerServer.handleOrderBookSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.orderBookPairs).toEqual({
		pair: ['ws']
	});
	expect(
		(orderBookPersistenceUtil.subscribeOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.getOrderBookSnapshot as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookSubscribeRequest new pair no snapshot', async () => {
	relayerServer.orderBookPairs = {};
	orderBookPersistenceUtil.subscribeOrderBookUpdate = jest.fn();
	orderBookPersistenceUtil.getOrderBookSnapshot = jest.fn(() => Promise.resolve());
	relayerServer.sendResponse = jest.fn();
	util.safeWsSend = jest.fn();
	await relayerServer.handleOrderBookSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.orderBookPairs).toEqual({
		pair: ['ws']
	});
	expect(
		(orderBookPersistenceUtil.subscribeOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.getOrderBookSnapshot as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(util.safeWsSend as jest.Mock).not.toBeCalled();
});

test('handleOrderBookSubscribeRequest empty list', async () => {
	relayerServer.orderBookPairs = {
		pair: []
	};
	orderBookPersistenceUtil.subscribeOrderBookUpdate = jest.fn();
	orderBookPersistenceUtil.getOrderBookSnapshot = jest.fn(() => Promise.resolve('snapshot'));
	util.safeWsSend = jest.fn();
	await relayerServer.handleOrderBookSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.orderBookPairs).toEqual({
		pair: ['ws']
	});
	expect(
		(orderBookPersistenceUtil.subscribeOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.getOrderBookSnapshot as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookSubscribeRequest existing pair new ws', async () => {
	relayerServer.orderBookPairs = {
		pair: ['ws1'] as any
	};
	orderBookPersistenceUtil.subscribeOrderBookUpdate = jest.fn();
	orderBookPersistenceUtil.getOrderBookSnapshot = jest.fn(() => Promise.resolve('snapshot'));
	util.safeWsSend = jest.fn();
	await relayerServer.handleOrderBookSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.orderBookPairs).toEqual({
		pair: ['ws1', 'ws']
	});
	expect(orderBookPersistenceUtil.subscribeOrderBookUpdate as jest.Mock).not.toBeCalled();
	expect(
		(orderBookPersistenceUtil.getOrderBookSnapshot as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookSubscribeRequest existing pair existing ws', async () => {
	relayerServer.orderBookPairs = {
		pair: ['ws'] as any
	};
	orderBookPersistenceUtil.subscribeOrderBookUpdate = jest.fn();
	orderBookPersistenceUtil.getOrderBookSnapshot = jest.fn(() => Promise.resolve('snapshot'));
	util.safeWsSend = jest.fn();
	await relayerServer.handleOrderBookSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.orderBookPairs).toEqual({
		pair: ['ws']
	});
	expect(orderBookPersistenceUtil.subscribeOrderBookUpdate as jest.Mock).not.toBeCalled();
	expect(
		(orderBookPersistenceUtil.getOrderBookSnapshot as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookUnsubscribeRequest non existing pair', () => {
	relayerServer.orderBookPairs = {};
	relayerServer.sendResponse = jest.fn();
	orderBookPersistenceUtil.unsubscribeOrderBookUpdate = jest.fn();
	relayerServer.handleOrderBookUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.orderBookPairs).toEqual({});
	expect(orderBookPersistenceUtil.unsubscribeOrderBookUpdate as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookUnsubscribeRequest existing pair non existing ws', () => {
	relayerServer.orderBookPairs = {
		pair: []
	};
	relayerServer.sendResponse = jest.fn();
	orderBookPersistenceUtil.unsubscribeOrderBookUpdate = jest.fn();
	relayerServer.handleOrderBookUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.orderBookPairs).toEqual({
		pair: []
	});
	expect(orderBookPersistenceUtil.unsubscribeOrderBookUpdate as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookUnsubscribeRequest no more subscription', () => {
	relayerServer.orderBookPairs = {
		pair: ['ws'] as any
	};
	relayerServer.sendResponse = jest.fn();
	orderBookPersistenceUtil.unsubscribeOrderBookUpdate = jest.fn();
	relayerServer.handleOrderBookUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.orderBookPairs).toEqual({});
	expect(
		(orderBookPersistenceUtil.unsubscribeOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookUnsubscribeRequest', () => {
	relayerServer.orderBookPairs = {
		pair: ['ws', 'ws1'] as any
	};
	relayerServer.sendResponse = jest.fn();
	orderBookPersistenceUtil.unsubscribeOrderBookUpdate = jest.fn();
	relayerServer.handleOrderBookUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.orderBookPairs).toEqual({
		pair: ['ws1']
	});
	expect(orderBookPersistenceUtil.unsubscribeOrderBookUpdate as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookRequest invalid method', async () => {
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleOrderBookSubscribeRequest = jest.fn();
	relayerServer.handleOrderBookUnsubscribeRequest = jest.fn();
	await relayerServer.handleOrderBookRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleOrderBookSubscribeRequest as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleOrderBookUnsubscribeRequest as jest.Mock).not.toBeCalled();
});

test('handleOrderBookRequest subscribe', async () => {
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleOrderBookSubscribeRequest = jest.fn();
	relayerServer.handleOrderBookUnsubscribeRequest = jest.fn();
	await relayerServer.handleOrderBookRequest('ws' as any, {
		channel: 'channel',
		method: CST.WS_SUB,
		pair: 'pair'
	});
	expect(relayerServer.sendResponse as jest.Mock).not.toBeCalled();
	expect(
		(relayerServer.handleOrderBookSubscribeRequest as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(relayerServer.handleOrderBookUnsubscribeRequest as jest.Mock).not.toBeCalled();
});

test('handleOrderBookRequest unsubscribe', async () => {
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleOrderBookSubscribeRequest = jest.fn();
	relayerServer.handleOrderBookUnsubscribeRequest = jest.fn();
	await relayerServer.handleOrderBookRequest('ws' as any, {
		channel: 'channel',
		method: CST.WS_UNSUB,
		pair: 'pair'
	});
	expect(relayerServer.sendResponse as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleOrderBookSubscribeRequest as jest.Mock).not.toBeCalled();
	expect(
		(relayerServer.handleOrderBookUnsubscribeRequest as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('handleWebSocketMessage invalid requests', () => {
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleWebSocketMessage('ws' as any, JSON.stringify({}));
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => true)
	} as any;
	relayerServer.handleWebSocketMessage(
		'ws' as any,
		JSON.stringify({
			channel: 'channel',
			method: 'method',
			pair: 'pair'
		})
	);
	relayerServer.handleWebSocketMessage(
		'ws' as any,
		JSON.stringify({
			channel: CST.DB_ORDERS,
			method: '',
			pair: 'pair'
		})
	);
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => false)
	} as any;
	relayerServer.handleWebSocketMessage(
		'ws' as any,
		JSON.stringify({
			channel: CST.DB_ORDERS,
			method: 'method',
			pair: 'test'
		})
	);
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleWebSocketMessage orders', () => {
	const ws = {};
	relayerServer.handleOrderRequest = jest.fn();
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => true)
	} as any;
	relayerServer.handleWebSocketMessage(
		ws as any,
		JSON.stringify({
			channel: CST.DB_ORDERS,
			method: 'method',
			pair: 'pair'
		})
	);
	expect((relayerServer.handleOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleWebSocketMessage orderBooks', () => {
	const ws = {};
	relayerServer.handleOrderBookRequest = jest.fn();
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => true)
	} as any;
	relayerServer.handleWebSocketMessage(
		ws as any,
		JSON.stringify({
			channel: CST.DB_ORDER_BOOKS,
			method: 'method',
			pair: 'pair'
		})
	);
	expect((relayerServer.handleOrderBookRequest as jest.Mock).mock.calls).toMatchSnapshot();
});
