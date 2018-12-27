import * as CST from '../common/constants';
import { IWsOrderBookResponse, IWsOrderBookUpdateResponse } from '../common/types';
import orderBookUtil from '../utils/orderBookUtil';
import orderUtil from '../utils/orderUtil';
// import Web3Util from '../utils/Web3Util';
import RelayerClient from './RelayerClient';

const web3Util: any = {};
const relayerClient = new RelayerClient(web3Util as any, CST.DB_DEV);

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

test('handleOrderBookResponse update before snapshot', () => {
	const handleSnapshot = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleSnapshot, handleError);
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
	expect(handleSnapshot).not.toBeCalled();
	expect(handleError).not.toBeCalled();
	expect(relayerClient.pendingOrderBookUpdates).toMatchSnapshot();
});

test('handleOrderBookResponse snapshot newer than pending updates', () => {
	const handleSnapshot = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleSnapshot, handleError);
	orderBookUtil.updateOrderBookSnapshot = jest.fn();
	const res: IWsOrderBookResponse = {
		channel: 'channel',
		status: CST.WS_OK,
		method: CST.DB_SNAPSHOT,
		pair: 'pair',
		orderBookSnapshot: {
			pair: 'pair',
			version: 124,
			bids: [],
			asks: [],
		}
	}
	relayerClient.handleOrderBookResponse(res);
	expect(handleSnapshot).toBeCalled();
	expect(handleError).not.toBeCalled();
	expect(orderBookUtil.updateOrderBookSnapshot as jest.Mock).not.toBeCalled();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toEqual([]);
	expect(relayerClient.orderBookSnapshotAvailable['pair']).toBeTruthy();
});

test('handleOrderBookResponse snapshot older than pending updates', () => {
	const handleSnapshot = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleSnapshot, handleError);
	orderBookUtil.updateOrderBookSnapshot = jest.fn();
	relayerClient.pendingOrderBookUpdates['pair'] = [ {
		pair: 'pair',
		updates: [],
		prevVersion: 122,
		version: 123
	}];
	const res: IWsOrderBookResponse = {
		channel: 'channel',
		status: CST.WS_OK,
		method: CST.DB_SNAPSHOT,
		pair: 'pair',
		orderBookSnapshot: {
			pair: 'pair',
			version: 122,
			bids: [],
			asks: [],
		}
	}
	relayerClient.handleOrderBookResponse(res);
	expect(handleSnapshot).toBeCalled();
	expect(handleError).not.toBeCalled();
	expect((orderBookUtil.updateOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toEqual([]);
	expect(relayerClient.orderBookSnapshotAvailable['pair']).toBeTruthy();
});

test('handleOrderBookResponse update after snapshot', () => {
	const handleSnapshot = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleSnapshot, handleError);
	orderBookUtil.updateOrderBookSnapshot = jest.fn();
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
	expect(handleSnapshot).toBeCalled();
	expect(handleError).not.toBeCalled();
	expect((orderBookUtil.updateOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
	expect(relayerClient.pendingOrderBookUpdates['pair']).toEqual([]);
	expect(relayerClient.orderBookSnapshotAvailable['pair']).toBeTruthy();
});

test('handleOrderBookResponse not ok', () => {
	const handleSnapshot = jest.fn();
	const handleError = jest.fn();
	relayerClient.onOrderBook(handleSnapshot, handleError);
	relayerClient.handleOrderBookResponse({
		channel: 'channel',
		status: 'status',
		method: 'any',
		pair: 'pair',
		orderBookUpdate: 'orderBookUpdate'
	} as any);
	expect(handleSnapshot).not.toBeCalled();
	expect(handleError.mock.calls).toMatchSnapshot();
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

test('handleMessage orderBooks', () => {
	relayerClient.handleOrderResponse = jest.fn();
	relayerClient.handleOrderBookResponse = jest.fn();
	const handleInfo = jest.fn();
	relayerClient.onInfoUpdate(handleInfo);
	relayerClient.handleMessage(
		JSON.stringify({
			channel: CST.DB_ORDER_BOOKS
		})
	);
	expect(relayerClient.handleOrderResponse as jest.Mock).not.toBeCalled();
	expect((relayerClient.handleOrderBookResponse as jest.Mock).mock.calls).toMatchSnapshot();
	expect(handleInfo).not.toBeCalled();
});

test('handleMessage info', () => {
	web3Util.setTokens = jest.fn();
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
	expect(relayerClient.handleOrderResponse as jest.Mock).not.toBeCalled();
	expect(relayerClient.handleOrderBookResponse as jest.Mock).not.toBeCalled();
	expect((web3Util.setTokens as jest.Mock).mock.calls).toMatchSnapshot();
	expect(handleInfo.mock.calls).toMatchSnapshot();
});

test('subscribeOrderBook', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	relayerClient.subscribeOrderBook('pair');
	expect(send.mock.calls).toMatchSnapshot();
});

test('unsubscribeOrderBook', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	relayerClient.unsubscribeOrderBook('pair');
	expect(send.mock.calls).toMatchSnapshot();
});

test('subscribeOrderHistory invalid address', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	relayerClient.subscribeOrderHistory('account');
	expect(send).not.toBeCalled();
});

test('subscribeOrderHistory', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	relayerClient.subscribeOrderHistory('0x48bacb9266a570d521063ef5dd96e61686dbe788');
	expect(send.mock.calls).toMatchSnapshot();
});

test('unsubscribeOrderHistory', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	relayerClient.unsubscribeOrderHistory('account');
	expect(send.mock.calls).toMatchSnapshot();
});

test('addOrder bid', async done => {
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
	await relayerClient.addOrder('account', 'code1|code2', 123, 456, true, 1234567890);
	expect(send.mock.calls).toMatchSnapshot();
	expect((orderUtil.getAmountAfterFee as jest.Mock).mock.calls).toMatchSnapshot();
	expect((web3Util.createRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
	done();
});

test('addOrder ask', async done => {
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
	await relayerClient.addOrder('account', 'code1|code2', 123, 456, false, 1234567890);
	expect(send.mock.calls).toMatchSnapshot();
	expect((orderUtil.getAmountAfterFee as jest.Mock).mock.calls).toMatchSnapshot();
	expect((web3Util.createRawOrder as jest.Mock).mock.calls).toMatchSnapshot();
	done();
});

test('deleteOrder', () => {
	const send = jest.fn();
	relayerClient.ws = { send } as any;
	relayerClient.deleteOrder('pair', 'orderHash', 'signature');
	expect(send.mock.calls).toMatchSnapshot();
});
