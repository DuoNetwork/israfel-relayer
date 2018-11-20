// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import * as CST from '../common/constants';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import relayerServer from './relayerServer';

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

test('sendOrderBookSnapshotResponse', () => {
	const ws = {
		send: jest.fn()
	};
	relayerServer.sendOrderBookSnapshotResponse(
		ws as any,
		'pair',
		'orderBookSnapshot' as any
	);
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
})

test('sendOrderBookUpdateResponse', () => {
	const ws = {
		send: jest.fn()
	};
	relayerServer.sendOrderBookUpdateResponse(
		ws as any,
		'pair',
		'orderBookUpdate' as any
	);
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
})

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
	relayerServer.sendErrorOrderResponse = jest.fn();
	relayerServer.sendUserOrderResponse = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
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
		pair: CST.SUPPORTED_PAIRS[0],
		order: signedOrder,
		orderHash: '0xInvalidHash'
	});
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
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
		pair: CST.SUPPORTED_PAIRS[0],
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
		pair: CST.SUPPORTED_PAIRS[0],
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
		pair: CST.SUPPORTED_PAIRS[0],
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
			pair: CST.SUPPORTED_PAIRS[0],
			orderHash: ''
		} as any
	);
	await relayerServer.handleTerminateOrderRequest(
		{} as any,
		{
			channel: CST.DB_ORDERS,
			method: CST.DB_TERMINATE,
			pair: CST.SUPPORTED_PAIRS[0],
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
		pair: CST.SUPPORTED_PAIRS[0],
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
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.sendErrorOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerServer.sendUserOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderRequest invalid requests', async () => {
	const ws = {
		send: jest.fn()
	};
	await relayerServer.handleOrderRequest(ws as any, {
		channel: CST.DB_ORDERS,
		method: '',
		pair: '',
		orderHash: ''
	});
	await relayerServer.handleOrderRequest(ws as any, {
		channel: CST.DB_ORDERS,
		method: 'test',
		pair: '',
		orderHash: ''
	});
	await relayerServer.handleOrderRequest(ws as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: '',
		orderHash: ''
	});
	await relayerServer.handleOrderRequest(ws as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: 'test',
		orderHash: ''
	});
	await relayerServer.handleOrderRequest(ws as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: ''
	});
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderRequest add', async () => {
	const ws = {};
	relayerServer.handleAddOrderRequest = jest.fn();
	relayerServer.handleTerminateOrderRequest = jest.fn();
	await relayerServer.handleOrderRequest(ws as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect((relayerServer.handleAddOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleTerminateOrderRequest as jest.Mock).not.toBeCalled();
});

test('handleOrderRequest terminate', async () => {
	const ws = {};
	relayerServer.handleAddOrderRequest = jest.fn();
	relayerServer.handleTerminateOrderRequest = jest.fn();
	await relayerServer.handleOrderRequest(ws as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.handleAddOrderRequest as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleTerminateOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleWebSocketMessage invalid requests', () => {
	const ws = {
		send: jest.fn()
	};
	relayerServer.handleWebSocketMessage(ws as any, JSON.stringify({}));
	relayerServer.handleWebSocketMessage(
		ws as any,
		JSON.stringify({
			channel: 'channel',
			method: 'method',
			pair: CST.SUPPORTED_PAIRS[0]
		})
	);
	relayerServer.handleWebSocketMessage(
		ws as any,
		JSON.stringify({
			channel: CST.DB_ORDERS,
			method: '',
			pair: CST.SUPPORTED_PAIRS[0]
		})
	);
	relayerServer.handleWebSocketMessage(
		ws as any,
		JSON.stringify({
			channel: CST.DB_ORDERS,
			method: 'method',
			pair: 'test'
		})
	);
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleWebSocketMessage orders', () => {
	const ws = {};
	relayerServer.handleOrderRequest = jest.fn();
	relayerServer.handleWebSocketMessage(
		ws as any,
		JSON.stringify({
			channel: CST.DB_ORDERS,
			method: 'method',
			pair: CST.SUPPORTED_PAIRS[0]
		})
	);
	expect((relayerServer.handleOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});
