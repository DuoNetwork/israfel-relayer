import WebSocket from 'isomorphic-ws';
import * as CST from '../common/constants';
import { IWsOrderBookResponse, IWsOrderBookUpdateResponse } from '../common/types';
import orderUtil from '../utils/orderUtil';
import RelayerClient from './RelayerClient';

jest.mock('isomorphic-ws', () => jest.fn().mockImplementation(() => ({})));

const web3Util: any = {};
const relayerClient = new RelayerClient(web3Util as any, CST.DB_DEV);

test('subscribeOrderBook no ws', () => {
	relayerClient.ws = null;
	relayerClient.pendingOrderBookUpdates = {};
	expect(relayerClient.subscribeOrderBook('pair')).toBeFalsy();
	expect(relayerClient.orderBookSnapshotAvailable['pair']).toBeFalsy();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toBeFalsy();
});

test('subscribeOrderBook new pair', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	relayerClient.pendingOrderBookUpdates = {};
	expect(relayerClient.subscribeOrderBook('pair')).toBeTruthy();
	expect(send.mock.calls).toMatchSnapshot();
	expect(relayerClient.orderBookSnapshotAvailable['pair']).toBeFalsy();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toEqual([]);
});

test('subscribeOrderBook existing pair', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	relayerClient.pendingOrderBookUpdates['pair'] = ['pending'] as any;
	expect(relayerClient.subscribeOrderBook('pair')).toBeTruthy();
	expect(send.mock.calls).toMatchSnapshot();
	expect(relayerClient.orderBookSnapshotAvailable['pair']).toBeFalsy();
	expect(relayerClient.pendingOrderBookUpdates['pair'].length).toBe(1);
});

test('unsubscribeOrderBook no ws', () => {
	relayerClient.ws = null;
	relayerClient.orderBookSnapshots['pair'] = 'snapshot' as any;
	relayerClient.orderBookSnapshotAvailable['pair'] = true;
	relayerClient.pendingOrderBookUpdates['pair'] = ['pending'] as any;
	expect(relayerClient.unsubscribeOrderBook('pair')).toBeFalsy();
	expect(relayerClient.orderBookSnapshotAvailable['pair']).toBeTruthy();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toEqual(['pending']);
	expect(relayerClient.orderBookSnapshots['pair']).toBe('snapshot');
});

test('unsubscribeOrderBook', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	relayerClient.orderBookSnapshots['pair'] = 'snapshot' as any;
	relayerClient.orderBookSnapshotAvailable['pair'] = true;
	relayerClient.pendingOrderBookUpdates['pair'] = ['pending'] as any;
	expect(relayerClient.unsubscribeOrderBook('pair')).toBeTruthy();
	expect(send.mock.calls).toMatchSnapshot();
	expect(relayerClient.orderBookSnapshotAvailable['pair']).toBeFalsy();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toEqual([]);
	expect(relayerClient.orderBookSnapshots['pair']).toBeFalsy();
});

test('handleOrderResponse ok', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	const handleHistory = jest.fn();
	relayerClient.onOrder(handleHistory, handleUpdate, handleError);
	relayerClient.handleOrderResponse({
		channel: 'channel',
		method: 'method',
		status: CST.WS_OK,
		orderHash: '0xOrderHash',
		pair: 'pair',
		userOrder: 'userOrder'
	} as any);
	expect(handleUpdate.mock.calls).toMatchSnapshot();
	expect(handleHistory).not.toBeCalled();
	expect(handleError).not.toBeCalled();
});

test('handleOrderResponse history', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	const handleHistory = jest.fn();
	relayerClient.onOrder(handleHistory, handleUpdate, handleError);
	relayerClient.handleOrderResponse({
		channel: 'channel',
		method: CST.WS_HISTORY,
		status: CST.WS_OK,
		pair: 'pair',
		orderHistory: 'orderHistory'
	} as any);
	expect(handleUpdate).not.toBeCalled();
	expect(handleHistory.mock.calls).toMatchSnapshot();
	expect(handleError).not.toBeCalled();
});

test('handleOrderResponse not ok', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	const handleHistory = jest.fn();
	relayerClient.onOrder(handleHistory, handleUpdate, handleError);
	relayerClient.handleOrderResponse({
		channel: 'channel',
		method: 'method',
		status: 'status',
		orderHash: '0xOrderHash',
		pair: 'pair'
	} as any);
	expect(handleUpdate).not.toBeCalled();
	expect(handleHistory).not.toBeCalled();
	expect(handleError.mock.calls).toMatchSnapshot();
});

test('handleTradeResponse ok', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	relayerClient.onTrade(handleUpdate, handleError);
	relayerClient.handleTradeResponse({
		channel: 'channel',
		method: CST.DB_TRADES,
		status: CST.WS_OK,
		pair: 'pair',
		orderHistory: 'orderHistory',
		trades: [
			{
				pair: 'test',
				transactionHash: 'test',
				taker: {
					orderHash: 'test',
					address: 'test',
					side: 'test',
					price: 123,
					amount: 123,
					fee: 123
				},
				maker: {
					orderHash: 'test',
					price: 123,
					amount: 123,
					fee: 123
				},
				feeAsset: 'test',
				timestamp: 123
			}
		]
	} as any);
	expect(handleUpdate.mock.calls).toMatchSnapshot();
	expect(handleError).not.toBeCalled();
});

test('handleTradeResponse not ok', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	relayerClient.onTrade(handleUpdate, handleError);
	relayerClient.handleTradeResponse({
		channel: 'channel',
		method: 'method',
		status: 'status',
		orderHash: '0xOrderHash',
		pair: 'pair'
	} as any);
	expect(handleUpdate).not.toBeCalled();
	expect(handleError.mock.calls).toMatchSnapshot();
});

test('handleOrderBookResponse update before snapshot', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleUpdate, handleError);
	relayerClient.subscribeOrderBook = jest.fn();
	relayerClient.pendingOrderBookUpdates['pair'] = [];
	const res: IWsOrderBookUpdateResponse = {
		channel: 'channel',
		status: CST.WS_OK,
		method: CST.DB_UPDATE,
		pair: 'pair',
		orderBookUpdate: {
			pair: 'pair',
			updates: [],
			prevVersion: 122,
			version: 123
		}
	};
	relayerClient.handleOrderBookResponse(res);
	expect(handleUpdate).not.toBeCalled();
	expect(handleError).not.toBeCalled();
	expect(relayerClient.subscribeOrderBook as jest.Mock).not.toBeCalled();
	expect(relayerClient.pendingOrderBookUpdates).toMatchSnapshot();
});

test('handleOrderBookResponse snapshot newer than pending updates', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleUpdate, handleError);
	relayerClient.subscribeOrderBook = jest.fn();
	relayerClient.pendingOrderBookUpdates['pair'] = [
		{
			pair: 'pair',
			updates: [],
			prevVersion: 122,
			version: 123
		}
	];
	const res: IWsOrderBookResponse = {
		channel: 'channel',
		status: CST.WS_OK,
		method: CST.DB_SNAPSHOT,
		pair: 'pair',
		orderBookSnapshot: {
			pair: 'pair',
			version: 124,
			bids: [],
			asks: []
		}
	};
	relayerClient.handleOrderBookResponse(res);
	expect(handleUpdate.mock.calls).toMatchSnapshot();
	expect(handleError).not.toBeCalled();
	expect(relayerClient.subscribeOrderBook as jest.Mock).not.toBeCalled();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toEqual([]);
	expect(relayerClient.orderBookSnapshotAvailable['pair']).toBeTruthy();
});

test('handleOrderBookResponse snapshot older than pending updates', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleUpdate, handleError);
	relayerClient.subscribeOrderBook = jest.fn();
	relayerClient.pendingOrderBookUpdates['pair'] = [
		{
			pair: 'pair',
			updates: [],
			prevVersion: 122,
			version: 123
		}
	];
	const res: IWsOrderBookResponse = {
		channel: 'channel',
		status: CST.WS_OK,
		method: CST.DB_SNAPSHOT,
		pair: 'pair',
		orderBookSnapshot: {
			pair: 'pair',
			version: 122,
			bids: [],
			asks: []
		}
	};
	relayerClient.handleOrderBookResponse(res);
	expect(handleUpdate.mock.calls).toMatchSnapshot();
	expect(handleError).not.toBeCalled();
	expect(relayerClient.subscribeOrderBook as jest.Mock).not.toBeCalled();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toEqual([]);
	expect(relayerClient.orderBookSnapshotAvailable['pair']).toBeTruthy();
});

test('handleOrderBookResponse snapshot no pending updates', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleUpdate, handleError);
	relayerClient.subscribeOrderBook = jest.fn();
	relayerClient.pendingOrderBookUpdates['pair'] = [];
	const res: IWsOrderBookResponse = {
		channel: 'channel',
		status: CST.WS_OK,
		method: CST.DB_SNAPSHOT,
		pair: 'pair',
		orderBookSnapshot: {
			pair: 'pair',
			version: 122,
			bids: [],
			asks: []
		}
	};
	relayerClient.handleOrderBookResponse(res);
	expect(handleUpdate.mock.calls).toMatchSnapshot();
	expect(handleError).not.toBeCalled();
	expect(relayerClient.subscribeOrderBook as jest.Mock).not.toBeCalled();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toEqual([]);
	expect(relayerClient.orderBookSnapshotAvailable['pair']).toBeTruthy();
});

test('handleOrderBookResponse snapshot older than pending updates but has gap', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleUpdate, handleError);
	relayerClient.orderBookSnapshotAvailable['pair'] = false;
	relayerClient.subscribeOrderBook = jest.fn();
	relayerClient.pendingOrderBookUpdates['pair'] = [
		{
			pair: 'pair',
			updates: [],
			prevVersion: 122,
			version: 123
		},
		{
			pair: 'pair',
			updates: [],
			prevVersion: 124,
			version: 125
		}
	];
	const res: IWsOrderBookResponse = {
		channel: 'channel',
		status: CST.WS_OK,
		method: CST.DB_SNAPSHOT,
		pair: 'pair',
		orderBookSnapshot: {
			pair: 'pair',
			version: 122,
			bids: [],
			asks: []
		}
	};
	relayerClient.handleOrderBookResponse(res);
	expect(handleUpdate.mock.calls).toMatchSnapshot();
	expect(handleError).not.toBeCalled();
	expect(relayerClient.subscribeOrderBook as jest.Mock).toBeCalled();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toMatchSnapshot();
	expect(relayerClient.orderBookSnapshotAvailable['pair']).toBeFalsy();
});

test('handleOrderBookResponse update after snapshot', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleUpdate, handleError);
	relayerClient.orderBookSnapshotAvailable['pair'] = true;
	relayerClient.subscribeOrderBook = jest.fn();
	relayerClient.pendingOrderBookUpdates['pair'] = [];
	relayerClient.orderBookSnapshots['pair'] = {
		pair: 'pair',
		version: 122,
		bids: [],
		asks: []
	};
	const res: IWsOrderBookUpdateResponse = {
		channel: 'channel',
		status: CST.WS_OK,
		method: CST.DB_UPDATE,
		pair: 'pair',
		orderBookUpdate: {
			pair: 'pair',
			updates: [],
			prevVersion: 122,
			version: 123
		}
	};
	relayerClient.handleOrderBookResponse(res);
	expect(handleUpdate.mock.calls).toMatchSnapshot();
	expect(handleError).not.toBeCalled();
	expect(relayerClient.subscribeOrderBook as jest.Mock).not.toBeCalled();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toEqual([]);
});

test('handleOrderBookResponse update after snapshot has gap', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleUpdate, handleError);
	relayerClient.orderBookSnapshotAvailable['pair'] = true;
	relayerClient.subscribeOrderBook = jest.fn();
	relayerClient.pendingOrderBookUpdates['pair'] = [];
	relayerClient.orderBookSnapshots['pair'] = {
		pair: 'pair',
		version: 122,
		bids: [],
		asks: []
	};
	const res: IWsOrderBookUpdateResponse = {
		channel: 'channel',
		status: CST.WS_OK,
		method: CST.DB_UPDATE,
		pair: 'pair',
		orderBookUpdate: {
			pair: 'pair',
			updates: [],
			prevVersion: 123,
			version: 124
		}
	};
	relayerClient.handleOrderBookResponse(res);
	expect(handleUpdate).not.toBeCalled();
	expect(handleError).not.toBeCalled();
	expect(relayerClient.subscribeOrderBook as jest.Mock).toBeCalled();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toMatchSnapshot();
});

test('handleOrderBookResponse update after obsolete', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleUpdate, handleError);
	relayerClient.orderBookSnapshotAvailable['pair'] = true;
	relayerClient.subscribeOrderBook = jest.fn();
	relayerClient.pendingOrderBookUpdates['pair'] = [];
	relayerClient.orderBookSnapshots['pair'] = {
		pair: 'pair',
		version: 122,
		bids: [],
		asks: []
	};
	const res: IWsOrderBookUpdateResponse = {
		channel: 'channel',
		status: CST.WS_OK,
		method: CST.DB_UPDATE,
		pair: 'pair',
		orderBookUpdate: {
			pair: 'pair',
			updates: [],
			prevVersion: 121,
			version: 122
		}
	};
	relayerClient.handleOrderBookResponse(res);
	expect(handleUpdate).not.toBeCalled();
	expect(handleError).not.toBeCalled();
	expect(relayerClient.subscribeOrderBook as jest.Mock).not.toBeCalled();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toEqual([]);
});

test('handleOrderBookResponse not ok', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleUpdate, handleError);
	relayerClient.handleOrderBookResponse({
		channel: 'channel',
		status: 'status',
		method: 'any',
		pair: 'pair',
		orderBookUpdate: 'orderBookUpdate'
	} as any);
	expect(handleUpdate).not.toBeCalled();
	expect(handleError.mock.calls).toMatchSnapshot();
});

test('handleOrderBookResponse invalid method', () => {
	const handleUpdate = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleUpdate, handleError);
	relayerClient.handleOrderBookResponse({
		channel: 'channel',
		status: CST.WS_OK,
		method: 'any',
		pair: 'pair',
		orderBookUpdate: 'orderBookUpdate'
	} as any);
	expect(handleUpdate).not.toBeCalled();
	expect(handleError).not.toBeCalled();
});

test('handleMessage unsub', () => {
	relayerClient.handleOrderResponse = jest.fn();
	relayerClient.handleOrderBookResponse = jest.fn();
	const handleInfo = jest.fn();
	relayerClient.onInfoUpdate(handleInfo);
	relayerClient.handleMessage(
		JSON.stringify({
			method: CST.WS_UNSUB
		})
	);
	expect(relayerClient.handleOrderResponse as jest.Mock).not.toBeCalled();
	expect(relayerClient.handleOrderBookResponse as jest.Mock).not.toBeCalled();
	expect(handleInfo).not.toBeCalled();
});

test('handleMessage invalid channel', () => {
	relayerClient.handleOrderResponse = jest.fn();
	relayerClient.handleOrderBookResponse = jest.fn();
	const handleInfo = jest.fn();
	relayerClient.onInfoUpdate(handleInfo);
	relayerClient.handleMessage(
		JSON.stringify({
			channel: 'channel'
		})
	);
	expect(relayerClient.handleOrderResponse as jest.Mock).not.toBeCalled();
	expect(relayerClient.handleOrderBookResponse as jest.Mock).not.toBeCalled();
	expect(handleInfo).not.toBeCalled();
});

test('handleMessage orders', () => {
	relayerClient.handleOrderResponse = jest.fn();
	relayerClient.handleOrderBookResponse = jest.fn();
	const handleInfo = jest.fn();
	relayerClient.onInfoUpdate(handleInfo);
	relayerClient.handleMessage(
		JSON.stringify({
			channel: CST.DB_ORDERS
		})
	);
	expect((relayerClient.handleOrderResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerClient.handleOrderBookResponse as jest.Mock).not.toBeCalled();
	expect(handleInfo).not.toBeCalled();
});

test('handleMessage trades', () => {
	relayerClient.handleTradeResponse = jest.fn();
	relayerClient.handleOrderResponse = jest.fn();
	relayerClient.handleOrderBookResponse = jest.fn();
	const handleInfo = jest.fn();
	relayerClient.onInfoUpdate(handleInfo);
	relayerClient.handleMessage(
		JSON.stringify({
			channel: CST.DB_TRADES
		})
	);
	expect((relayerClient.handleTradeResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerClient.handleOrderResponse as jest.Mock).not.toBeCalled();
	expect(relayerClient.handleOrderBookResponse as jest.Mock).not.toBeCalled();
	expect(handleInfo).not.toBeCalled();
});

test('handleMessage orderBooks', () => {
	relayerClient.handleTradeResponse = jest.fn();
	relayerClient.handleOrderResponse = jest.fn();
	relayerClient.handleOrderBookResponse = jest.fn();
	const handleInfo = jest.fn();
	relayerClient.onInfoUpdate(handleInfo);
	relayerClient.handleMessage(
		JSON.stringify({
			channel: CST.DB_ORDER_BOOKS
		})
	);
	expect(relayerClient.handleTradeResponse as jest.Mock).not.toBeCalled();
	expect(relayerClient.handleOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerClient.handleOrderBookResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(handleInfo).not.toBeCalled();
});

test('handleMessage info', () => {
	web3Util.setTokens = jest.fn();
	relayerClient.handleTradeResponse = jest.fn();
	relayerClient.handleOrderResponse = jest.fn();
	relayerClient.handleOrderBookResponse = jest.fn();
	const handleInfo = jest.fn();
	relayerClient.onInfoUpdate(handleInfo);
	relayerClient.handleMessage(
		JSON.stringify({
			channel: CST.WS_INFO,
			tokens: 'tokens',
			processStatus: 'status',
			acceptedPrices: 'acceptedPrices',
			exchangePrices: 'exchangePrices'
		})
	);
	expect(relayerClient.handleTradeResponse as jest.Mock).not.toBeCalled();
	expect(relayerClient.handleOrderResponse as jest.Mock).not.toBeCalled();
	expect(relayerClient.handleOrderBookResponse as jest.Mock).not.toBeCalled();
	expect((web3Util.setTokens as jest.Mock).mock.calls).toMatchSnapshot();
	expect(handleInfo.mock.calls).toMatchSnapshot();
});

test('subscribeOrderHistory no ws', () => {
	relayerClient.ws = null;
	expect(relayerClient.subscribeOrderHistory('account')).toBeFalsy();
});

test('subscribeOrderHistory invalid address', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	expect(relayerClient.subscribeOrderHistory('account')).toBeFalsy();
	expect(send).not.toBeCalled();
});

test('subscribeOrderHistory', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	expect(
		relayerClient.subscribeOrderHistory('0x48bacb9266a570d521063ef5dd96e61686dbe788')
	).toBeTruthy();
	expect(send.mock.calls).toMatchSnapshot();
});

test('unsubscribeOrderHistory no ws', () => {
	relayerClient.ws = null;
	expect(relayerClient.unsubscribeOrderHistory('account')).toBeFalsy();
});

test('unsubscribeOrderHistory', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	expect(relayerClient.unsubscribeOrderHistory('account')).toBeTruthy();
	expect(send.mock.calls).toMatchSnapshot();
});

test('subscribeTrade no ws', () => {
	relayerClient.ws = null;
	expect(relayerClient.subscribeTrade('WETH|ETH')).toBeFalsy();
});

test('subscribeTrade', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	expect(relayerClient.subscribeTrade('WETH|ETH')).toBeTruthy();
	expect(send.mock.calls).toMatchSnapshot();
});

test('unsubscribeTrade no ws', () => {
	relayerClient.ws = null;
	expect(relayerClient.unsubscribeTrade('')).toBeFalsy();
});

test('unsubscribeTrade', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	expect(relayerClient.unsubscribeTrade('')).toBeTruthy();
	expect(send.mock.calls).toMatchSnapshot();
});

test('addOrder no ws', async () => {
	relayerClient.ws = null;
	web3Util.isValidPair = jest.fn(() => false);
	expect(await relayerClient.addOrder('account', 'code1|code2', 123, 456, true, 1234567890)).toBe(
		''
	);
	expect(web3Util.isValidPair as jest.Mock).not.toBeCalled();
});

test('addOrder invalid pair', async () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	web3Util.isValidPair = jest.fn(() => false);
	try {
		await relayerClient.addOrder('account', 'code1|code2', 123, 456, true, 1234567890);
		expect(true).toBeFalsy();
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('addOrder missing token', async () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	web3Util.isValidPair = jest.fn(() => true);
	web3Util.getTokenByCode = jest.fn();
	try {
		await relayerClient.addOrder('account', 'code1|code2', 123, 456, true, 1234567890);
		expect(true).toBeFalsy();
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('addOrder invalid amount', async () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	web3Util.getTokenAddressFromCode = jest.fn((code: string) => code + 'address');
	orderUtil.getAmountAfterFee = jest.fn(() => ({
		takerAssetAmount: 0,
		makerAssetAmount: 0
	}));
	web3Util.isValidPair = jest.fn(() => true);
	web3Util.getTokenByCode = jest.fn(() => ({
		address: 'code1address',
		code: 'code1',
		precisions: {
			code2: 1
		},
		feeSchedules: {
			code2: {}
		}
	}));
	try {
		await relayerClient.addOrder('account', 'code1|code2', 123, 456, true, 1234567890);
		expect(true).toBeFalsy();
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('addOrder bid', async () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	web3Util.getTokenAddressFromCode = jest.fn((code: string) => code + 'address');
	orderUtil.getAmountAfterFee = jest.fn(() => ({
		takerAssetAmount: 123,
		makerAssetAmount: 456
	}));
	web3Util.isValidPair = jest.fn(() => true);
	web3Util.getTokenByCode = jest.fn(() => ({
		address: 'code1address',
		code: 'code1',
		precisions: {
			code2: 1
		},
		feeSchedules: {
			code2: {}
		}
	}));
	web3Util.createRawOrder = jest.fn(() => ({
		orderHash: 'orderHash',
		signedOrder: 'signedOrder'
	}));
	expect(await relayerClient.addOrder('account', 'code1|code2', 123, 456, true, 1234567890)).toBe(
		'orderHash'
	);
	expect(send.mock.calls).toMatchSnapshot();
	expect((orderUtil.getAmountAfterFee as jest.Mock).mock.calls).toMatchSnapshot();
	expect((web3Util.createRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('addOrder ask', async () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	web3Util.getTokenAddressFromCode = jest.fn((code: string) => code + 'address');
	orderUtil.getAmountAfterFee = jest.fn(() => ({
		takerAssetAmount: 123,
		makerAssetAmount: 456
	}));
	web3Util.isValidPair = jest.fn(() => true);
	web3Util.getTokenByCode = jest.fn(() => ({
		address: 'code1address',
		code: 'code1',
		precisions: {
			code2: 1
		},
		feeSchedules: {
			code2: {}
		}
	}));
	web3Util.createRawOrder = jest.fn(() => ({
		orderHash: 'orderHash',
		signedOrder: 'signedOrder'
	}));
	expect(
		await relayerClient.addOrder('account', 'code1|code2', 123, 456, false, 1234567890)
	).toBe('orderHash');
	expect(send.mock.calls).toMatchSnapshot();
	expect((orderUtil.getAmountAfterFee as jest.Mock).mock.calls).toMatchSnapshot();
	expect((web3Util.createRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('deleteOrder no ws', () => {
	relayerClient.ws = null;
	expect(relayerClient.deleteOrder('pair', ['orderHash'], 'signature')).toBeFalsy();
});

test('deleteOrder', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	expect(relayerClient.deleteOrder('pair', ['orderHash'], 'signature')).toBeTruthy();
	expect(send.mock.calls).toMatchSnapshot();
});

test('connectToRelayer', () => {
	const handleConnected = jest.fn();
	const handleReconnect = jest.fn();
	const reconnectOriginal = relayerClient.reconnect;
	const reconnectMock = jest.fn();
	relayerClient.onConnection(handleConnected, handleReconnect);
	relayerClient.handleMessage = jest.fn();
	relayerClient.reconnect = reconnectMock;
	relayerClient.connectToRelayer();
	expect((WebSocket as any).mock.calls).toMatchSnapshot();
	expect(relayerClient.ws).toBeTruthy();
	expect((relayerClient.ws as any).onopen).toBeTruthy();
	(relayerClient.ws as any).onopen();
	expect(relayerClient.reconnectionNumber).toBe(0);
	expect(handleConnected).toBeCalledTimes(1);
	expect((relayerClient.ws as any).onmessage).toBeTruthy();
	(relayerClient.ws as any).onmessage({ data: 'message data' });
	expect((relayerClient.handleMessage as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerClient.ws as any).onerror).toBeTruthy();
	(relayerClient.ws as any).onerror('error');
	expect((relayerClient.ws as any).onclose).toBeTruthy();
	(relayerClient.ws as any).onclose();
	expect(reconnectMock).toBeCalledTimes(2);
	relayerClient.reconnect = reconnectOriginal;
});

test('reconnect, less than 5 times', () => {
	const handleConnected = jest.fn();
	const handleReconnect = jest.fn();
	relayerClient.onConnection(handleConnected, handleReconnect);
	const ws = {
		close: jest.fn()
	};
	relayerClient.ws = ws as any;
	relayerClient.reconnectionNumber = 3;
	global.setTimeout = jest.fn();
	relayerClient.connectToRelayer = jest.fn();
	relayerClient.reconnect();
	expect(handleReconnect).toBeCalledTimes(1);
	expect(ws.close).toBeCalledTimes(1);
	expect(relayerClient.ws).toBeNull();
	expect(relayerClient.reconnectionNumber).toBe(4);
	expect((global.setTimeout as jest.Mock).mock.calls).toMatchSnapshot();
	(global.setTimeout as jest.Mock).mock.calls[0][0]();
	expect(relayerClient.connectToRelayer as jest.Mock).toBeCalled();
});

test('reconnect, no ws', () => {
	const handleConnected = jest.fn();
	const handleReconnect = jest.fn();
	relayerClient.onConnection(handleConnected, handleReconnect);
	relayerClient.ws = null;
	global.setTimeout = jest.fn();
	relayerClient.reconnect();
	expect(handleReconnect).toBeCalledTimes(1);
	expect(relayerClient.ws).toBeNull();
	expect(relayerClient.reconnectionNumber).toBe(5);
	expect((global.setTimeout as jest.Mock).mock.calls).toMatchSnapshot();
});

test('reconnect, more than 5 times', () => {
	const handleConnected = jest.fn();
	const handleReconnect = jest.fn();
	relayerClient.onConnection(handleConnected, handleReconnect);
	relayerClient.ws = null;
	global.setTimeout = jest.fn();
	relayerClient.reconnect();
	expect(handleReconnect).toBeCalledTimes(1);
	expect(relayerClient.ws).toBeNull();
	expect(relayerClient.reconnectionNumber).toBe(5);
	expect(global.setTimeout as jest.Mock).not.toBeCalled();
});
