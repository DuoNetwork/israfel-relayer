import { SignedOrder } from '0x.js';
import WebSocket from 'ws';
import SequenceClient from '../client/SequenceClient';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IRelayerQueueItem,
	IStringSignedOrder,
	IWsAddOrderRequest,
	IWsOrderRequest,
	IWsOrderResponse,
	IWsRequest,
	IWsResponse,
	IWsSequenceResponse
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderUtil from '../utils/orderUtil';
import relayerUtil from '../utils/relayerUtil';
import util from '../utils/util';
import Web3Util from '../utils/web3Util';

class RelayerServer extends SequenceClient {
	public web3Util: Web3Util | null = null;
	// private live: boolean = false;
	public relayerWsServer: WebSocket.Server | null = null;
	public requestQueue: { [pair: string]: IRelayerQueueItem[] } = {};

	public init(web3Util: Web3Util, live: boolean) {
		// this.live = live;
		this.web3Util = web3Util;
		this.connectToSequenceServer(live);
		relayerUtil.init();
		this.relayerWsServer = new WebSocket.Server({ port: 8080 });
	}

	public async handleSequenceMessage(m: string) {
		util.logDebug('received: ' + m);
		const res: IWsResponse = JSON.parse(m);
		if (res.channel !== CST.DB_SEQUENCE || res.status !== CST.WS_OK) return;

		const { sequence, method } = res as IWsSequenceResponse;
		const pair = method;
		if (!this.requestQueue[pair] || !this.requestQueue[pair].length) return;

		const queueItem = this.requestQueue[pair].pop();
		if (!queueItem) return;
		if (queueItem.method === CST.DB_ADD) {
			relayerUtil.handleAddOrder(
				sequence + '',
				queueItem.pair,
				queueItem.orderHash,
				queueItem.signedOrder as IStringSignedOrder
			);
			try {
				this.handleUserOrder(
					queueItem.ws,
					queueItem.liveOrder,
					CST.DB_ADD,
					CST.DB_CONFIRMED,
					CST.DB_RELAYER
				);
			} catch (error) {
				util.logError(error);
			}
		} else if (queueItem.method === CST.DB_CANCEL) {
			relayerUtil.handleCancel(sequence + '', queueItem.liveOrder as ILiveOrder);
			try {
				this.handleUserOrder(
					queueItem.ws,
					queueItem.liveOrder,
					CST.DB_CANCEL,
					CST.DB_CONFIRMED,
					CST.DB_RELAYER
				);
			} catch (error) {
				util.logError(error);
			}
		}
	}

	public handleInvalidOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		const orderResponse: IWsOrderResponse = {
			method: req.method,
			channel: req.channel,
			status: CST.WS_INVALID_ORDER,
			pair: req.pair,
			orderHash: req.orderHash
		};
		util.safeWsSend(ws, JSON.stringify(orderResponse));
	}

	public async handleUserOrder(
		ws: WebSocket,
		liveOrder: ILiveOrder,
		type: string,
		status: string,
		updatedBy: string
	) {
		const userOrder = orderUtil.getUserOrder(liveOrder, type, status, updatedBy);
		await dynamoUtil.addUserOrder(userOrder);
		const orderResponse: IWsOrderResponse = {
			method: type,
			channel: CST.DB_ORDERS,
			status: CST.WS_OK,
			pair: liveOrder.pair,
			orderHash: liveOrder.orderHash,
			userOrder: userOrder
		};
		util.safeWsSend(ws, JSON.stringify(orderResponse));
	}

	public async handleAddOrderRequest(ws: WebSocket, req: IWsAddOrderRequest) {
		util.logDebug('add new order');
		const signedOrder: SignedOrder = orderUtil.parseSignedOrder(req.order);
		const pair = req.pair;
		const orderHash = this.web3Util ? await this.web3Util.validateOrder(signedOrder) : '';
		if (orderHash && orderHash === req.orderHash) {
			const liveOrder = orderUtil.getNewLiveOrder(req.order, pair, orderHash);
			if (!this.requestQueue[pair]) this.requestQueue[pair] = [];
			this.requestQueue[pair].push({
				ws: ws,
				pair: pair,
				method: CST.DB_ADD,
				orderHash: orderHash,
				liveOrder: liveOrder,
				signedOrder: req.order
			});
			await this.handleUserOrder(ws, liveOrder, CST.DB_ADD, CST.DB_PENDING, CST.DB_USER);
		} else this.handleInvalidOrderRequest(ws, req);
	}

	public async handleCancelOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		const { orderHash, pair } = req;
		try {
			const liveOrders = await dynamoUtil.getLiveOrders(pair, orderHash);
			if (liveOrders.length < 1) {
				this.handleInvalidOrderRequest(ws, req);
				return;
			}

			if (!this.requestQueue[pair]) this.requestQueue[pair] = [];
			this.requestQueue[pair].push({
				ws: ws,
				pair: pair,
				method: CST.DB_CANCEL,
				orderHash: orderHash,
				liveOrder: liveOrders[0]
			});
			await this.handleUserOrder(
				ws,
				liveOrders[0],
				CST.DB_CANCEL,
				CST.DB_PENDING,
				CST.DB_USER
			);
		} catch (err) {
			util.logError(err);
			this.handleInvalidOrderRequest(ws, req);
		}
	}

	public handleOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		if (
			![CST.DB_ADD, CST.DB_CANCEL].includes(req.method) ||
			!CST.SUPPORTED_PAIRS.includes(req.pair) ||
			!req.orderHash
		) {
			const orderResponse: IWsOrderResponse = {
				status: CST.WS_INVALID_REQ,
				channel: req.channel,
				method: req.method,
				orderHash: req.orderHash,
				pair: req.pair
			};

			util.safeWsSend(ws, JSON.stringify(orderResponse));
			return Promise.resolve();
		}

		const sequenceResult = this.requestSequence(req.pair);
		if (sequenceResult) {
			const orderResponse: IWsOrderResponse = {
				status: sequenceResult,
				channel: req.channel,
				method: req.method,
				orderHash: req.orderHash,
				pair: req.pair
			};
			util.safeWsSend(ws, JSON.stringify(orderResponse));
			return Promise.resolve();
		}

		if (req.method === CST.DB_ADD)
			return this.handleAddOrderRequest(ws, req as IWsAddOrderRequest);
		// if (req.method === CST.DB_CANCEL)
		else return this.handleCancelOrderRequest(ws, req as IWsOrderRequest);
	}

	public handleRelayerMessage(ws: WebSocket, m: string) {
		util.logDebug('received: ' + m);
		const req: IWsRequest = JSON.parse(m);
		const res: IWsResponse = {
			status: CST.WS_INVALID_REQ,
			channel: req.channel || '',
			method: req.method || ''
		};
		if (
			!req.channel ||
			!req.method ||
			![CST.DB_ORDERS, CST.DB_ORDER_BOOKS].includes(req.channel)
		) {
			util.safeWsSend(ws, JSON.stringify(res));
			return Promise.resolve();
		}

		switch (req.channel) {
			case CST.DB_ORDERS:
				return this.handleOrderRequest(ws, req as IWsOrderRequest);
				break;
			case CST.DB_ORDER_BOOKS:
				util.logInfo('subscribe orderbook');
				util.safeWsSend(ws, JSON.stringify(relayerUtil.handleSubscribe(req)));
				return Promise.resolve();
				break;
			default:
				return Promise.resolve();
				break;
		}
	}

	public startServer() {
		dynamoUtil.updateStatus(CST.DB_RELAYER);
		setInterval(
			() =>
				dynamoUtil.updateStatus(
					CST.DB_RELAYER,
					this.relayerWsServer ? this.relayerWsServer.clients.size : 0
				),
			10000
		);

		if (this.relayerWsServer)
			this.relayerWsServer.on('connection', ws => {
				util.logInfo('new connection');
				ws.on('message', message => this.handleRelayerMessage(ws, message.toString()));
			});
	}
}

const relayerServer = new RelayerServer();
export default relayerServer;
