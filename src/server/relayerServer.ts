import WebSocket from 'ws';
import SequenceClient from '../client/SequenceClient';
import * as CST from '../common/constants';
import {
	INewOrderQueueItem,
	IRelayerCacheItem,
	IStringSignedOrder,
	IUserOrder,
	IWsAddOrderRequest,
	IWsOrderRequest,
	IWsOrderResponse,
	IWsOrderSequenceResponse,
	IWsRequest,
	IWsResponse,
	IWsUserOrderResponse
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderUtil from '../utils/orderUtil';
// import relayerUtil from '../utils/relayerUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class RelayerServer extends SequenceClient {
	public web3Util: Web3Util | null = null;
	// private live: boolean = false;
	public relayerWsServer: WebSocket.Server | null = null;
	public requestCache: { [pairMethodOrderHash: string]: IRelayerCacheItem } = {};

	public getCacheKey(re: IWsOrderRequest | IWsOrderResponse) {
		return `${re.method}|${re.pair}|${re.orderHash}`;
	}

	public init(web3Util: Web3Util, live: boolean) {
		// this.live = live;
		this.web3Util = web3Util;
		this.connectToSequenceServer(live);
		// relayerUtil.init();
		this.relayerWsServer = new WebSocket.Server({ port: CST.RELAYER_PORT });
	}

	public handleTimeout(cacheKey: string) {
		util.logError(cacheKey);
		return;
	}

	public async handleSequenceMessage(m: string) {
		util.logDebug('received: ' + m);
		const res: IWsResponse = JSON.parse(m);
		if (res.channel !== CST.DB_SEQUENCE || res.status !== CST.WS_OK) return false;

		const { sequence, method } = res as IWsOrderSequenceResponse;
		const cacheKey = this.getCacheKey(res as IWsOrderSequenceResponse);
		if (!this.requestCache[cacheKey]) return false;
		if (!sequence) return false;

		const cacheItem = this.requestCache[cacheKey];
		clearTimeout(cacheItem.timeout);
		cacheItem.liveOrder.currentSequence = sequence;
		delete this.requestCache[cacheKey];
		if (method === CST.DB_ADD) {
			cacheItem.liveOrder.initialSequence = sequence;
			const orderQueueItem: INewOrderQueueItem = {
				liveOrder: cacheItem.liveOrder,
				signedOrder: cacheItem.signedOrder as IStringSignedOrder
			};
			const userOrder = await orderUtil.addOrderToPersistence(orderQueueItem);
			if (userOrder) {
				try {
					this.handleUserOrder(cacheItem.ws, userOrder, CST.DB_ADD);
				} catch (error) {
					util.logError(error);
				}

				return true;
			}

			this.requestCache[cacheKey] = cacheItem;
			return false;
		} else if (method === CST.DB_CANCEL) {
			const userOrder = await orderUtil.cancelOrderInPersistence(cacheItem.liveOrder);
			if (userOrder) {
				try {
					this.handleUserOrder(cacheItem.ws, userOrder, CST.DB_CANCEL);
				} catch (error) {
					util.logError(error);
				}

				return true;
			}

			this.requestCache[cacheKey] = cacheItem;
			return false;
		} else return false;
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

	public handleUserOrder(ws: WebSocket, userOrder: IUserOrder, type: string) {
		const orderResponse: IWsUserOrderResponse = {
			method: type,
			channel: CST.DB_ORDERS,
			status: CST.WS_OK,
			pair: userOrder.pair,
			orderHash: userOrder.orderHash,
			userOrder: userOrder
		};
		util.safeWsSend(ws, JSON.stringify(orderResponse));
	}

	public async handleAddOrderRequest(ws: WebSocket, req: IWsAddOrderRequest) {
		util.logDebug('add new order');
		const cacheKey = this.getCacheKey(req);
		if (this.requestCache[cacheKey]) {
			this.handleInvalidOrderRequest(ws, req);
			return;
		}

		let liveOrder = await orderUtil.getLiveOrderInPersistence(req.pair, req.orderHash);
		if (liveOrder) {
			this.handleInvalidOrderRequest(ws, req);
			return;
		}

		const orderHash = this.web3Util
			? await this.web3Util.validateOrder(orderUtil.parseSignedOrder(req.order))
			: '';
		if (orderHash && orderHash === req.orderHash) {
			const pair = req.pair;
			liveOrder = orderUtil.constructNewLiveOrder(req.order, pair, orderHash);
			this.requestCache[cacheKey] = {
				ws: ws,
				pair: pair,
				method: CST.DB_ADD,
				liveOrder: liveOrder,
				signedOrder: req.order,
				timeout: setTimeout(() => this.handleTimeout(cacheKey), 30000)
			};
			this.requestSequence(req.method, req.pair, req.orderHash);
			this.handleUserOrder(
				ws,
				await orderUtil.addUserOrderToDB(
					liveOrder,
					CST.DB_ADD,
					CST.DB_PENDING,
					CST.DB_USER
				),
				CST.DB_ADD
			);
		} else this.handleInvalidOrderRequest(ws, req);
	}

	public async handleCancelOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		const { orderHash, pair } = req;
		const cacheKey = this.getCacheKey(req);
		if (this.requestCache[cacheKey]) {
			this.handleInvalidOrderRequest(ws, req);
			return;
		}

		const liveOrder = await orderUtil.getLiveOrderInPersistence(pair, orderHash);
		if (!liveOrder) {
			this.handleInvalidOrderRequest(ws, req);
			return;
		}

		this.requestCache[cacheKey] = {
			ws: ws,
			pair: pair,
			method: CST.DB_CANCEL,
			liveOrder: liveOrder,
			timeout: setTimeout(() => this.handleTimeout(cacheKey), 30000)
		};
		this.requestSequence(req.method, req.pair, req.orderHash);
		this.handleUserOrder(
			ws,
			await orderUtil.addUserOrderToDB(liveOrder, CST.DB_CANCEL, CST.DB_PENDING, CST.DB_USER),
			CST.DB_CANCEL
		);
	}

	public handleOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		if (![CST.DB_ADD, CST.DB_CANCEL].includes(req.method) || !req.orderHash) {
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

		if (!this.sequenceWsClient) {
			const orderResponse: IWsOrderResponse = {
				status: CST.WS_SERVICE_NA,
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
			method: req.method || '',
			pair: req.pair || ''
		};
		if (
			![CST.DB_ORDERS, CST.DB_ORDER_BOOKS].includes(req.channel) ||
			!req.method ||
			!CST.SUPPORTED_PAIRS.includes(req.pair)
		) {
			util.safeWsSend(ws, JSON.stringify(res));
			return Promise.resolve();
		}

		switch (req.channel) {
			case CST.DB_ORDERS:
				return this.handleOrderRequest(ws, req as IWsOrderRequest);
			case CST.DB_ORDER_BOOKS:
				util.logInfo('subscribe orderbook');
				// util.safeWsSend(ws, JSON.stringify(relayerUtil.handleSubscribe(req)));
				return Promise.resolve();
			default:
				return Promise.resolve();
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
