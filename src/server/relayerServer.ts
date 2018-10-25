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
	public ip: string = '';
	public requestQueue: { [pair: string]: IRelayerQueueItem[] } = {};

	public init(web3Util: Web3Util, live: boolean) {
		// this.live = live;
		this.web3Util = web3Util;
		this.connectToSequenceServer(live);
		relayerUtil.init();
		this.relayerWsServer = new WebSocket.Server({ port: 8080 });
	}

	public handleSequenceMessage(m: string) {
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
				queueItem.ws.send(
					JSON.stringify({
						method: CST.DB_ADD,
						channel: `${CST.DB_ORDERS}| ${queueItem.pair}`,
						status: CST.WS_OK,
						orderHash: queueItem.orderHash,
						message: ''
					})
				);
			} catch (error) {
				util.logError(error);
			}
		} else if (queueItem.method === CST.DB_CANCEL) {
			relayerUtil.handleCancel(sequence + '', queueItem.liveOrder as ILiveOrder);
			try {
				queueItem.ws.send(
					JSON.stringify({
						method: CST.DB_CANCEL,
						channel: `${CST.DB_ORDERS}| ${queueItem.pair}`,
						status: CST.WS_OK,
						orderHash: queueItem.orderHash,
						message: ''
					})
				);
			} catch (error) {
				util.logError(error);
			}
		}
	}

	public async handleRelayerOrderMessage(ws: WebSocket, req: IWsRequest) {
		if (!this.sequenceWsClient) {
			const res: IWsResponse = {
				status: CST.WS_SERVICE_NA,
				channel: req.channel,
				method: req.method
			};
			ws.send(res);
			return;
		}

		if (req.method === CST.DB_ADD) {
			util.logDebug('add new order');
			const stringSignedOrder = (req as IWsAddOrderRequest).order;
			const pair = (req as IWsAddOrderRequest).pair;
			const signedOrder: SignedOrder = orderUtil.parseSignedOrder(stringSignedOrder);
			const { signature, ...order } = signedOrder;
			const orderHash = orderHashUtils.getOrderHashHex(order);
			if (this.web3Util && (await this.web3Util.validateOrder(signedOrder, orderHash))) {
				const requestSequence: IWsRequest = {
					method: pair,
					channel: CST.DB_SEQUENCE
				};
				this.sequenceWsClient.send(JSON.stringify(requestSequence));
				const liveOrder = orderUtil.getLiveOrder(stringSignedOrder, pair, orderHash);
				if (!this.requestQueue[pair]) this.requestQueue[pair] = [];
				this.requestQueue[pair].push({
					ws: ws,
					pair: pair,
					method: req.method,
					orderHash: orderHash,
					liveOrder: liveOrder,
					signedOrder: stringSignedOrder
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
			} else {
				const orderResponse: IWsOrderResponse = {
					method: req.method,
					channel: req.channel,
					status: CST.WS_INVALID_ORDER,
					pair: pair
				};
				ws.send(JSON.stringify(orderResponse));
			}
		} else if (req.method === CST.DB_CANCEL) {
			const { orderHash, pair } = req as IWsCanceleOrderRequest;
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

				const requestSequence: IWsRequest = {
					method: pair,
					channel: CST.DB_SEQUENCE
				};
				this.sequenceWsClient.send(JSON.stringify(requestSequence));
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
			} catch (err) {
				util.logError(err);
				const orderResponse: IWsOrderResponse = {
					method: req.method,
					channel: req.channel,
					status: CST.WS_INVALID_ORDER,
					pair: pair
				};
				ws.send(JSON.stringify(orderResponse));
			}
		}
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
