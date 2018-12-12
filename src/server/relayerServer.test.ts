// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import duoDynamoUtil from '../../../duo-admin/src/utils/dynamoUtil';
import * as CST from '../common/constants';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import orderUtil from '../utils/orderUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';
import relayerServer from './relayerServer';

test('sendInfo', () => {
	const ws = {
		send: jest.fn()
	};
	relayerServer.web3Util = {
		tokens: ['token1']
	} as any;
	relayerServer.duoAcceptedPrices = {
		custodian: ['acceptedPrices'] as any
	};
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
	// no web3Util
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'pair',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});

	relayerServer.web3Util = {
		getTokenByCode: jest.fn(() => null)
	} as any;
	// no token
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'code1|code2',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});

	relayerServer.web3Util = {
		getTokenByCode: jest.fn((code: string) => code)
	} as any;
	orderUtil.validateOrder = jest.fn(() => Promise.resolve(''));
	// failed validation test
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'code1|code2',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});

	orderUtil.validateOrder = jest.fn(() => Promise.resolve('0xOrderHash'));
	// invalid order hash
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'code1|code2',
		order: signedOrder,
		orderHash: '0xInvalidOrderHash'
	});
	expect(orderPersistenceUtil.persistOrder as jest.Mock).not.toBeCalled();
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleAddOrderRequest invalid persist', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	Web3Util.getSideFromSignedOrder = jest.fn(() => 'side');
	relayerServer.web3Util = {
		getTokenByCode: jest.fn((code: string) => code)
	} as any;
	orderUtil.validateOrder = jest.fn(() => Promise.resolve('0xOrderHash'));
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'code1|code2',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleAddOrderRequest persist error', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	Web3Util.getSideFromSignedOrder = jest.fn(() => 'side');
	relayerServer.web3Util = {
		getTokenByCode: jest.fn((code: string) => code)
	} as any;
	orderUtil.validateOrder = jest.fn(() => Promise.resolve('0xOrderHash'));
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.reject('handleAddOrderRequest'));
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'code1|code2',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleAddOrderRequest', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	Web3Util.getSideFromSignedOrder = jest.fn(() => 'side');
	relayerServer.web3Util = {
		getTokenByCode: jest.fn((code: string) => code)
	} as any;
	orderUtil.validateOrder = jest.fn(() => Promise.resolve('0xOrderHash'));
	orderPersistenceUtil.persistOrder = jest.fn(() =>
		Promise.resolve({
			userOrder: 'userOrder'
		})
	);
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'code1|code2',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerServer.sendUserOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.sendErrorOrderResponse as jest.Mock).not.toBeCalled();
});

test('handleTerminateOrderRequest invalid request and liveOrder does not exist', async () => {
	relayerServer.web3Util = null;
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: 'pair',
		orderHash: '0xOrderHash',
		signature: 'signature'
	});
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve('userOrder'));
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
	relayerServer.web3Util = {
		web3AccountsRecover: jest.fn(() => '')
	} as any;

	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: 'pair',
		orderHash: '0xOrderHash',
		signature: 'signature'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.persistOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest signature is wrong', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve('userOrder'));
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() =>
		Promise.resolve({
			account: 'account'
		})
	);
	relayerServer.web3Util = {
		web3AccountsRecover: jest.fn(() => 'xxx')
	} as any;
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: 'pair',
		orderHash: '0xOrderHash',
		signature: 'siganature'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.persistOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest persist no return', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() =>
		Promise.resolve({
			account: 'account'
		})
	);
	relayerServer.web3Util = {
		web3AccountsRecover: jest.fn(() => 'account')
	} as any;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: 'pair',
		orderHash: '0xOrderHash',
		signature: 'signature'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest persist error', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() =>
		Promise.resolve({
			account: 'account'
		})
	);
	relayerServer.web3Util = {
		web3AccountsRecover: jest.fn(() => 'account')
	} as any;
	orderPersistenceUtil.persistOrder = jest.fn(() =>
		Promise.reject('handleTerminateOrderRequest')
	);
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: 'pair',
		orderHash: '0xOrderHash',
		signature: 'signature'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() =>
		Promise.resolve({
			account: 'account'
		})
	);
	relayerServer.web3Util = {
		web3AccountsRecover: jest.fn(() => 'account')
	} as any;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve('userOrder'));
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: 'pair',
		orderHash: '0xOrderHash',
		signature: 'signature'
	});
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.sendErrorOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendUserOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistorySubscribeRequest new account ', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getUserOrders = jest.fn(() => Promise.resolve(['userOrders']));
	util.safeWsSend = jest.fn();
	orderPersistenceUtil.subscribeOrderUpdate = jest.fn();
	relayerServer.web3Util = {
		tokens: [
			{
				code: 'code1',
				feeSchedules: {
					base1: {},
					base2: {}
				}
			},
			{
				code: 'code2',
				feeSchedules: {
					base1: {},
					base2: {}
				}
			}
		]
	} as any;
	await relayerServer.handleOrderHistorySubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: '',
		account: 'account'
	});
	expect(relayerServer.accountClients).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistorySubscribeRequest existing account same ws', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getUserOrders = jest.fn(() => Promise.resolve(['userOrders']));
	util.safeWsSend = jest.fn();
	orderPersistenceUtil.subscribeOrderUpdate = jest.fn();
	await relayerServer.handleOrderHistorySubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: '',
		account: 'account'
	});
	expect(relayerServer.accountClients).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderHistorySubscribeRequest existing account new ws', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getUserOrders = jest.fn(() => Promise.resolve(['userOrders']));
	util.safeWsSend = jest.fn();
	orderPersistenceUtil.subscribeOrderUpdate = jest.fn();
	await relayerServer.handleOrderHistorySubscribeRequest('ws1' as any, {
		channel: 'channel',
		method: 'method',
		pair: '',
		account: 'account'
	});
	expect(relayerServer.accountClients).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate requested by self', () => {
	relayerServer.sendUserOrderResponse = jest.fn();
	relayerServer.handleOrderUpdate('channel', {
		requestor: CST.DB_RELAYER
	} as any);
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate requested pair not exist', () => {
	relayerServer.sendUserOrderResponse = jest.fn();
	relayerServer.handleOrderUpdate('channel', {
		requestor: 'requestor',
		liveOrder: {
			pair: 'pair2'
		}
	} as any);
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate requested existing pair account not exist', () => {
	relayerServer.sendUserOrderResponse = jest.fn();
	relayerServer.handleOrderUpdate('channel', {
		requestor: 'requestor',
		liveOrder: {
			pair: 'pair',
			account: 'account1'
		}
	} as any);
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate requested existing pair existing account', () => {
	relayerServer.sendUserOrderResponse = jest.fn();
	orderUtil.constructUserOrder = jest.fn(() => 'userOrder');
	relayerServer.handleOrderUpdate('channel', {
		requestor: 'requestor',
		method: 'method',
		status: 'status',
		liveOrder: {
			pair: 'pair',
			account: 'account'
		}
	} as any);
	expect((relayerServer.sendUserOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistoryUnsubscribeRequest existing account more than one', async () => {
	relayerServer.sendResponse = jest.fn();
	orderPersistenceUtil.unsubscribeOrderUpdate = jest.fn();
	await relayerServer.handleOrderHistoryUnsubscribeRequest('ws1' as any, {
		channel: 'channel',
		method: 'method',
		pair: '',
		account: 'account'
	});
	expect(relayerServer.accountClients).toMatchSnapshot();
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderPersistenceUtil.unsubscribeOrderUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderHistoryUnsubscribeRequest existing account clean up', async () => {
	relayerServer.sendResponse = jest.fn();
	orderPersistenceUtil.unsubscribeOrderUpdate = jest.fn();
	relayerServer.web3Util = {
		tokens: [
			{
				code: 'code1',
				feeSchedules: {
					base1: {},
					base2: {}
				}
			},
			{
				code: 'code2',
				feeSchedules: {
					base1: {},
					base2: {}
				}
			}
		]
	} as any;
	await relayerServer.handleOrderHistoryUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: '',
		account: 'account'
	});
	expect(relayerServer.accountClients).toEqual({});
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.unsubscribeOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistoryUnsubscribeRequest new account', async () => {
	relayerServer.sendResponse = jest.fn();
	orderPersistenceUtil.unsubscribeOrderUpdate = jest.fn();
	await relayerServer.handleOrderHistoryUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: '',
		account: 'account'
	});
	expect(relayerServer.accountClients).toEqual({});
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderPersistenceUtil.unsubscribeOrderUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderRequest invalid requests', async () => {
	relayerServer.web3Util = null;
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleAddOrderRequest = jest.fn();
	relayerServer.handleTerminateOrderRequest = jest.fn();
	relayerServer.handleOrderHistorySubscribeRequest = jest.fn();
	relayerServer.handleOrderHistoryUnsubscribeRequest = jest.fn();
	await relayerServer.handleOrderRequest(
		'ws' as any,
		{
			channel: CST.DB_ORDERS,
			method: CST.DB_ADD,
			pair: 'pair',
			orderHash: ''
		} as any
	);
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => false)
	} as any;
	await relayerServer.handleOrderRequest(
		'ws' as any,
		{
			channel: CST.DB_ORDERS,
			method: CST.DB_ADD,
			pair: 'pair',
			orderHash: ''
		} as any
	);
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => true)
	} as any;
	await relayerServer.handleOrderRequest(
		'ws' as any,
		{
			channel: CST.DB_ORDERS,
			method: CST.DB_TERMINATE,
			pair: 'pair',
			orderHash: ''
		} as any
	);
	await relayerServer.handleOrderRequest(
		'ws' as any,
		{
			channel: CST.DB_ORDERS,
			method: CST.WS_SUB,
			pair: 'pair',
			account: ''
		} as any
	);
	await relayerServer.handleOrderRequest(
		'ws' as any,
		{
			channel: CST.DB_ORDERS,
			method: 'method',
			pair: 'pair'
		} as any
	);
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
	await relayerServer.handleOrderRequest(
		'ws' as any,
		{
			channel: CST.DB_ORDERS,
			method: CST.DB_ADD,
			pair: 'pair',
			orderHash: '0xOrderHash'
		} as any
	);
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
	await relayerServer.handleOrderRequest(
		'ws' as any,
		{
			channel: CST.DB_ORDERS,
			method: CST.DB_TERMINATE,
			pair: 'pair',
			orderHash: '0xOrderHash'
		} as any
	);
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
	await relayerServer.handleOrderRequest(
		'ws' as any,
		{
			channel: CST.DB_ORDERS,
			method: CST.WS_SUB,
			pair: 'pair',
			account: 'account'
		} as any
	);
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
	await relayerServer.handleOrderRequest(
		'ws' as any,
		{
			channel: CST.DB_ORDERS,
			method: CST.WS_UNSUB,
			pair: 'pair',
			account: 'account'
		} as any
	);
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
	relayerServer.handleOrderBookUpdate('channel', {
		pair: 'code1|code2'
	} as any);
	relayerServer.orderBookPairs = {
		'code1|code2': []
	};
	relayerServer.handleOrderBookUpdate('channel', {
		pair: 'code1|code2'
	} as any);
	expect(util.safeWsSend as jest.Mock).not.toBeCalled();
});

test('handleOrderBookUpdate', () => {
	util.safeWsSend = jest.fn();
	relayerServer.orderBookPairs = {
		'code1|code2': ['ws1', 'ws2'] as any
	};
	relayerServer.handleOrderBookUpdate('channel', {
		pair: 'code1|code2'
	} as any);
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
	relayerServer.web3Util = null;
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleOrderBookSubscribeRequest = jest.fn();
	relayerServer.handleOrderBookUnsubscribeRequest = jest.fn();
	await relayerServer.handleOrderBookRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => false)
	} as any;
	await relayerServer.handleOrderBookRequest('ws' as any, {
		channel: 'channel',
		method: CST.WS_SUB,
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
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => true)
	} as any;
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
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => true)
	} as any;
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
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleWebSocketMessage orders', () => {
	const ws = {};
	relayerServer.handleOrderRequest = jest.fn();
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

test('loadDuoAcceptedPrices no web3Util', async () => {
	duoDynamoUtil.queryAcceptPriceEvent = jest.fn(() => Promise.resolve());
	relayerServer.duoAcceptedPrices = {};
	relayerServer.web3Util = null;
	await relayerServer.loadDuoAcceptedPrices();
	expect(relayerServer.duoAcceptedPrices).toEqual({});
	expect(duoDynamoUtil.queryAcceptPriceEvent as jest.Mock).not.toBeCalled();
});

test('loadDuoAcceptedPrices no tokens', async () => {
	duoDynamoUtil.queryAcceptPriceEvent = jest.fn(() => Promise.resolve());
	relayerServer.duoAcceptedPrices = {};
	relayerServer.web3Util = {
		tokens: []
	} as any;
	await relayerServer.loadDuoAcceptedPrices();
	expect(relayerServer.duoAcceptedPrices).toEqual({});
	expect(duoDynamoUtil.queryAcceptPriceEvent as jest.Mock).not.toBeCalled();
});

test('loadDuoAcceptedPrices', async () => {
	util.getDates = () => ['YYYY-MM-DD'];
	duoDynamoUtil.queryAcceptPriceEvent = jest.fn(() => Promise.resolve());
	relayerServer.duoAcceptedPrices = {};
	relayerServer.web3Util = {
		tokens: [
			{ custodian: '0xf474e7E554D98a580282726434d1281aA273E87F'.toLowerCase() },
			{ custodian: '0xf474e7E554D98a580282726434d1281aA273E87F'.toLowerCase() }
		]
	} as any;
	await relayerServer.loadDuoAcceptedPrices();
	expect(relayerServer.duoAcceptedPrices).toEqual({});
	expect((duoDynamoUtil.queryAcceptPriceEvent as jest.Mock).mock.calls).toMatchSnapshot();
});

test('loadDuoExchangePrices', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	duoDynamoUtil.getPrices = jest.fn(() => Promise.resolve());
	await relayerServer.loadDuoExchangePrices();
	expect(relayerServer.duoExchangePrices).toEqual({});
	expect((duoDynamoUtil.getPrices as jest.Mock).mock.calls).toMatchSnapshot();
});

const ws1 = {
	name: 'ws',
	on: jest.fn()
};
test('handleWebSocketConnection', () => {
	relayerServer.clients = [];
	relayerServer.sendInfo = jest.fn();
	relayerServer.handleWebSocketConnection(ws1 as any);
	expect(relayerServer.clients).toMatchSnapshot();
	expect((ws1.on as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleWebSocketConnection same connection', () => {
	relayerServer.clients = [];
	relayerServer.sendInfo = jest.fn();
	relayerServer.handleWebSocketConnection(ws1 as any);
	expect(relayerServer.clients).toMatchSnapshot();
	expect((ws1.on as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleWebSocketClose', () => {
	relayerServer.unsubscribeOrderBook = jest.fn();
	relayerServer.unsubscribeOrderHistory = jest.fn();
	relayerServer.orderBookPairs = {
		pair: ['ws'] as any
	};
	relayerServer.accountClients = {
		account: ['ws'] as any
	};
	relayerServer.handleWebSocketClose(ws1 as any);
	expect(relayerServer.clients).toEqual([]);
	expect((relayerServer.unsubscribeOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerServer.unsubscribeOrderHistory as jest.Mock).mock.calls).toMatchSnapshot();
});
