import * as fs from 'fs';
import * as https from 'https';
import WebSocket from 'ws';
import SequenceClient from '../client/SequenceClient';
import * as CST from '../common/constants';
import {
	INewOrderQueueItem,
	IOption,
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
	public requestCache: { [methodPairOrderHash: string]: IRelayerCacheItem } = {};

	public getCacheKey(re: IWsOrderRequest | IWsOrderResponse) {
		return `${re.method}|${re.pair}|${re.orderHash}`;
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
		util.logDebug(`add new order ${req.orderHash}`);
		const cacheKey = this.getCacheKey(req);
		if (this.requestCache[cacheKey]) {
			util.logDebug('existing request, ignore');
			this.handleInvalidOrderRequest(ws, req);
			return;
		}

		let liveOrder = await orderUtil.getLiveOrderInPersistence(req.pair, req.orderHash);
		if (liveOrder) {
			util.logDebug('existing order, ignore');
			this.handleInvalidOrderRequest(ws, req);
			return;
		}

		const stringSignedOrder: IStringSignedOrder = req.order as IStringSignedOrder;

		const orderHash = this.web3Util
			? await this.web3Util.validateOrder(orderUtil.parseSignedOrder(stringSignedOrder))
			: '';
		if (orderHash && orderHash === req.orderHash) {
			const pair = req.pair;
			liveOrder = orderUtil.constructNewLiveOrder(stringSignedOrder, pair, orderHash);
			this.requestCache[cacheKey] = {
				ws: ws,
				pair: pair,
				method: CST.DB_ADD,
				liveOrder: liveOrder,
				signedOrder: stringSignedOrder,
				timeout: setTimeout(() => this.handleTimeout(cacheKey), 30000)
			};
			util.logDebug('request added to cache');
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
		} else {
			util.logDebug('invalid orderHash, ignore');
			this.handleInvalidOrderRequest(ws, req);
		}
	}

	public async handleCancelOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		util.logDebug(`cancel order ${req.orderHash}`);
		const { orderHash, pair } = req;
		const cacheKey = this.getCacheKey(req);
		if (this.requestCache[cacheKey]) {
			util.logDebug('existing request, ignore');
			this.handleInvalidOrderRequest(ws, req);
			return;
		}

		const liveOrder = await orderUtil.getLiveOrderInPersistence(pair, orderHash);
		if (!liveOrder) {
			util.logDebug('non-existing order, ignore');
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
		util.logDebug('request added to cache');
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

	public async startServer(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		let url = `ws://13.251.115.119:8080`;
		if (option.server) {
			const sequenceService = await dynamoUtil.getServices(CST.DB_SEQUENCE);
			if (!sequenceService.length) return;
			url = sequenceService[0].url;
		}

		this.connectToSequenceServer(url);
		let port = 8080;
		if (option.server) {
			const relayerService = await dynamoUtil.getServices(CST.DB_RELAYER, true);
			if (!relayerService.length) return;
			port = Number(relayerService[0].url.split(':').slice(-1)[0]);
		}
		const server = https
			.createServer({
				key: fs.readFileSync('./src/keys/websocket/key.pem', 'utf8'),
				cert: fs.readFileSync('./src/keys/websocket/cert.pem', 'utf8')
			})
			.listen(port);
		this.relayerWsServer = new WebSocket.Server({ server: server });
		util.logInfo(`started relayer service at port ${port}`);

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
				ws.on('close', () => util.logInfo('connection close'));
			});
	}
}

const relayerServer = new RelayerServer();
export default relayerServer;
