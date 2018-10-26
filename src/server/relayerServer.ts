import { orderHashUtils, SignedOrder } from '0x.js';
import WebSocket from 'ws';
import SequenceClient from '../client/SequenceClient';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IRelayerQueueItem,
	IStringSignedOrder,
	IWsAddOrderRequest,
	IWsCanceleOrderRequest,
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
	private web3Util: Web3Util | null = null;
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
				const userOrder = orderUtil.getUserOrder(
					queueItem.liveOrder,
					CST.DB_ADD,
					CST.DB_CONFIRMED,
					CST.DB_ORDER_PROCESSOR
				);
				await dynamoUtil.addUserOrder(userOrder);
				const orderResponse: IWsOrderResponse = {
					method: CST.DB_ADD,
					channel: CST.DB_ORDERS,
					status: CST.WS_OK,
					pair: pair,
					userOrder: userOrder
				};
				queueItem.ws.send(JSON.stringify(orderResponse));
			} catch (error) {
				util.logError(error);
			}
		} else if (queueItem.method === CST.DB_CANCEL) {
			relayerUtil.handleCancel(sequence + '', queueItem.liveOrder as ILiveOrder);
			try {
				const userOrder = orderUtil.getUserOrder(
					queueItem.liveOrder,
					CST.DB_CANCEL,
					CST.DB_CONFIRMED,
					CST.DB_ORDER_PROCESSOR
				);
				await dynamoUtil.addUserOrder(userOrder);
				const orderResponse: IWsOrderResponse = {
					method: CST.DB_CANCEL,
					channel: CST.DB_ORDERS,
					status: CST.WS_OK,
					pair: pair,
					userOrder: userOrder
				};
				queueItem.ws.send(JSON.stringify(orderResponse));
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
			pair: req.pair
		};
		ws.send(JSON.stringify(orderResponse));
	}

	public async handleAddOrderRequest(ws: WebSocket, req: IWsAddOrderRequest) {
		util.logDebug('add new order');
		const signedOrder: SignedOrder = orderUtil.parseSignedOrder(req.order);
		const pair = req.pair;
		const { signature, ...order } = signedOrder;
		const orderHash = orderHashUtils.getOrderHashHex(order);
		if (this.web3Util && (await this.web3Util.validateOrder(signedOrder, orderHash))) {
			const liveOrder = orderUtil.getLiveOrder(req.order, pair, orderHash);
			if (!this.requestQueue[pair]) this.requestQueue[pair] = [];
			this.requestQueue[pair].push({
				ws: ws,
				pair: pair,
				method: req.method,
				orderHash: orderHash,
				liveOrder: liveOrder,
				signedOrder: req.order
			});
			const userOrder = orderUtil.getUserOrder(
				liveOrder,
				CST.DB_ADD,
				CST.DB_PENDING,
				CST.DB_USER
			);
			await dynamoUtil.addUserOrder(userOrder);
			const orderResponse: IWsOrderResponse = {
				method: req.method,
				channel: req.channel,
				status: CST.WS_OK,
				pair: pair,
				userOrder: userOrder
			};
			ws.send(JSON.stringify(orderResponse));
		} else this.handleInvalidOrderRequest(ws, req);
	}

	public async handleCancelOrderRequest(ws: WebSocket, req: IWsCanceleOrderRequest) {
		const { orderHash, pair } = req;
		try {
			const liveOrders = await dynamoUtil.getLiveOrders(pair, orderHash);
			if (liveOrders.length < 1) {
				ws.send(
					JSON.stringify({
						method: req.method,
						channel: req.channel,
						pair: pair,
						status: CST.WS_INVALID_REQ,
						orderHash: orderHash,
						message: 'order does not exist'
					})
				);
				return;
			}

			if (!this.requestQueue[pair]) this.requestQueue[pair] = [];
			this.requestQueue[pair].push({
				ws: ws,
				pair: pair,
				method: req.method,
				orderHash: orderHash,
				liveOrder: liveOrders[0]
			});
			const userOrder = orderUtil.getUserOrder(
				liveOrders[0],
				CST.DB_CANCEL,
				CST.DB_PENDING,
				CST.DB_USER
			);
			await dynamoUtil.addUserOrder(userOrder);

			const orderResponse: IWsOrderResponse = {
				method: req.method,
				channel: req.channel,
				status: CST.WS_OK,
				pair: pair,
				userOrder: userOrder
			};
			ws.send(JSON.stringify(orderResponse));
		} catch (err) {
			util.logError(err);
			this.handleInvalidOrderRequest(ws, req);
		}
	}

	public handleRelayerOrderMessage(ws: WebSocket, req: IWsRequest) {
		const pair = (req as IWsOrderRequest).pair;
		if (
			![CST.DB_ADD, CST.DB_CANCEL].includes(req.method) ||
			!CST.SUPPORTED_PAIRS.includes(pair)
		) {
			const orderResponse: IWsOrderResponse = {
				status: CST.WS_INVALID_REQ,
				channel: req.channel,
				method: req.method,
				pair: pair
			};
			try {
				ws.send(JSON.stringify(orderResponse));
			} catch (error) {
				util.logDebug(error);
			}

			return Promise.resolve();
		}

		const sequenceResult = this.requestSequence(pair);
		if (sequenceResult) {
			const orderResponse: IWsOrderResponse = {
				status: sequenceResult,
				channel: req.channel,
				method: req.method,
				pair: pair
			};
			ws.send(orderResponse);
			return Promise.resolve();
		}

		if (req.method === CST.DB_ADD)
			return this.handleAddOrderRequest(ws, req as IWsAddOrderRequest);
		// if (req.method === CST.DB_CANCEL)
		else return this.handleCancelOrderRequest(ws, req as IWsCanceleOrderRequest);
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
			try {
				ws.send(JSON.stringify(res));
			} catch (error) {
				util.logDebug(error);
			}

			return;
		}

		switch (req.channel) {
			case CST.DB_ORDERS:
				this.handleRelayerOrderMessage(ws, req);
				break;
			case CST.DB_ORDER_BOOKS:
				util.logInfo('subscribe orderbook');
				ws.send(JSON.stringify(relayerUtil.handleSubscribe(req)));
				break;
			default:
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
