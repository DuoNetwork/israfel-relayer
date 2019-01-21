// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import duoDynamoUtil from '../../../duo-admin/src/utils/dynamoUtil';
import * as CST from '../common/constants';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import orderUtil from '../utils/orderUtil';
import tradePriceUtil from '../utils/tradePriceUtil';
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
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'pair',
		order: signedOrder,
		orderHash: ''
	});

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

test('handleTerminateOrderRequest invalid request and rawOrder does not exist', async () => {
	relayerServer.web3Util = null;
	relayerServer.sendResponse = jest.fn();
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: 'pair',
		orderHashes: [],
		signature: 'signature'
	});
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: 'pair',
		orderHashes: ['0xOrderHash'],
		signature: 'signature'
	});
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve('userOrder'));
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn(() => Promise.resolve(null));
	relayerServer.web3Util = {
		web3AccountsRecover: jest.fn(() => '')
	} as any;

	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
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
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve('userOrder'));
	orderPersistenceUtil.getRawOrderInPersistence = jest.fn(() =>
		Promise.resolve({
			signedOrder: {
				makerAddress: 'account'
			}
		})
	);
	relayerServer.web3Util = {
		web3AccountsRecover: jest.fn(() => 'xxx')
	} as any;
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
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

test('handleOrderHistorySubscribeRequest no web3Util', async () => {
	relayerServer.accountClients = {};
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getUserOrders = jest.fn(() => Promise.resolve(['userOrders']));
	util.safeWsSend = jest.fn();
	orderPersistenceUtil.subscribeOrderUpdate = jest.fn();
	relayerServer.web3Util = null;
	await relayerServer.handleOrderHistorySubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: '',
		account: 'account'
	});
	expect(relayerServer.accountClients).toEqual({});
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderHistorySubscribeRequest new account ', async () => {
	relayerServer.accountClients = {};
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
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	(orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).mock.calls[0][1](
		'channel',
		'orderQueueItem'
	);
	expect((relayerServer.handleOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
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
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'pair'
	});
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => false)
	} as any;
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'pair'
	});
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
	relayerServer.web3Util = {
		isValidPair: jest.fn(() => true)
	} as any;
	await relayerServer.handleOrderRequest('ws' as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
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
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
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
	util.safeWsSend = jest.fn();
	relayerServer.handleTradeUpdate('channel', {
		pair: 'pair'
	} as any);
	relayerServer.tradePairs = {
		pair: []
	};
	relayerServer.handleTradeUpdate('channel', {
		pair: 'pair'
	} as any);
	expect(util.safeWsSend as jest.Mock).not.toBeCalled();
	expect(relayerServer.marketTrades).toMatchSnapshot();
});

test('handleTradeUpdate, no previous trades', () => {
	relayerServer.tradePairs = { pair: ['ws' as any] };
	util.safeWsSend = jest.fn();
	relayerServer.marketTrades = {};
	relayerServer.handleTradeUpdate('channel', trade);
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.marketTrades).toMatchSnapshot();
});

test('handleTradeUpdate, have previous trades', () => {
	relayerServer.tradePairs = { pair: ['ws' as any] };
	relayerServer.marketTrades['pair'] = [trade];
	util.safeWsSend = jest.fn();
	const secondTrade = util.clone(trade);
	secondTrade.transactionHash = 'txHash2';
	secondTrade.timestamp = 1234567880;
	relayerServer.handleTradeUpdate('channel', secondTrade);
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.marketTrades).toMatchSnapshot();
});

test('handleTradeSubscribeRequest new pair', async () => {
	relayerServer.tradePairs = {};
	util.safeWsSend = jest.fn();
	await relayerServer.handleTradeSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.tradePairs).toEqual({
		pair: ['ws']
	});
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTradeSubscribeRequest empty list', async () => {
	relayerServer.tradePairs = {
		pair: []
	};
	util.safeWsSend = jest.fn();
	await relayerServer.handleTradeSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.tradePairs).toEqual({
		pair: ['ws']
	});
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTradeSubscribeRequest existing pair new ws', async () => {
	relayerServer.tradePairs = {
		pair: ['ws1'] as any
	};
	util.safeWsSend = jest.fn();
	await relayerServer.handleTradeSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.tradePairs).toEqual({
		pair: ['ws1', 'ws']
	});
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTradeSubscribeRequest existing pair existing ws', async () => {
	relayerServer.tradePairs = {
		pair: ['ws'] as any
	};
	util.safeWsSend = jest.fn();
	await relayerServer.handleTradeSubscribeRequest('ws' as any, {
		channel: 'channel',
		method: 'method',
		pair: 'pair'
	});
	expect(relayerServer.tradePairs).toEqual({
		pair: ['ws']
	});
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
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
		method: CST.WS_SUB,
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
		method: CST.WS_SUB,
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
		method: CST.WS_UNSUB,
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
		'ip',
		JSON.stringify({
			channel: CST.DB_ORDER_BOOKS,
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
			channel: CST.DB_TRADES,
			method: 'method',
			pair: 'pair'
		})
	);
	expect((relayerServer.handleTradeRequest as jest.Mock).mock.calls).toMatchSnapshot();
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

test('loadAndSubscribeMarketTrades no web3Util', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getTrades = jest
		.fn()
		.mockResolvedValueOnce([{ pair: 'pair' }])
		.mockResolvedValueOnce([]);
	relayerServer.web3Util = null;
	tradePriceUtil.subscribeTradeUpdate = jest.fn();
	relayerServer.marketTrades = {};
	await relayerServer.loadAndSubscribeMarketTrades();
	expect(dynamoUtil.getTrades as jest.Mock).not.toBeCalled();
	expect(tradePriceUtil.subscribeTradeUpdate as jest.Mock).not.toBeCalled();
	expect(relayerServer.marketTrades).toEqual({});
});

test('loadAndSubscribeMarketTrades', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.getTrades = jest
		.fn()
		.mockResolvedValueOnce([{ pair: 'pair' }])
		.mockResolvedValueOnce([]);
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

test('handleWebSocketConnection, first connection', () => {
	relayerServer.sendInfo = jest.fn();
	relayerServer.handleWebSocketMessage = jest.fn();
	relayerServer.handleWebSocketClose = jest.fn();
	util.getUTCNowTimestamp = jest.fn(() => 1234567890000);
	relayerServer.handleWebSocketConnection(ws1 as any, 'ip');
	expect(ws1.on).toBeCalledTimes(2);
	expect(ws1.on.mock.calls[0][0]).toBe('message');
	ws1.on.mock.calls[0][1]('testMessage');
	expect((relayerServer.handleWebSocketMessage as jest.Mock).mock.calls).toMatchSnapshot();
	expect(ws1.on.mock.calls[1][0]).toBe('close');
	ws1.on.mock.calls[1][1]();
	expect((relayerServer.handleWebSocketClose as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleWebSocketConnection, no connection within last one minute', () => {
	relayerServer.sendInfo = jest.fn();
	relayerServer.handleWebSocketMessage = jest.fn();
	relayerServer.handleWebSocketClose = jest.fn();
	util.getUTCNowTimestamp = jest.fn(() => 1234567890000);
	relayerServer.connectedIp['ip'] = [];
	relayerServer.handleWebSocketConnection(ws1 as any, 'ip');
	expect(ws1.on).toBeCalledTimes(4);
	expect(ws1.on.mock.calls[0][0]).toBe('message');
	ws1.on.mock.calls[0][1]('testMessage');
	expect((relayerServer.handleWebSocketMessage as jest.Mock).mock.calls).toMatchSnapshot();
	expect(ws1.on.mock.calls[1][0]).toBe('close');
	ws1.on.mock.calls[1][1]();
	expect((relayerServer.handleWebSocketClose as jest.Mock).mock.calls).toMatchSnapshot();
});

const ws2 = {
	name: 'ws',
	on: jest.fn()
};
test('handleWebSocketConnection, connect within one second', () => {
	relayerServer.sendInfo = jest.fn();
	relayerServer.handleWebSocketMessage = jest.fn();
	relayerServer.handleWebSocketClose = jest.fn();
	util.getUTCNowTimestamp = jest.fn(() => 1234567890000);
	util.safeWsSend = jest.fn();
	relayerServer.connectedIp['ip'] = [1234567889000];
	relayerServer.handleWebSocketConnection(ws2 as any, 'ip');
	expect(relayerServer.connectedIp).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.sendInfo as jest.Mock).not.toBeCalled();
	expect(ws2.on as jest.Mock).not.toBeCalled();
});

const ws3 = {
	name: 'ws',
	on: jest.fn()
};
test('handleWebSocketConnection, connect too much in one minute', () => {
	relayerServer.sendInfo = jest.fn();
	relayerServer.handleWebSocketMessage = jest.fn();
	relayerServer.handleWebSocketClose = jest.fn();
	util.getUTCNowTimestamp = jest.fn(() => 1234567890000);
	util.safeWsSend = jest.fn();
	relayerServer.connectedIp['ip'] = [];
	dynamoUtil.addIpList = jest.fn();
	for (let i = 0; i < 32; i++) relayerServer.connectedIp['ip'].push(1234567848000 + i);

	relayerServer.handleWebSocketConnection(ws3 as any, 'ip');
	expect(relayerServer.connectedIp).toMatchSnapshot();
	expect((util.safeWsSend as jest.Mock).mock.calls).toMatchSnapshot();
	expect((dynamoUtil.addIpList as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.sendInfo as jest.Mock).not.toBeCalled();
	expect(ws3.on as jest.Mock).not.toBeCalled();
});

test('initializeCache', async () => {
	global.setInterval = jest.fn();
	dynamoUtil.scanTokens = jest.fn(() => Promise.resolve(['token']));
	dynamoUtil.scanIpList = jest.fn(() => Promise.resolve(['ip']));
	dynamoUtil.scanStatus = jest.fn(() => Promise.resolve(['status']));
	relayerServer.loadDuoAcceptedPrices = jest.fn(() => Promise.resolve());
	relayerServer.loadDuoExchangePrices = jest.fn(() => Promise.resolve());
	relayerServer.loadAndSubscribeMarketTrades = jest.fn(() => Promise.resolve());
	const web3Util = {
		setTokens: jest.fn()
	};
	await relayerServer.initializeCache(web3Util as any);
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

test('verifyClient', () => {
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
	relayerServer.ipList = {
		ip: CST.DB_BLACK
	};
	expect(
		relayerServer.verifyClient({
			req: {
				headers: {
					'x-forwarded-for': 'ip'
				}
			}
		} as any)
	).toBeFalsy();
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
