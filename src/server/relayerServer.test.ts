// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import * as DataConstants from '@finbook/duo-market-data/dist/constants';
import * as fs from 'fs';
import WebSocket from 'ws';
import * as Constants from '../../../israfel-common/src/constants';
import OrderUtil from '../../../israfel-common/src/OrderUtil';
import Util from '../../../israfel-common/src/Util';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import tradePriceUtil from '../utils/tradePriceUtil';
import relayerServer from './relayerServer';

jest.mock('../../../israfel-common/src', () => ({
	Constants: Constants,
	OrderUtil: OrderUtil,
	Util: Util,
	Web3Util: jest.fn(() => ({}))
}));

jest.mock('@finbook/duo-market-data', () => ({
	Constants: DataConstants,
	DynamoUtil: jest.fn().mockImplementation(() => ({ test: 'DynamoUtil' }))
}));

jest.mock('fs', () => ({
	readFileSync: jest.fn()
}));

jest.mock('ws', () => ({
	Server: jest.fn(() => ({
		clients: {
			size: 123
		}
	}))
}));

jest.mock('https', () => ({
	createServer: jest.fn(() => ({
		listen: jest.fn((port: number) => port)
	}))
}));

import { DynamoUtil as DuoDynamoUtil } from '@finbook/duo-market-data';
import { Web3Util } from '../../../israfel-common/src';

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

test('sendInfo no web3Util', () => {
	const ws = {
		send: jest.fn()
	};
	relayerServer.web3Util = null;
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
			pair: 'pair'
		},
		'0xOrderHash',
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
	relayerServer.sendResponse = jest.fn();
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	// no orderHash
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_ADD,
		pair: 'pair',
		order: signedOrder,
		orderHash: ''
	});

	// no web3Util
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_ADD,
		pair: 'pair',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});

	relayerServer.web3Util = {
		getTokenByCode: jest.fn(() => null)
	} as any;
	// no token
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_ADD,
		pair: 'code1|code2',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});

	relayerServer.web3Util = {
		getTokenByCode: jest.fn((code: string) => code)
	} as any;
	OrderUtil.validateOrder = jest.fn(() => Promise.resolve(''));
	// failed validation test
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_ADD,
		pair: 'code1|code2',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});

	OrderUtil.validateOrder = jest.fn(() => Promise.resolve('0xOrderHash'));
	// invalid order hash
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_ADD,
		pair: 'code1|code2',
		order: signedOrder,
		orderHash: '0xInvalidOrderHash'
	});
	expect(orderPersistenceUtil.persistOrder as jest.Mock).not.toBeCalled();
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleAddOrderRequest invalid persist', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	Web3Util.getSideFromSignedOrder = jest.fn(() => 'side');
	relayerServer.web3Util = {
		getTokenByCode: jest.fn((code: string) => code)
	} as any;
	OrderUtil.validateOrder = jest.fn(() => Promise.resolve('0xOrderHash'));
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_ADD,
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
	OrderUtil.validateOrder = jest.fn(() => Promise.resolve('0xOrderHash'));
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.reject('handleAddOrderRequest'));
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_ADD,
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
	OrderUtil.validateOrder = jest.fn(() => Promise.resolve('0xOrderHash'));
	orderPersistenceUtil.persistOrder = jest.fn(() =>
		Promise.resolve({
			userOrder: 'userOrder'
		} as any)
	);
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_ADD,
		pair: 'code1|code2',
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerServer.sendUserOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.sendErrorOrderResponse as jest.Mock).not.toBeCalled();
});

test('handleTerminateOrderRequest invalid request and rawOrder does not exist', async () => {
	relayerServer.web3Util = null;
	relayerServer.sendResponse = jest.fn();
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_TERMINATE,
		pair: 'pair',
		orderHashes: [],
		signature: 'signature'
	});
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_TERMINATE,
		pair: 'pair',
		orderHashes: ['0xOrderHash'],
		signature: 'signature'
	});
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve('userOrder' as any));
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn(() => Promise.resolve(null));
	relayerServer.web3Util = {
		web3AccountsRecover: jest.fn(() => '')
	} as any;

	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_TERMINATE,
		pair: 'pair',
		orderHashes: ['0xOrderHash'],
		signature: 'signature'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.persistOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest signature is wrong', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve('userOrder' as any));
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn(() =>
		Promise.resolve({
			signedOrder: {
				makerAddress: 'account'
			}
		} as any)
	);
	relayerServer.web3Util = {
		web3AccountsRecover: jest.fn(() => 'xxx')
	} as any;
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_TERMINATE,
		pair: 'pair',
		orderHashes: ['0xOrderHash'],
		signature: 'siganature'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect(orderPersistenceUtil.persistOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest persist no return', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn(() =>
		Promise.resolve({
			signedOrder: {
				makerAddress: 'account'
			}
		} as any)
	);
	relayerServer.web3Util = {
		web3AccountsRecover: jest.fn(() => 'account')
	} as any;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_TERMINATE,
		pair: 'pair',
		orderHashes: ['0xOrderHash'],
		signature: 'signature'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest persist error', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn(() =>
		Promise.resolve({
			signedOrder: {
				makerAddress: 'account'
			}
		} as any)
	);
	relayerServer.web3Util = {
		web3AccountsRecover: jest.fn(() => 'account')
	} as any;
	orderPersistenceUtil.persistOrder = jest.fn(() =>
		Promise.reject('handleTerminateOrderRequest')
	);
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_TERMINATE,
		pair: 'pair',
		orderHashes: ['0xOrderHash'],
		signature: 'signature'
	});
	expect(relayerServer.sendUserOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendErrorOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest', async () => {
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn(() =>
		Promise.resolve({
			signedOrder: {
				makerAddress: 'account'
			}
		} as any)
	);
	relayerServer.web3Util = {
		web3AccountsRecover: jest.fn(() => 'account')
	} as any;
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve('userOrder' as any));
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_TERMINATE,
		pair: 'pair',
		orderHashes: ['0xOrderHash'],
		signature: 'signature'
	});
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.sendErrorOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendUserOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderUpdate requested by self', () => {
	relayerServer.accountClients = {
		account: ['ws', 'ws1'] as any
	};
	relayerServer.sendUserOrderResponse = jest.fn();
	relayerServer.handleOrderUpdate('channel', {
		requestor: Constants.DB_RELAYER
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
	OrderUtil.constructUserOrder = jest.fn(() => 'userOrder' as any);
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

test('handleOrderHistorySubscribeRequest no web3Util', async () => {
	relayerServer.accountClients = {};
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getUserOrders = jest.fn(() => Promise.resolve(['userOrders' as any]));
	Util.safeWsSend = jest.fn();
	orderPersistenceUtil.subscribeOrderUpdate = jest.fn();
	relayerServer.web3Util = null;
	await relayerServer.handleOrderHistorySubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: '',
		account: 'account'
	});
	expect(relayerServer.accountClients).toEqual({});
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderHistorySubscribeRequest new account ', async () => {
	relayerServer.accountClients = {};
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getUserOrders = jest.fn(() => Promise.resolve(['userOrders' as any]));
	Util.safeWsSend = jest.fn();
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
			},
			{
				code: 'code2',
				feeSchedules: {
					base1: {},
					base2: {}
				},
				maturity: 123
			}
		]
	} as any;
	relayerServer.handleOrderUpdate = jest.fn();
	await relayerServer.handleOrderHistorySubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: '',
		account: 'account'
	});
	expect(relayerServer.accountClients).toMatchSnapshot();
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	(orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).mock.calls[0][1](
		'channel',
		'orderQueueItem'
	);
	expect((relayerServer.handleOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistorySubscribeRequest existing account same ws', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getUserOrders = jest.fn(() => Promise.resolve(['userOrders' as any]));
	Util.safeWsSend = jest.fn();
	orderPersistenceUtil.subscribeOrderUpdate = jest.fn();
	await relayerServer.handleOrderHistorySubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: '',
		account: 'account'
	});
	expect(relayerServer.accountClients).toMatchSnapshot();
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderHistorySubscribeRequest existing account new ws', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getUserOrders = jest.fn(() => Promise.resolve(['userOrders' as any]));
	Util.safeWsSend = jest.fn();
	orderPersistenceUtil.subscribeOrderUpdate = jest.fn();
	await relayerServer.handleOrderHistorySubscribeRequest('ws1' as any, {
		channel: 'channel',
		method: 'method',
		pair: '',
		account: 'account'
	});
	expect(relayerServer.accountClients).toMatchSnapshot();
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).not.toBeCalled();
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

test('handleOrderHistoryUnsubscribeRequest existing account clean up no web3Util', async () => {
	relayerServer.sendResponse = jest.fn();
	orderPersistenceUtil.unsubscribeOrderUpdate = jest.fn();
	relayerServer.web3Util = null;
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
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_ADD,
		pair: 'pair'
	});
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => false)
	} as any;
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_ADD,
		pair: 'pair'
	});
	await relayerServer.handleOrderRequest(
		'ws' as any,
		{
			channel: Constants.DB_ORDERS,
			method: Constants.WS_SUB,
			pair: 'pair',
			account: ''
		} as any
	);
	await relayerServer.handleOrderRequest(
		'ws' as any,
		{
			channel: Constants.DB_ORDERS,
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
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => true)
	} as any;
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_ADD,
		pair: 'pair'
	});
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
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => true)
	} as any;
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: Constants.DB_ORDERS,
		method: Constants.DB_TERMINATE,
		pair: 'pair'
	});
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
			channel: Constants.DB_ORDERS,
			method: Constants.WS_SUB,
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
			channel: Constants.DB_ORDERS,
			method: Constants.WS_UNSUB,
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
	Util.safeWsSend = jest.fn();
	relayerServer.handleOrderBookUpdate('channel', {
		pair: 'code1|code2'
	} as any);
	relayerServer.orderBookPairs = {
		'code1|code2': []
	};
	relayerServer.handleOrderBookUpdate('channel', {
		pair: 'code1|code2'
	} as any);
	expect(Util.safeWsSend as jest.Mock).not.toBeCalled();
});

test('handleOrderBookUpdate', () => {
	Util.safeWsSend = jest.fn();
	relayerServer.orderBookPairs = {
		'code1|code2': ['ws1', 'ws2'] as any
	};
	relayerServer.handleOrderBookUpdate('channel', {
		pair: 'code1|code2'
	} as any);
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookSubscribeRequest new pair', async () => {
	relayerServer.orderBookPairs = {};
	orderBookPersistenceUtil.subscribeOrderBookUpdate = jest.fn();
	orderBookPersistenceUtil.getOrderBookSnapshot = jest.fn(() =>
		Promise.resolve('snapshot' as any)
	);
	Util.safeWsSend = jest.fn();
	relayerServer.handleOrderBookUpdate = jest.fn();
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
	(orderBookPersistenceUtil.subscribeOrderBookUpdate as jest.Mock).mock.calls[0][1](
		'channel',
		'obsu'
	);
	expect((relayerServer.handleOrderBookUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.getOrderBookSnapshot as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookSubscribeRequest new pair no snapshot', async () => {
	relayerServer.orderBookPairs = {};
	orderBookPersistenceUtil.subscribeOrderBookUpdate = jest.fn();
	orderBookPersistenceUtil.getOrderBookSnapshot = jest.fn(() => Promise.resolve(null));
	relayerServer.sendResponse = jest.fn();
	Util.safeWsSend = jest.fn();
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
	expect(Util.safeWsSend as jest.Mock).not.toBeCalled();
});

test('handleOrderBookSubscribeRequest empty list', async () => {
	relayerServer.orderBookPairs = {
		pair: []
	};
	orderBookPersistenceUtil.subscribeOrderBookUpdate = jest.fn();
	orderBookPersistenceUtil.getOrderBookSnapshot = jest.fn(() =>
		Promise.resolve('snapshot' as any)
	);
	Util.safeWsSend = jest.fn();
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
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookSubscribeRequest existing pair new ws', async () => {
	relayerServer.orderBookPairs = {
		pair: ['ws1'] as any
	};
	orderBookPersistenceUtil.subscribeOrderBookUpdate = jest.fn();
	orderBookPersistenceUtil.getOrderBookSnapshot = jest.fn(() =>
		Promise.resolve('snapshot' as any)
	);
	Util.safeWsSend = jest.fn();
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
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookSubscribeRequest existing pair existing ws', async () => {
	relayerServer.orderBookPairs = {
		pair: ['ws'] as any
	};
	orderBookPersistenceUtil.subscribeOrderBookUpdate = jest.fn();
	orderBookPersistenceUtil.getOrderBookSnapshot = jest.fn(() =>
		Promise.resolve('snapshot' as any)
	);
	Util.safeWsSend = jest.fn();
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
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
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
		method: Constants.WS_SUB,
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
		method: Constants.WS_SUB,
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
		method: Constants.WS_UNSUB,
		pair: 'pair'
	});
	expect(relayerServer.sendResponse as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleOrderBookSubscribeRequest as jest.Mock).not.toBeCalled();
	expect(
		(relayerServer.handleOrderBookUnsubscribeRequest as jest.Mock).mock.calls
	).toMatchSnapshot();
});

const trade = {
	pair: 'pair',
	transactionHash: 'txHash',
	taker: {
		orderHash: 'orderHash1',
		address: 'address',
		side: 'bid',
		price: 0.01,
		amount: 20,
		fee: 0.1
	},
	maker: {
		orderHash: 'orderHash2',
		price: 0.01,
		amount: 20,
		fee: 0.1
	},
	feeAsset: 'aETH',
	timestamp: 1234567890
};

test('handleTradeUpdate empty ws list', () => {
	relayerServer.tradePairs = {};
	Util.safeWsSend = jest.fn();
	relayerServer.handleTradeUpdate('channel', {
		pair: 'pair'
	} as any);
	relayerServer.tradePairs = {
		pair: []
	};
	relayerServer.handleTradeUpdate('channel', {
		pair: 'pair'
	} as any);
	expect(Util.safeWsSend as jest.Mock).not.toBeCalled();
	expect(relayerServer.marketTrades).toMatchSnapshot();
});

test('handleTradeUpdate, no previous trades', () => {
	relayerServer.tradePairs = { pair: ['ws' as any] };
	Util.safeWsSend = jest.fn();
	relayerServer.marketTrades = {};
	relayerServer.handleTradeUpdate('channel', trade);
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.marketTrades).toMatchSnapshot();
});

test('handleTradeUpdate, have previous trades', () => {
	relayerServer.tradePairs = { pair: ['ws' as any] };
	relayerServer.marketTrades['pair'] = [trade];
	Util.safeWsSend = jest.fn();
	const secondTrade = Util.clone(trade);
	secondTrade.transactionHash = 'txHash2';
	secondTrade.timestamp = 1234567880;
	relayerServer.handleTradeUpdate('channel', secondTrade);
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.marketTrades).toMatchSnapshot();
});

test('handleTradeSubscribeRequest new pair', async () => {
	relayerServer.tradePairs = {};
	Util.safeWsSend = jest.fn();
	await relayerServer.handleTradeSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.tradePairs).toEqual({
		pair: ['ws']
	});
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTradeSubscribeRequest empty list', async () => {
	relayerServer.tradePairs = {
		pair: []
	};
	Util.safeWsSend = jest.fn();
	await relayerServer.handleTradeSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.tradePairs).toEqual({
		pair: ['ws']
	});
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTradeSubscribeRequest existing pair new ws', async () => {
	relayerServer.tradePairs = {
		pair: ['ws1'] as any
	};
	Util.safeWsSend = jest.fn();
	await relayerServer.handleTradeSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.tradePairs).toEqual({
		pair: ['ws1', 'ws']
	});
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTradeSubscribeRequest existing pair existing ws', async () => {
	relayerServer.tradePairs = {
		pair: ['ws'] as any
	};
	Util.safeWsSend = jest.fn();
	await relayerServer.handleTradeSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.tradePairs).toEqual({
		pair: ['ws']
	});
	expect((Util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTradeUnsubscribeRequest non existing pair', () => {
	relayerServer.tradePairs = {};
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleTradeUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.tradePairs).toEqual({});
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTradeUnsubscribeRequest existing pair non existing ws', () => {
	relayerServer.tradePairs = {
		pair: []
	};
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleTradeUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.tradePairs).toEqual({
		pair: []
	});
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTradeUnsubscribeRequest no more subscription', () => {
	relayerServer.tradePairs = {
		pair: ['ws'] as any
	};
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleTradeUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.tradePairs).toEqual({});
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTradeUnsubscribeRequest', () => {
	relayerServer.tradePairs = {
		pair: ['ws', 'ws1'] as any
	};
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleTradeUnsubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.tradePairs).toEqual({
		pair: ['ws1']
	});
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTradeRequest invalid method', async () => {
	relayerServer.web3Util = null;
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleTradeSubscribeRequest = jest.fn();
	relayerServer.handleTradeUnsubscribeRequest = jest.fn();
	await relayerServer.handleTradeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => false)
	} as any;
	await relayerServer.handleTradeRequest('ws' as any, {
		channel: 'channel',
		method: Constants.WS_SUB,
		pair: 'pair'
	});
	expect((relayerServer.sendResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleTradeSubscribeRequest as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleTradeUnsubscribeRequest as jest.Mock).not.toBeCalled();
});

test('handleTradeRequest subscribe', async () => {
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleTradeSubscribeRequest = jest.fn();
	relayerServer.handleTradeUnsubscribeRequest = jest.fn();
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => true)
	} as any;
	await relayerServer.handleTradeRequest('ws' as any, {
		channel: 'channel',
		method: Constants.WS_SUB,
		pair: 'pair'
	});
	expect(relayerServer.sendResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleTradeSubscribeRequest as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleTradeUnsubscribeRequest as jest.Mock).not.toBeCalled();
});

test('handleTradeRequest unsubscribe', async () => {
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleTradeSubscribeRequest = jest.fn();
	relayerServer.handleTradeUnsubscribeRequest = jest.fn();
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => true)
	} as any;
	await relayerServer.handleTradeRequest('ws' as any, {
		channel: 'channel',
		method: Constants.WS_UNSUB,
		pair: 'pair'
	});
	expect(relayerServer.sendResponse as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleTradeSubscribeRequest as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleTradeUnsubscribeRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleWebSocketMessage invalid requests', () => {
	relayerServer.sendResponse = jest.fn();
	relayerServer.handleWebSocketMessage('ws' as any, 'ip', JSON.stringify({}));
	relayerServer.handleWebSocketMessage(
		'ws' as any,
		'ip',
		JSON.stringify({
			channel: 'channel',
			method: 'method',
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
		'ip',
		JSON.stringify({
			channel: Constants.DB_ORDERS,
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
		'ip',
		JSON.stringify({
			channel: Constants.DB_ORDER_BOOKS,
			method: 'method',
			pair: 'pair'
		})
	);
	expect((relayerServer.handleOrderBookRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleWebSocketMessage trades', () => {
	const ws = {};
	relayerServer.handleTradeRequest = jest.fn();
	relayerServer.handleWebSocketMessage(
		ws as any,
		'ip',
		JSON.stringify({
			channel: Constants.DB_TRADES,
			method: 'method',
			pair: 'pair'
		})
	);
	expect((relayerServer.handleTradeRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('loadDuoAcceptedPrices no web3Util', async () => {
	const queryAcceptPriceEvent = jest.fn(() => Promise.resolve());
	relayerServer.duoAcceptedPrices = {};
	relayerServer.web3Util = null;
	await relayerServer.loadDuoAcceptedPrices({
		queryAcceptPriceEvent: queryAcceptPriceEvent
	} as any);
	expect(relayerServer.duoAcceptedPrices).toEqual({});
	expect(queryAcceptPriceEvent).not.toBeCalled();
});

test('loadDuoAcceptedPrices no tokens', async () => {
	const queryAcceptPriceEvent = jest.fn(() => Promise.resolve());
	relayerServer.duoAcceptedPrices = {};
	relayerServer.web3Util = {
		tokens: []
	} as any;
	await relayerServer.loadDuoAcceptedPrices({
		queryAcceptPriceEvent: queryAcceptPriceEvent
	} as any);
	expect(relayerServer.duoAcceptedPrices).toEqual({});
	expect(queryAcceptPriceEvent).not.toBeCalled();
});

test('loadDuoAcceptedPrices', async () => {
	Web3Util.toChecksumAddress = jest.fn(addr => addr);
	Util.getDates = () => ['YYYY-MM-DD'];
	const queryAcceptPriceEvent = jest.fn(() => Promise.resolve());
	relayerServer.duoAcceptedPrices = {};
	relayerServer.web3Util = {
		tokens: [
			{ custodian: '0xf474e7E554D98a580282726434d1281aA273E87F'.toLowerCase() },
			{ custodian: '0xf474e7E554D98a580282726434d1281aA273E87F'.toLowerCase() }
		]
	} as any;
	await relayerServer.loadDuoAcceptedPrices({
		queryAcceptPriceEvent: queryAcceptPriceEvent
	} as any);
	expect(relayerServer.duoAcceptedPrices).toEqual({});
	expect(queryAcceptPriceEvent.mock.calls).toMatchSnapshot();
});

test('loadDuoExchangePrices', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	const getPrices = jest.fn(() => Promise.resolve());
	await relayerServer.loadDuoExchangePrices({
		getPrices: getPrices
	} as any);
	expect(relayerServer.duoExchangePrices).toEqual({});
	expect(getPrices.mock.calls).toMatchSnapshot();
});

test('loadAndSubscribeMarketTrades no web3Util', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getTrades = jest
		.fn()
		.mockResolvedValueOnce([{ pair: 'pair' }])
		.mockResolvedValueOnce([] as any) as any;
	relayerServer.web3Util = null;
	tradePriceUtil.subscribeTradeUpdate = jest.fn();
	relayerServer.marketTrades = {};
	await relayerServer.loadAndSubscribeMarketTrades();
	expect(dynamoUtil.getTrades as jest.Mock).not.toBeCalled();
	expect(tradePriceUtil.subscribeTradeUpdate as jest.Mock).not.toBeCalled();
	expect(relayerServer.marketTrades).toEqual({});
});

test('loadAndSubscribeMarketTrades', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getTrades = jest
		.fn()
		.mockResolvedValueOnce([{ pair: 'pair' }])
		.mockResolvedValueOnce([] as any) as any;
	relayerServer.web3Util = {
		tokens: [{ code: 'code1' }, { code: 'code2' }]
	} as any;
	tradePriceUtil.subscribeTradeUpdate = jest.fn();
	relayerServer.marketTrades = {};
	relayerServer.handleTradeUpdate = jest.fn();
	await relayerServer.loadAndSubscribeMarketTrades();
	expect((dynamoUtil.getTrades as jest.Mock).mock.calls).toMatchSnapshot();
	expect((tradePriceUtil.subscribeTradeUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.marketTrades).toMatchSnapshot();
	(tradePriceUtil.subscribeTradeUpdate as jest.Mock).mock.calls[0][1]('channel', 'trade');
	expect((relayerServer.handleTradeUpdate as jest.Mock).mock.calls).toMatchSnapshot();
});

const ws1 = {
	name: 'ws',
	on: jest.fn()
};

test('handleWebSocketClose', () => {
	relayerServer.unsubscribeOrderBook = jest.fn();
	relayerServer.unsubscribeOrderHistory = jest.fn();
	relayerServer.unsubscribeTrade = jest.fn();
	relayerServer.orderBookPairs = {
		pair: ['ws'] as any
	};
	relayerServer.accountClients = {
		account: ['ws'] as any
	};
	relayerServer.tradePairs = {
		pair: ['ws'] as any
	};
	relayerServer.handleWebSocketClose(ws1 as any, 'ip');
	expect((relayerServer.unsubscribeOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerServer.unsubscribeOrderHistory as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerServer.unsubscribeTrade as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleWebSocketConnection', () => {
	relayerServer.sendInfo = jest.fn();
	relayerServer.handleWebSocketMessage = jest.fn();
	relayerServer.handleWebSocketClose = jest.fn();
	relayerServer.handleWebSocketConnection(ws1 as any, 'ip');
	expect(ws1.on).toBeCalledTimes(2);
	expect(ws1.on.mock.calls[0][0]).toBe('message');
	ws1.on.mock.calls[0][1]('testMessage');
	expect((relayerServer.handleWebSocketMessage as jest.Mock).mock.calls).toMatchSnapshot();
	expect(ws1.on.mock.calls[1][0]).toBe('close');
	ws1.on.mock.calls[1][1]();
	expect((relayerServer.handleWebSocketClose as jest.Mock).mock.calls).toMatchSnapshot();
});

test('initializeCache', async () => {
	global.setInterval = jest.fn();
	dynamoUtil.scanTokens = jest.fn(() => Promise.resolve(['token' as any]));
	dynamoUtil.scanIpList = jest.fn(() => Promise.resolve('ip' as any));
	dynamoUtil.scanStatus = jest.fn(() => Promise.resolve(['status' as any]));
	relayerServer.loadDuoAcceptedPrices = jest.fn(() => Promise.resolve());
	relayerServer.loadDuoExchangePrices = jest.fn(() => Promise.resolve());
	relayerServer.loadAndSubscribeMarketTrades = jest.fn(() => Promise.resolve());
	const web3Util = {
		setTokens: jest.fn()
	};
	await relayerServer.initializeCache(web3Util as any, {} as any);
	expect((global.setInterval as jest.Mock).mock.calls).toMatchSnapshot();
	await (global.setInterval as jest.Mock).mock.calls[0][0]();
	await (global.setInterval as jest.Mock).mock.calls[1][0]();
	await (global.setInterval as jest.Mock).mock.calls[2][0]();
	expect(dynamoUtil.scanTokens as jest.Mock).toBeCalledTimes(2);
	expect(dynamoUtil.scanIpList as jest.Mock).toBeCalledTimes(2);
	expect(dynamoUtil.scanStatus as jest.Mock).toBeCalledTimes(2);
	expect(relayerServer.loadDuoAcceptedPrices as jest.Mock).toBeCalledTimes(2);
	expect(relayerServer.loadDuoExchangePrices as jest.Mock).toBeCalledTimes(2);
	expect(relayerServer.loadAndSubscribeMarketTrades as jest.Mock).toBeCalledTimes(1);
	expect(web3Util.setTokens.mock.calls).toMatchSnapshot();
});

test('verifyClient, first connection', () => {
	relayerServer.ipList = {};
	dynamoUtil.updateIpList = jest.fn(() => Promise.resolve());
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890000);
	expect(
		relayerServer.verifyClient({
			req: {
				headers: {},
				connection: {
					remoteAddress: 'ip'
				}
			}
		} as any)
	).toBeTruthy();
	expect(relayerServer.connectedIp).toMatchSnapshot();
	expect(dynamoUtil.updateIpList as jest.Mock).not.toBeCalled();
});

test('verifyClient, connect after 3 seconds', () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890000 + 3000);
	dynamoUtil.updateIpList = jest.fn(() => Promise.resolve());
	expect(
		relayerServer.verifyClient({
			req: {
				headers: {
					'x-forwarded-for': 'ip'
				}
			}
		} as any)
	).toBeTruthy();
	expect(relayerServer.connectedIp).toMatchSnapshot();
	expect(dynamoUtil.updateIpList as jest.Mock).not.toBeCalled();
});

test('verifyClient, connect within 3 seconds', () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890000 + 3000 + 2999);
	dynamoUtil.updateIpList = jest.fn(() => Promise.resolve());
	expect(
		relayerServer.verifyClient({
			req: {
				headers: {
					'x-forwarded-for': 'ip'
				}
			}
		} as any)
	).toBeFalsy();
	expect(relayerServer.connectedIp).toMatchSnapshot();
	expect(dynamoUtil.updateIpList as jest.Mock).not.toBeCalled();
});

test('verifyClient, connect after 1 min', () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890000 + 60000);
	dynamoUtil.updateIpList = jest.fn(() => Promise.resolve());
	expect(
		relayerServer.verifyClient({
			req: {
				headers: {
					'x-forwarded-for': 'ip'
				}
			}
		} as any)
	).toBeTruthy();
	expect(relayerServer.connectedIp).toMatchSnapshot();
	expect(dynamoUtil.updateIpList as jest.Mock).not.toBeCalled();
});

test('verifyClient, ban ip', () => {
	for (let i = 0; i < 19; i++) relayerServer.connectedIp['ip'].push(1234567890000 + 60000 + i);
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890000 + 61000);
	dynamoUtil.updateIpList = jest.fn(() => Promise.resolve());
	expect(
		relayerServer.verifyClient({
			req: {
				headers: {
					'x-forwarded-for': 'ip'
				}
			}
		} as any)
	).toBeFalsy();
	expect(relayerServer.connectedIp).toEqual({});
	expect(relayerServer.ipList).toMatchSnapshot();
	expect((dynamoUtil.updateIpList as jest.Mock).mock.calls).toMatchSnapshot();
});

test('verifyClient, block black ip', () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890000 + 61000);
	dynamoUtil.updateIpList = jest.fn(() => Promise.resolve());
	expect(
		relayerServer.verifyClient({
			req: {
				headers: {
					'x-forwarded-for': 'ip'
				}
			}
		} as any)
	).toBeFalsy();
	expect(relayerServer.connectedIp).toEqual({});
	expect(dynamoUtil.updateIpList as jest.Mock).not.toBeCalled();
});

test('verifyClient, white', () => {
	relayerServer.ipList = {
		ip: Constants.DB_WHITE
	};
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890000 + 61000);
	dynamoUtil.updateIpList = jest.fn(() => Promise.resolve());
	expect(
		relayerServer.verifyClient({
			req: {
				headers: {
					'x-forwarded-for': 'ip'
				}
			}
		} as any)
	).toBeTruthy();
	expect(relayerServer.connectedIp).toEqual({});
	expect(dynamoUtil.updateIpList as jest.Mock).not.toBeCalled();
});

test('initializeWsServer', () => {
	global.setInterval = jest.fn();
	relayerServer.handleWebSocketConnection = jest.fn();
	relayerServer.sendInfo = jest.fn();
	const wss = {
		clients: ['ws'],
		on: jest.fn()
	};
	relayerServer.initializeWsServer(wss as any);
	expect((global.setInterval as jest.Mock).mock.calls).toMatchSnapshot();
	(global.setInterval as jest.Mock).mock.calls[0][0]();
	expect((relayerServer.sendInfo as jest.Mock).mock.calls).toMatchSnapshot();
	expect(wss.on.mock.calls).toMatchSnapshot();
	wss.on.mock.calls[0][1]('ws', {
		headers: {},
		connection: {
			remoteAddress: 'ip'
		}
	});
	wss.on.mock.calls[0][1]('ws', {
		headers: {
			'x-forwarded-for': 'ip'
		}
	});
	expect((relayerServer.handleWebSocketConnection as jest.Mock).mock.calls).toMatchSnapshot();
});

test('startServer', async () => {
	Web3Util.fromWei = jest.fn();
	relayerServer.initializeCache = jest.fn(() => Promise.resolve());
	relayerServer.initializeWsServer = jest.fn();
	dynamoUtil.updateStatus = jest.fn(() => Promise.resolve());
	global.setInterval = jest.fn();

	await relayerServer.startServer(
		'config' as any,
		{ server: true, env: Constants.DB_LIVE } as any
	);
	expect((Web3Util as any).mock.calls).toMatchSnapshot();
	expect((DuoDynamoUtil as any).mock.calls).toMatchSnapshot();
	const fsCalls = (fs.readFileSync as jest.Mock).mock.calls;
	expect(fsCalls.slice(fsCalls.length - 2)).toMatchSnapshot();
	expect((WebSocket.Server as any).mock.calls).toMatchSnapshot();
	expect((global.setInterval as jest.Mock).mock.calls).toMatchSnapshot();
	await (global.setInterval as jest.Mock).mock.calls[0][0]();
	expect((dynamoUtil.updateStatus as jest.Mock).mock.calls).toMatchSnapshot();
});

test('startServer no server', async () => {
	Web3Util.fromWei = jest.fn();
	relayerServer.initializeCache = jest.fn(() => Promise.resolve());
	relayerServer.initializeWsServer = jest.fn();
	dynamoUtil.updateStatus = jest.fn(() => Promise.resolve());
	global.setInterval = jest.fn();

	await relayerServer.startServer('config' as any, { env: Constants.DB_DEV } as any);
	expect((Web3Util as any).mock.calls).toMatchSnapshot();
	const fsCalls = (fs.readFileSync as jest.Mock).mock.calls;
	expect(fsCalls.slice(fsCalls.length - 2)).toMatchSnapshot();
	expect((WebSocket.Server as any).mock.calls).toMatchSnapshot();
	expect(global.setInterval as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.updateStatus as jest.Mock).not.toBeCalled();
});
