import * as fs from 'fs';
import * as https from 'https';
import WebSocket from 'ws';
import SequenceClient from '../client/SequenceClient';
import * as CST from '../common/constants';
import {
	IOption,
	IOrderQueueItem,
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
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class RelayerServer extends SequenceClient {
	public sequenceMethods = [CST.DB_ADD, CST.DB_TERMINATE];
	public web3Util: Web3Util | null = null;
	public relayerWsServer: WebSocket.Server | null = null;
	public requestCache: { [methodPairOrderHash: string]: IRelayerCacheItem } = {};

	public handleTimeout(cacheKey: string) {
		util.logError(cacheKey);
		return;
	}

	public async handleSequenceResponse(
		res: IWsOrderSequenceResponse,
		cacheItem: IRelayerCacheItem
	) {
		const orderQueueItem: IOrderQueueItem = {
			liveOrder: cacheItem.liveOrder
		};

		if (res.method === CST.DB_ADD) {
			cacheItem.liveOrder.initialSequence = res.sequence;
			orderQueueItem.signedOrder = (cacheItem.request as IWsAddOrderRequest)
				.order as IStringSignedOrder;
		}

		const userOrder = await orderPersistenceUtil.persistOrder(res.method, orderQueueItem);
		if (userOrder) this.handleUserOrder(cacheItem.ws, userOrder, res.method);
		else this.handleInvalidOrderRequest(cacheItem.ws, cacheItem.request);
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

		let liveOrder = await orderPersistenceUtil.getLiveOrderInPersistence(req.pair, req.orderHash);
		if (liveOrder) {
			util.logDebug('existing order, ignore');
			this.handleInvalidOrderRequest(ws, req);
			return;
		}

		const stringSignedOrder = req.order as IStringSignedOrder;

		const orderHash = this.web3Util
			? await this.web3Util.validateOrder(orderPersistenceUtil.parseSignedOrder(stringSignedOrder))
			: '';
		if (orderHash && orderHash === req.orderHash) {
			const pair = req.pair;
			liveOrder = orderPersistenceUtil.constructNewLiveOrder(stringSignedOrder, pair, orderHash);
			this.requestCache[cacheKey] = {
				ws: ws,
				request: req,
				pair: pair,
				method: CST.DB_ADD,
				liveOrder: liveOrder,
				timeout: setTimeout(() => this.handleTimeout(cacheKey), 30000)
			};
			util.logDebug('request added to cache');
			this.handleUserOrder(
				ws,
				await orderPersistenceUtil.addUserOrderToDB(
					liveOrder,
					CST.DB_ADD,
					CST.DB_PENDING,
					CST.DB_USER
				),
				CST.DB_ADD
			);
			this.requestSequence(req.method, req.pair, req.orderHash);
		} else {
			util.logDebug('invalid orderHash, ignore');
			this.handleInvalidOrderRequest(ws, req);
		}
	}

	public async handleTerminateOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		util.logDebug(`terminate order ${req.orderHash}`);
		const { orderHash, pair } = req;
		const cacheKey = this.getCacheKey(req);
		if (this.requestCache[cacheKey]) {
			util.logDebug('existing request, ignore');
			this.handleInvalidOrderRequest(ws, req);
			return;
		}

		const liveOrder = await orderPersistenceUtil.getLiveOrderInPersistence(pair, orderHash);
		if (!liveOrder) {
			util.logDebug('non-existing order, ignore');
			this.handleInvalidOrderRequest(ws, req);
			return;
		}

		this.requestCache[cacheKey] = {
			ws: ws,
			request: req,
			pair: pair,
			method: CST.DB_TERMINATE,
			liveOrder: liveOrder,
			timeout: setTimeout(() => this.handleTimeout(cacheKey), 30000)
		};
		util.logDebug('request added to cache');
		this.handleUserOrder(
			ws,
			await orderPersistenceUtil.addUserOrderToDB(liveOrder, CST.DB_TERMINATE, CST.DB_PENDING, CST.DB_USER),
			CST.DB_TERMINATE
		);
		this.requestSequence(req.method, req.pair, req.orderHash);
	}

	public handleOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		if (![CST.DB_ADD, CST.DB_TERMINATE].includes(req.method) || !req.orderHash) {
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
		// if (req.method === CST.DB_TERMINATE)
		else return this.handleTerminateOrderRequest(ws, req as IWsOrderRequest);
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
		await this.connectToSequenceServer(option.server);
		let port = 8080;
		if (option.server) {
			const relayerService = await dynamoUtil.getServices(CST.DB_RELAYER, true);
			if (!relayerService.length) {
				util.logInfo('no relayer service config, exit');
				return;
			}
			util.logInfo('loaded relayer service config');
			util.logInfo(relayerService[0]);
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

		if (this.relayerWsServer)
			this.relayerWsServer.on('connection', ws => {
				util.logInfo('new connection');
				ws.on('message', message => this.handleRelayerMessage(ws, message.toString()));
				ws.on('close', () => util.logInfo('connection close'));
			});

		if (option.server) {
			dynamoUtil.updateStatus(CST.DB_RELAYER);
			setInterval(
				() =>
					dynamoUtil.updateStatus(
						CST.DB_RELAYER,
						this.relayerWsServer ? this.relayerWsServer.clients.size : 0
					),
				10000
			);
		}
	}
}

const relayerServer = new RelayerServer();
export default relayerServer;
