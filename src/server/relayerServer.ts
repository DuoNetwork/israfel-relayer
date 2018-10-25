import { orderHashUtils, SignedOrder } from '0x.js';
import WebSocket from 'ws';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IRelayerQueueItem,
	IStringSignedOrder,
	IWsAddOrderRequest,
	IWsCanceleOrderRequest,
	IWsRequest,
	IWsResponse,
	IWsSequenceResponse
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderUtil from '../utils/orderUtil';
import relayerUtil from '../utils/relayerUtil';
import util from '../utils/util';
import Web3Util from '../utils/web3Util';

class RelayerServer {
	private web3Util: Web3Util | null = null;
	private live: boolean = false;
	public relayerWsServer: WebSocket.Server | null = null;
	public sequenceWsClient: WebSocket | null = null;
	public ip: string = '';
	public requestQueue: { [pair: string]: IRelayerQueueItem[] } = {};

	public init(web3Util: Web3Util, live: boolean) {
		this.live = live;
		this.web3Util = web3Util;
		relayerUtil.init();
		this.relayerWsServer = new WebSocket.Server({ port: 8080 });
	}

	public handleSequenceMessage(m: string) {
		util.logDebug('received: ' + m);
		const res: IWsResponse = JSON.parse(m);
		if (res.channel !== CST.DB_SEQUENCE || res.status !== CST.WS_OK) return;

		const { sequence, pair } = res as IWsSequenceResponse;
		if (!this.requestQueue[pair] || !this.requestQueue[pair].length) return;

		const queueItem = this.requestQueue[pair].pop();
		if (!queueItem) return;
		if (queueItem.method === CST.DB_ADD) {
			relayerUtil.handleAddOrder(
				sequence + '',
				queueItem.pair,
				queueItem.orderHash,
				queueItem.order as IStringSignedOrder
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
			relayerUtil.handleCancel(sequence + '', queueItem.order as ILiveOrder);
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

	public connectToSequenceServer() {
		this.sequenceWsClient = new WebSocket(
			`${this.live ? CST.SEQUENCE_URL_LIVE : CST.SEQUENCE_URL_DEV}:${CST.SEQUENCE_PORT}`
		);

		this.sequenceWsClient.on('open', () => util.logInfo('connected to sequence server'));
		this.sequenceWsClient.on('message', m => this.handleSequenceMessage(m.toString()));
		this.sequenceWsClient.on('error', (error: Error) => {
			util.logError(error);
			if (this.sequenceWsClient) {
				this.sequenceWsClient.removeAllListeners();
				this.sequenceWsClient.terminate();
			}
			this.connectToSequenceServer();
		});
		this.sequenceWsClient.on('close', (code: number, reason: string) => {
			util.logError('connection closed ' + code + ' ' + reason);
			if (this.sequenceWsClient) {
				this.sequenceWsClient.removeAllListeners();
				this.sequenceWsClient.terminate();
			}
			this.connectToSequenceServer();
		});
	}

	public async handleRelayerOrderMessage(ws: WebSocket, req: IWsRequest) {
		if (!this.sequenceWsClient)
			ws.send(
				JSON.stringify({
					status: CST.WS_SERVICE_NA,
					channel: req.channel
				})
			);
		else if (req.method === CST.DB_ADD) {
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
				if (!this.requestQueue[pair]) this.requestQueue[pair] = [];
				this.requestQueue[pair].push({
					ws: ws,
					pair: pair,
					method: req.method,
					orderHash: orderHash,
					order: stringSignedOrder
				});
				ws.send(
					JSON.stringify({
						method: req.method,
						channel: req.channel,
						status: CST.WS_OK,
						pair: pair,
						orderHash: orderHash
					})
				);
				// TODO: write to db user order as pending
			} else
				ws.send(
					JSON.stringify({
						method: req.method,
						channel: req.channel,
						status: CST.WS_INVALID_REQ,
						pair: pair,
						orderHash: orderHash,
						message: 'invalid order'
					})
				);
		} else if (req.method === CST.DB_CANCEL) {
			const { orderHash, pair } = req as IWsCanceleOrderRequest;
			let liveOrders: ILiveOrder[] = [];
			try {
				liveOrders = await dynamoUtil.getLiveOrders(pair, orderHash);
				if (liveOrders.length < 1)
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
				else {
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
						order: liveOrders[0]
					});
				}
			} catch (err) {
				util.logError(err);
				ws.send(
					JSON.stringify({
						method: req.method,
						channel: req.channel,
						status: 'failed',
						pair: pair,
						orderHash: orderHash,
						message: err
					})
				);
			}
		}
	}

	public handleRelayerMessage(ws: WebSocket, m: string) {
		util.logDebug('received: ' + m);
		const req: IWsRequest = JSON.parse(m);
		const res: IWsResponse = {
			status: CST.WS_INVALID_REQ,
			channel: req.channel || ''
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
			case  CST.DB_ORDERS:
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
