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
	await relayerServer.handleUserOrder(
		ws as any,
		{ test: 'liveOrder' } as any,
		'type'
	);
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleSequenceMessage invalid response', async () => {
	expect(
		await relayerServer.handleSequenceMessage(
			JSON.stringify({
				channel: 'channel',
				status: CST.WS_OK
			})
		)
	).toBeFalsy();
	expect(
		await relayerServer.handleSequenceMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: 'status'
			})
		)
	).toBeFalsy();
	expect(
		await relayerServer.handleSequenceMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: 'status'
			})
		)
	).toBeFalsy();
	expect(
		await relayerServer.handleSequenceMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK
			})
		)
	).toBeFalsy();
	expect(
		await relayerServer.handleSequenceMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 0
			})
		)
	).toBeFalsy();
	expect(
		await relayerServer.handleSequenceMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 1
			})
		)
	).toBeFalsy();
	relayerServer.requestCache = {
		'method|pair|orderHash': {
			liveOrder: {
				orderHash: 'orderHash'
			}
		}
	} as any;
	expect(
		await relayerServer.handleSequenceMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 1,
				method: 'method',
				pair: 'pair',
				orderHash: 'orderHash'
			})
		)
	).toBeFalsy();
});

test('handleSequenceMessage add', async () => {
	relayerServer.requestCache = {
		'add|pair|orderHash': {
			liveOrder: {
				orderHash: 'orderHash'
			}
		}
	} as any;
	orderUtil.addOrderToPersistence = jest.fn(() => Promise.resolve({userOrder: 'test'}));
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	expect(
		await relayerServer.handleSequenceMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 1,
				method: CST.DB_ADD,
				pair: 'pair',
				orderHash: 'orderHash'
			})
		)
	).toBeTruthy();
	expect(relayerServer.requestCache).toEqual({});
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleSequenceMessage add failed', async () => {
	relayerServer.requestCache = {
		'add|pair|orderHash': {
			liveOrder: {
				orderHash: 'orderHash'
			}
		}
	} as any;
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	orderUtil.addOrderToPersistence = jest.fn(() => Promise.resolve(null));
	expect(
		await relayerServer.handleSequenceMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 1,
				method: CST.DB_ADD,
				pair: 'pair',
				orderHash: 'orderHash'
			})
		)
	).toBeFalsy();
	expect(relayerServer.requestCache).toMatchSnapshot();
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls.length).toBe(0);
});

test('handleSequenceMessage cancel', async () => {
	relayerServer.requestCache = {
		'cancel|pair|orderHash': {
			liveOrder: {
				orderHash: 'orderHash'
			}
		}
	} as any;
	orderUtil.cancelOrderInPersistence = jest.fn(() => Promise.resolve({userOrder: 'test'}));
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	expect(
		await relayerServer.handleSequenceMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 2,
				method: CST.DB_CANCEL,
				pair: 'pair',
				orderHash: 'orderHash'
			})
		)
	).toBeTruthy();
	expect(relayerServer.requestCache).toEqual({});
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleSequenceMessage cancel failed', async () => {
	relayerServer.requestCache = {
		'cancel|pair|orderHash': {
			liveOrder: {
				orderHash: 'orderHash'
			}
		}
	} as any;
	orderUtil.cancelOrderInPersistence = jest.fn(() => Promise.resolve(null));
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	expect(
		await relayerServer.handleSequenceMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 2,
				method: CST.DB_CANCEL,
				pair: 'pair',
				orderHash: 'orderHash'
			})
		)
	).toBeFalsy();
	expect(relayerServer.requestCache).toMatchSnapshot();
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls.length).toBe(0);
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
	expect((relayerServer.requestSequence as jest.Mock).mock.calls.length).toBe(0);
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls.length).toBe(0);
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
	expect((relayerServer.requestSequence as jest.Mock).mock.calls.length).toBe(0);
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls.length).toBe(0);
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
	expect((relayerServer.requestSequence as jest.Mock).mock.calls.length).toBe(0);
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls.length).toBe(0);
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
	expect((relayerServer.handleInvalidOrderRequest as jest.Mock).mock.calls.length).toBe(0);
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
	expect((relayerServer.requestSequence as jest.Mock).mock.calls.length).toBe(0);
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls.length).toBe(0);
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
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect((relayerServer.requestSequence as jest.Mock).mock.calls.length).toBe(0);
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls.length).toBe(0);
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
		method: CST.DB_ADD,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect((relayerServer.requestSequence as jest.Mock).mock.calls.length).toBe(0);
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls.length).toBe(0);
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
	expect((relayerServer.handleInvalidOrderRequest as jest.Mock).mock.calls.length).toBe(0);
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
	expect((relayerServer.handleCancelOrderRequest as jest.Mock).mock.calls.length).toBe(0);
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
	expect((relayerServer.handleAddOrderRequest as jest.Mock).mock.calls.length).toBe(0);
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
