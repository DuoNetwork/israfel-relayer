import * as CST from '../common/constants';
import orderUtil from '../utils/orderUtil';
import relayerServer from './relayerServer';

test('handleInvalidOrderRequest', () => {
	const ws = {
		send: jest.fn()
	};
	relayerServer.handleInvalidOrderRequest(ws as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleUserOrder', async () => {
	const ws = {
		send: jest.fn()
	};
	await relayerServer.handleUserOrder(ws as any, { test: 'liveOrder' } as any, 'type');
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleSequenceResponse add', async () => {
	orderUtil.persistOrder = jest.fn(() => Promise.resolve({ userOrder: 'test' }));
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.requestSequence = jest.fn();
	await relayerServer.handleSequenceResponse(
		{
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			sequence: 1,
			method: CST.DB_ADD,
			pair: 'pair',
			orderHash: 'orderHash'
		},
		'add|pair|orderHash',
		{
			request: {
				order: 'signedOrder'
			},
			liveOrder: {
				orderHash: 'orderHash'
			}
		} as any
	);
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleInvalidOrderRequest as jest.Mock).not.toBeCalled();
	expect(relayerServer.requestSequence as jest.Mock).not.toBeCalled();
});

test('handleSequenceResponse add invalid', async () => {
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.requestSequence = jest.fn();
	relayerServer.handleInvalidOrderRequest = jest.fn();
	orderUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleSequenceResponse(
		{
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			sequence: 1,
			method: CST.DB_ADD,
			pair: 'pair',
			orderHash: 'orderHash'
		},
		'add|pair|orderHash',
		{
			request: {
				order: 'signedOrder'
			},
			liveOrder: {
				orderHash: 'orderHash'
			}
		} as any
	);
	expect(relayerServer.handleUserOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleInvalidOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.requestSequence as jest.Mock).not.toBeCalled();
});

test('handleSequenceResponse add failed', async () => {
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.requestSequence = jest.fn();
	relayerServer.handleInvalidOrderRequest = jest.fn();
	orderUtil.persistOrder = jest.fn(() => Promise.reject());
	await relayerServer.handleSequenceResponse(
		{
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			sequence: 1,
			method: CST.DB_ADD,
			pair: 'pair',
			orderHash: 'orderHash'
		},
		'add|pair|orderHash',
		{
			request: {
				order: 'signedOrder'
			},
			liveOrder: {
				orderHash: 'orderHash'
			}
		} as any
	);
	expect(relayerServer.requestCache).toMatchSnapshot();
	expect(relayerServer.handleUserOrder as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleInvalidOrderRequest as jest.Mock).not.toBeCalled();
	expect((relayerServer.requestSequence as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleSequenceResponse cancel', async () => {
	orderUtil.persistOrder = jest.fn(() => Promise.resolve({ userOrder: 'test' }));
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.handleInvalidOrderRequest = jest.fn();
	await relayerServer.handleSequenceResponse(
		{
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			sequence: 2,
			method: CST.DB_CANCEL,
			pair: 'pair',
			orderHash: 'orderHash'
		},
		'cancel|pair|orderHash',
		{
			liveOrder: {
				orderHash: 'orderHash'
			}
		} as any
	);
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleInvalidOrderRequest as jest.Mock).not.toBeCalled();
});

test('handleSequenceResponse cancel failed', async () => {
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.requestSequence = jest.fn();
	relayerServer.handleInvalidOrderRequest = jest.fn();
	orderUtil.persistOrder = jest.fn(() => Promise.reject());
	await relayerServer.handleSequenceResponse(
		{
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			sequence: 2,
			method: CST.DB_CANCEL,
			pair: 'pair',
			orderHash: 'orderHash'
		},
		'cancel|pair|orderHash',
		{
			liveOrder: {
				orderHash: 'orderHash'
			}
		} as any
	)
	expect(relayerServer.requestCache).toMatchSnapshot();
	expect(relayerServer.handleUserOrder as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleInvalidOrderRequest as jest.Mock).not.toBeCalled();
	expect((relayerServer.requestSequence as jest.Mock).mock.calls).toMatchSnapshot();
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
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	orderUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	relayerServer.web3Util = {
		validateOrder: jest.fn(() => '0xOrderHash')
	} as any;
	relayerServer.requestSequence = jest.fn();
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
		order: signedOrder,
		orderHash: '0xInvalidHash'
	});
	expect(relayerServer.requestSequence as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleUserOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleInvalidOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleAddOrderRequest exist in request cache', async () => {
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.requestCache = {
		[`${CST.DB_ADD}|${CST.SUPPORTED_PAIRS[0]}|0xOrderHash`]: {}
	} as any;
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.requestSequence as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleUserOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleInvalidOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleAddOrderRequest exist in persistence', async () => {
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.requestCache = {};
	orderUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve({}));
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.requestSequence as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleUserOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleInvalidOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleAddOrderRequest', async () => {
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.web3Util = {
		validateOrder: jest.fn(() => '0xOrderHash')
	} as any;
	orderUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
	orderUtil.constructNewLiveOrder = jest.fn(() => ({ test: 'liveOrder' }));
	relayerServer.requestCache = {};
	relayerServer.requestSequence = jest.fn();
	await relayerServer.handleAddOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
		order: signedOrder,
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.requestCache).toMatchSnapshot();
	expect((relayerServer.requestSequence as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleInvalidOrderRequest as jest.Mock).not.toBeCalled();
});

test('handleCancelOrderRequest invalid order', async () => {
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	orderUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
	relayerServer.requestSequence = jest.fn();
	await relayerServer.handleCancelOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_CANCEL,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.requestSequence as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleUserOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleInvalidOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleCancelOrderRequest exist in request cache', async () => {
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.requestCache = {
		[`${CST.DB_CANCEL}|${CST.SUPPORTED_PAIRS[0]}|0xOrderHash`]: {}
	} as any;
	relayerServer.requestSequence = jest.fn();
	await relayerServer.handleCancelOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_CANCEL,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.requestSequence as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleUserOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleInvalidOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleCancelOrderRequest already cancelled', async () => {
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.requestCache = {};
	relayerServer.requestSequence = jest.fn();
	orderUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleCancelOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_CANCEL,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.requestSequence as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleUserOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleInvalidOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleCancelOrderRequest', async () => {
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	orderUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve({ test: 'liveOrder' }));
	relayerServer.requestSequence = jest.fn();
	relayerServer.requestCache = {};
	await relayerServer.handleCancelOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_CANCEL,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.requestCache).toMatchSnapshot();
	expect((relayerServer.requestSequence as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleInvalidOrderRequest as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls).toMatchSnapshot();
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
	await relayerServer.handleOrderRequest(ws as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderRequest add', async () => {
	const ws = {};
	relayerServer.sequenceWsClient = {} as any;
	relayerServer.handleAddOrderRequest = jest.fn();
	relayerServer.handleCancelOrderRequest = jest.fn();
	await relayerServer.handleOrderRequest(ws as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect((relayerServer.handleAddOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleCancelOrderRequest as jest.Mock).not.toBeCalled();
});

test('handleOrderRequest cancel', async () => {
	const ws = {};
	relayerServer.sequenceWsClient = {} as any;
	relayerServer.handleAddOrderRequest = jest.fn();
	relayerServer.handleCancelOrderRequest = jest.fn();
	await relayerServer.handleOrderRequest(ws as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_CANCEL,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.handleAddOrderRequest as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleCancelOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleRelayerMessage invalid requests', () => {
	const ws = {
		send: jest.fn()
	};
	relayerServer.handleRelayerMessage(ws as any, JSON.stringify({}));
	relayerServer.handleRelayerMessage(
		ws as any,
		JSON.stringify({
			channel: 'channel',
			method: 'method',
			pair: CST.SUPPORTED_PAIRS[0]
		})
	);
	relayerServer.handleRelayerMessage(
		ws as any,
		JSON.stringify({
			channel: CST.DB_ORDERS,
			method: '',
			pair: CST.SUPPORTED_PAIRS[0]
		})
	);
	relayerServer.handleRelayerMessage(
		ws as any,
		JSON.stringify({
			channel: CST.DB_ORDERS,
			method: 'method',
			pair: 'test'
		})
	);
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleRelayerMessage orders', () => {
	const ws = {};
	relayerServer.handleOrderRequest = jest.fn();
	relayerServer.handleRelayerMessage(
		ws as any,
		JSON.stringify({
			channel: CST.DB_ORDERS,
			method: 'method',
			pair: CST.SUPPORTED_PAIRS[0]
		})
	);
	expect((relayerServer.handleOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});
