// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import * as Constants from '@finbook/duo-contract-wrapper/dist/constants';
import * as CST from '../common/constants';
import liveOrders from '../samples/test/liveOrders.json';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderBookUtil from '../utils/orderBookUtil';
import orderMatchingUtil from '../utils/orderMatchingUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import util from '../utils/util';
import orderBookServer from './orderBookServer';

jest.mock('@finbook/duo-contract-wrapper', () => ({
	Constants: Constants,
	Web3Wrapper: jest.fn(),
	DualClassWrapper: jest.fn()
}));

import { DualClassWrapper, Web3Wrapper } from '@finbook/duo-contract-wrapper';

orderBookServer.pair = 'code1|code2';
orderBookServer.loadingOrders = false;
orderBookServer.custodianInTrading = true;

test('terminateOrder', async () => {
	orderPersistenceUtil.persistOrder = jest.fn(() => Promise.resolve(null));
	await orderBookServer.terminateOrder('orderHash');
	expect((orderPersistenceUtil.persistOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('updateOrderBook add', () => {
	orderBookServer.liveOrders = {};
	orderBookUtil.updateOrderBook = jest.fn(() => 1);
	expect(
		orderBookServer.updateOrderBook({
			liveOrder: {
				orderHash: 'orderHash',
				price: 123,
				balance: 456,
				initialSequence: 111,
				side: CST.DB_BID
			} as any,
			method: CST.DB_ADD
		})
	).toMatchSnapshot();
	expect((orderBookUtil.updateOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookServer.liveOrders).toMatchSnapshot();
});

test('updateOrderBook update', () => {
	orderBookUtil.updateOrderBook = jest.fn(() => 0);
	expect(
		orderBookServer.updateOrderBook({
			liveOrder: {
				orderHash: 'orderHash',
				price: 123,
				balance: 400,
				initialSequence: 111,
				side: CST.DB_BID
			} as any,
			method: CST.DB_UPDATE
		})
	).toMatchSnapshot();
	expect((orderBookUtil.updateOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookServer.liveOrders).toMatchSnapshot();
});

test('updateOrderBook terminate', () => {
	orderBookUtil.updateOrderBook = jest.fn(() => 1);
	expect(
		orderBookServer.updateOrderBook({
			liveOrder: {
				orderHash: 'orderHash',
				price: 123,
				balance: 400,
				initialSequence: 111,
				side: CST.DB_BID
			} as any,
			method: CST.DB_TERMINATE
		})
	).toMatchSnapshot();
	expect((orderBookUtil.updateOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookServer.liveOrders).toEqual({});
});

test('updateOrderBookSnapshot', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	orderBookUtil.updateOrderBookSnapshot = jest.fn();
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(false));
	await orderBookServer.updateOrderBookSnapshot([
		{ price: 1, change: 1, count: 0, side: CST.DB_BID },
		{ price: 2, change: 2, count: 1, side: CST.DB_BID }
	]);
	expect((orderBookUtil.updateOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
});

const channel = 'xxx|xxx|code1|code2';
const orderQueueItem = {
	method: CST.DB_ADD,
	status: 'status',
	requestor: 'requestor',
	liveOrder: liveOrders['orderHash1']
};

test('handleOrderUpdate ignore update by self', async () => {
	orderQueueItem.requestor = CST.DB_ORDER_BOOKS;
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates.length).toBe(0);
	expect(orderBookServer.processedUpdates).toEqual({});
});

test('handleOrderUpdate invalid method', async () => {
	orderQueueItem.requestor = 'requestor';
	orderQueueItem.method = 'xxx';
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates.length).toBe(0);
	expect(orderBookServer.processedUpdates).toEqual({});
});

test('handleOrderUpdate current sequence too small', async () => {
	orderQueueItem.method = CST.DB_ADD;
	orderBookServer.orderSnapshotSequence = 100;
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.processedUpdates).toEqual({});
});

test('handleOrderUpdate order processed already', async () => {
	orderQueueItem.method = CST.DB_ADD;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 200;
	orderBookServer.updateOrderBook = jest.fn(() => 'orderBookLevelUpdate' as any);
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.updateOrderBook as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate terminate a non existing liveOrder', async () => {
	orderBookServer.orderSnapshotSequence = 1;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 1;
	orderBookServer.updateOrderBook = jest.fn(() => 'orderBookLevelUpdate' as any);
	orderQueueItem.method = CST.DB_TERMINATE;
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.processedUpdates).toMatchSnapshot();
	expect(orderBookServer.updateOrderBook as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate add', async () => {
	orderBookServer.orderSnapshotSequence = 1;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 1;
	orderBookServer.updateOrderBook = jest.fn(() => 'orderBookLevelUpdate' as any);
	orderBookServer.updateOrderBookSnapshot = jest.fn(() => Promise.resolve());
	orderQueueItem.method = CST.DB_ADD;
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		orderMatchRequests: [],
		orderBookLevelUpdates: []
	}));
	orderMatchingUtil.queueMatchRequest = jest.fn(() => Promise.resolve());
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderMatchingUtil.findMatchingOrders as jest.Mock).toBeCalled();
	expect(orderMatchingUtil.queueMatchRequest as jest.Mock).not.toBeCalled();
	expect((orderBookServer.updateOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookServer.updateOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderUpdate add match', async () => {
	orderBookServer.orderSnapshotSequence = 1;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 1;
	orderBookServer.updateOrderBook = jest.fn(() => 'orderBookLevelUpdate' as any);
	orderBookServer.updateOrderBookSnapshot = jest.fn(() => Promise.resolve());
	orderQueueItem.method = CST.DB_ADD;
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		orderMatchRequests: ['orderMatchRequests' as any],
		orderBookLevelUpdates: ['orderBookLevelUpdates1' as any, 'orderBookLevelUpdates2']
	}));
	orderMatchingUtil.queueMatchRequest = jest.fn(() => Promise.resolve());
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderMatchingUtil.findMatchingOrders as jest.Mock).toBeCalled();
	expect((orderMatchingUtil.queueMatchRequest as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookServer.updateOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookServer.updateOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderUpdate terminate', async () => {
	orderQueueItem.requestor = CST.DB_ORDER_MATCHER;
	orderBookServer.liveOrders[orderQueueItem.liveOrder.orderHash] = {} as any;
	orderBookServer.orderSnapshotSequence = 1;
	orderBookServer.processedUpdates[orderQueueItem.liveOrder.orderHash] = 1;
	orderBookServer.updateOrderBook = jest.fn(() => 'orderBookLevelUpdate' as any);
	orderBookServer.updateOrderBookSnapshot = jest.fn(() => Promise.resolve());
	orderQueueItem.method = CST.DB_TERMINATE;
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		orderMatchRequests: [],
		orderBookLevelUpdates: []
	}));
	orderMatchingUtil.queueMatchRequest = jest.fn(() => Promise.resolve());
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderMatchingUtil.findMatchingOrders as jest.Mock).not.toBeCalled();
	expect(orderMatchingUtil.queueMatchRequest as jest.Mock).not.toBeCalled();
	expect((orderBookServer.updateOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookServer.updateOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderUpdate loadingOrders', async () => {
	orderQueueItem.requestor = 'requestor';
	orderBookServer.loadingOrders = true;
	orderQueueItem.method = CST.DB_ADD;
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(false));
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.pendingUpdates).toMatchSnapshot();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate custodian not in trading terminate', async () => {
	orderBookServer.terminateOrder = jest.fn(() => Promise.resolve(null));
	orderBookServer.custodianInTrading = false;
	orderQueueItem.requestor = 'requestor';
	orderQueueItem.method = CST.DB_TERMINATE;
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(false));
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect(orderBookServer.terminateOrder as jest.Mock).not.toBeCalled();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('handleOrderUpdate custodian not in trading', async () => {
	orderBookServer.terminateOrder = jest.fn(() => Promise.resolve(null));
	orderBookServer.custodianInTrading = false;
	orderQueueItem.requestor = 'requestor';
	orderQueueItem.method = CST.DB_ADD;
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(false));
	await orderBookServer.handleOrderUpdate(channel, orderQueueItem);
	expect((orderBookServer.terminateOrder as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
});

test('updateOrderSequences', async () => {
	orderBookServer.liveOrders = liveOrders;
	orderBookServer.updateOrderSequences();
	expect(orderBookServer.orderSnapshotSequence).toMatchSnapshot();
	expect(orderBookServer.processedUpdates).toMatchSnapshot();
});

test('loadLiveOrders', async () => {
	orderBookServer.custodianInTrading = true;
	orderPersistenceUtil.getAllLiveOrdersInPersistence = jest.fn(() =>
		Promise.resolve('liveOrders' as any)
	);
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	orderBookUtil.constructOrderBook = jest.fn(() => 'orderBook' as any);
	orderBookUtil.renderOrderBookSnapshot = jest.fn(() => 'orderBookSnapshot' as any);
	orderMatchingUtil.queueMatchRequest = jest.fn(() => Promise.resolve());
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		orderMatchRequests: ['orderMatchRequests' as any],
		orderBookLevelUpdates: []
	}));
	orderBookServer.updateOrderSequences = jest.fn();
	orderBookServer.handleOrderUpdate = jest.fn(() => Promise.resolve());
	await orderBookServer.loadLiveOrders();
	expect(orderBookServer.updateOrderSequences as jest.Mock).toBeCalled();
	expect(orderBookServer.orderBook).toMatchSnapshot();
	expect(orderBookServer.orderBookSnapshot).toMatchSnapshot();
	expect((orderBookUtil.constructOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookUtil.renderOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderMatchingUtil.findMatchingOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderMatchingUtil.queueMatchRequest as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((orderBookServer.handleOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookServer.pendingUpdates).toEqual([]);
	expect(orderBookServer.loadingOrders).toBeFalsy();
});

test('loadLiveOrders no match', async () => {
	orderBookServer.custodianInTrading = true;
	orderPersistenceUtil.getAllLiveOrdersInPersistence = jest.fn(() =>
		Promise.resolve('liveOrders' as any)
	);
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	orderBookUtil.constructOrderBook = jest.fn(() => 'orderBook' as any);
	orderBookUtil.renderOrderBookSnapshot = jest.fn(() => 'orderBookSnapshot' as any);
	orderMatchingUtil.queueMatchRequest = jest.fn(() => Promise.resolve());
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		orderMatchRequests: [],
		orderBookLevelUpdates: []
	}));
	orderBookServer.updateOrderSequences = jest.fn();
	orderBookServer.handleOrderUpdate = jest.fn(() => Promise.resolve());
	await orderBookServer.loadLiveOrders();
	expect(orderBookServer.updateOrderSequences as jest.Mock).toBeCalled();
	expect(orderBookServer.orderBook).toMatchSnapshot();
	expect(orderBookServer.orderBookSnapshot).toMatchSnapshot();
	expect((orderBookUtil.constructOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderBookUtil.renderOrderBookSnapshot as jest.Mock).mock.calls).toMatchSnapshot();
	expect((orderMatchingUtil.findMatchingOrders as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderMatchingUtil.queueMatchRequest as jest.Mock).not.toBeCalled();
	expect(
		(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect(orderBookServer.handleOrderUpdate as jest.Mock).not.toBeCalled();
	expect(orderBookServer.pendingUpdates).toEqual([]);
	expect(orderBookServer.loadingOrders).toBeFalsy();
});

test('loadLiveOrders custodian not in trading', async () => {
	orderBookServer.custodianInTrading = false;
	orderPersistenceUtil.getAllLiveOrdersInPersistence = jest.fn(() =>
		Promise.resolve('liveOrders' as any)
	);
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(true));
	orderBookUtil.constructOrderBook = jest.fn(() => 'orderBook' as any);
	orderBookUtil.renderOrderBookSnapshot = jest.fn(() => 'orderBookSnapshot' as any);
	orderMatchingUtil.queueMatchRequest = jest.fn(() => Promise.resolve());
	orderMatchingUtil.findMatchingOrders = jest.fn(() => ({
		orderMatchRequests: [],
		orderBookLevelUpdates: []
	}));
	orderBookServer.updateOrderSequences = jest.fn();
	orderBookServer.handleOrderUpdate = jest.fn(() => Promise.resolve());
	await orderBookServer.loadLiveOrders();
	expect(orderBookServer.updateOrderSequences as jest.Mock).not.toBeCalled();
	expect(orderBookUtil.constructOrderBook as jest.Mock).not.toBeCalled();
	expect(orderBookUtil.renderOrderBookSnapshot as jest.Mock).not.toBeCalled();
	expect(orderMatchingUtil.findMatchingOrders as jest.Mock).not.toBeCalled();
	expect(orderMatchingUtil.queueMatchRequest as jest.Mock).not.toBeCalled();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
	expect(orderBookServer.handleOrderUpdate as jest.Mock).not.toBeCalled();
});

test('checkCustodianState not in trading', async () => {
	const dualClassWrapper = {
		getStates: jest.fn(() =>
			Promise.resolve({
				state: 'state'
			})
		)
	};

	orderBookServer.liveOrders = {
		orderHash: 'liveOrder' as any
	};
	orderBookServer.pendingUpdates = ['pendingUpdates' as any];
	orderBookServer.orderBookSnapshot = {
		pair: 'pair',
		version: 123,
		bids: [{ price: 123, balance: 456, count: 2 }],
		asks: [{ price: 456, balance: 123, count: 3 }]
	};
	orderBookServer.terminateOrder = jest.fn(() => Promise.resolve(null));
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(false));
	orderBookUtil.constructOrderBook = jest.fn(() => 'orderBook' as any);
	orderBookUtil.renderOrderBookSnapshot = jest.fn(() => ({
		pair: 'orderBookSnapshot',
		version: 1234567890
	} as any));
	await orderBookServer.checkCustodianState(dualClassWrapper as any);
	expect(orderBookServer.custodianInTrading).toBeFalsy();
	expect(orderBookServer.liveOrders).toEqual({});
	expect(orderBookServer.pendingUpdates).toEqual([]);
	expect(orderBookServer.orderBook).toMatchSnapshot();
	expect(orderBookServer.orderBookSnapshot).toMatchSnapshot();
	expect(
		(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).mock.calls
	).toMatchSnapshot();
	expect((orderBookServer.terminateOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('checkCustodianState in trading', async () => {
	const dualClassWrapper = {
		getStates: jest.fn(() =>
			Promise.resolve({
				state: 'Trading'
			})
		)
	};
	orderBookServer.terminateOrder = jest.fn(() => Promise.resolve(null));
	orderBookPersistenceUtil.publishOrderBookUpdate = jest.fn(() => Promise.resolve(false));

	await orderBookServer.checkCustodianState(dualClassWrapper as any);
	expect(orderBookServer.custodianInTrading).toBeTruthy();
	expect(orderBookPersistenceUtil.publishOrderBookUpdate as jest.Mock).not.toBeCalled();
	expect(orderBookServer.terminateOrder as jest.Mock).not.toBeCalled();
});

test('initialize', async () => {
	global.setInterval = jest.fn();
	orderBookServer.checkCustodianState = jest.fn(() => Promise.resolve());
	orderBookServer.handleOrderUpdate = jest.fn(() => Promise.resolve());
	orderBookServer.loadLiveOrders = jest.fn(() => Promise.resolve());
	orderPersistenceUtil.subscribeOrderUpdate = jest.fn();
	await orderBookServer.initialize('dualClassWrapper' as any);
	expect((global.setInterval as jest.Mock).mock.calls).toMatchSnapshot();
	await (global.setInterval as jest.Mock).mock.calls[0][0]();
	await (global.setInterval as jest.Mock).mock.calls[1][0]();
	expect((orderBookServer.checkCustodianState as jest.Mock).mock.calls).toMatchSnapshot();
	expect(orderBookServer.loadLiveOrders as jest.Mock).toBeCalledTimes(2);
	expect((orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
	(orderPersistenceUtil.subscribeOrderUpdate as jest.Mock).mock.calls[0][1](
		'channel',
		'orderQueueItem'
	);
	expect((orderBookServer.handleOrderUpdate as jest.Mock).mock.calls).toMatchSnapshot();
});

test('startServer', async () => {
	dynamoUtil.scanTokens = jest.fn(() =>
		Promise.resolve([
			{
				custodian: 'custodian',
				address: 'address',
				code: 'code',
				denomination: 0.0001,
				precisions: {
					WETH: 0.001
				},
				feeSchedules: {
					WETH: {
						minimum: 0,
						rate: 0.01
					}
				}
			}
		])
	);
	dynamoUtil.updateStatus = jest.fn();
	global.setInterval = jest.fn();
	await orderBookServer.startServer({
		token: 'code'
	} as any);
	expect((DualClassWrapper as any).mock.calls).toMatchSnapshot();
	expect((Web3Wrapper as any).mock.calls).toMatchSnapshot();
	expect(dynamoUtil.updateStatus as jest.Mock).not.toBeCalled();
	expect(global.setInterval as jest.Mock).not.toBeCalled();
});

test('startServer, server', async () => {
	dynamoUtil.scanTokens = jest.fn(() =>
		Promise.resolve([
			{
				custodian: 'custodian',
				address: 'address',
				code: 'code',
				denomination: 0.0001,
				precisions: {
					WETH: 0.001
				},
				feeSchedules: {
					WETH: {
						minimum: 0,
						rate: 0.01
					}
				}
			}
		])
	);
	global.setInterval = jest.fn();
	dynamoUtil.updateStatus = jest.fn();
	await orderBookServer.startServer({
		token: 'code',
		server: true,
		env: 'live'
	} as any);
	expect((DualClassWrapper as any).mock.calls).toMatchSnapshot();
	expect((Web3Wrapper as any).mock.calls).toMatchSnapshot();
	expect((global.setInterval as any).mock.calls).toMatchSnapshot();

	(global.setInterval as jest.Mock).mock.calls[0][0]();
	expect((dynamoUtil.updateStatus as jest.Mock).mock.calls).toMatchSnapshot();
});

test('startServer, no token', async () => {
	dynamoUtil.updateStatus = jest.fn();
	dynamoUtil.scanTokens = jest.fn(() =>
		Promise.resolve([
			{
				custodian: 'custodian',
				address: 'address',
				code: 'xxx',
				denomination: 0.0001,
				precisions: {
					WETH: 0.001
				},
				feeSchedules: {
					WETH: {
						minimum: 0,
						rate: 0.01
					}
				}
			}
		])
	);
	orderBookServer.initialize = jest.fn();
	await orderBookServer.startServer({
		token: 'code'
	} as any);
	global.setInterval = jest.fn();
	dynamoUtil.updateStatus = jest.fn();
	expect(orderBookServer.initialize as jest.Mock).not.toBeCalled();
	expect(dynamoUtil.updateStatus as jest.Mock).not.toBeCalled();
	expect(global.setInterval as jest.Mock).not.toBeCalled();
});
