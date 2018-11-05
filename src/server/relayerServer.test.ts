import * as CST from '../common/constants';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
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
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve({ userOrder: 'test' }));
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
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleSequenceResponse(
		{
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			sequence: 1,
			method: CST.DB_ADD,
			pair: 'pair',
			orderHash: 'orderHash'
		},
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

test('handleSequenceResponse terminate', async () => {
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve({ userOrder: 'test' }));
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.handleInvalidOrderRequest = jest.fn();
	await relayerServer.handleSequenceResponse(
		{
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			sequence: 2,
			method: CST.DB_TERMINATE,
			pair: 'pair',
			orderHash: 'orderHash'
		},
		{
			liveOrder: {
				orderHash: 'orderHash'
			}
		} as any
	);
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleInvalidOrderRequest as jest.Mock).not.toBeCalled();
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
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
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
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve({}));
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
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve({
		userOrder: 'userOrder'
	}))
	orderPersistenceUtil.constructNewLiveOrder = jest.fn(() => ({ test: 'liveOrder' }));
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
	expect((orderPersistenceUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleInvalidOrderRequest as jest.Mock).not.toBeCalled();
});

test('handleTerminateOrderRequest invalid order', async () => {
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
	relayerServer.requestSequence = jest.fn();
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.requestSequence as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleUserOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleInvalidOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest exist in request cache', async () => {
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.requestCache = {
		[`${CST.DB_TERMINATE}|${CST.SUPPORTED_PAIRS[0]}|0xOrderHash`]: {}
	} as any;
	relayerServer.requestSequence = jest.fn();
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.requestSequence as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleUserOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleInvalidOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest already terminated', async () => {
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	relayerServer.requestCache = {};
	relayerServer.requestSequence = jest.fn();
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve(null));
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.requestSequence as jest.Mock).not.toBeCalled();
	expect(relayerServer.handleUserOrder as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleInvalidOrderRequest as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleTerminateOrderRequest', async () => {
	relayerServer.handleInvalidOrderRequest = jest.fn();
	relayerServer.handleUserOrder = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.getLiveOrderInPersistence = jest.fn(() => Promise.resolve({ test: 'liveOrder' }));
	relayerServer.requestSequence = jest.fn();
	relayerServer.requestCache = {};
	orderPersistenceUtil.addUserOrderToDB = jest.fn(() => Promise.resolve({
		userOrder: 'userOrder'
	}))
	await relayerServer.handleTerminateOrderRequest({} as any, {
		channel: CST.DB_ORDERS,
		method: CST.DB_TERMINATE,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	expect(relayerServer.requestCache).toMatchSnapshot();
	expect((relayerServer.requestSequence as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerServer.handleInvalidOrderRequest as jest.Mock).not.toBeCalled();
	expect((relayerServer.handleUserOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderPersistenceUtil.addUserOrderToDB as jest.Mock).mock.calls).toMatchSnapshot();
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
	relayerServer.sequenceWsClient = {} as any;
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
