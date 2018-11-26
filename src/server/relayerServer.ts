import * as fs from 'fs';
import * as https from 'https';
import WebSocket from 'ws';
import * as CST from '../common/constants';
import {
	IOption,
	IOrderBookSnapshotUpdate,
	IStatus,
	IStringSignedOrder,
	IUserOrder,
	IWsAddOrderRequest,
	IWsInfoResponse,
	IWsOrderBookResponse,
	IWsOrderBookUpdateResponse,
	IWsOrderHistoryRequest,
	IWsOrderHistoryResponse,
	IWsOrderRequest,
	IWsOrderResponse,
	IWsRequest,
	IWsResponse,
	IWsUserOrderResponse
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class RelayerServer {
	public processStatus: IStatus[] = [];
	public web3Util: Web3Util | null = null;
	public wsServer: WebSocket.Server | null = null;
	public orderBookPairs: { [pair: string]: WebSocket[] } = {};
	public clients: WebSocket[] = [];
	public clientPairs: { [account: string]: { [pair: string]: WebSocket[] } } = {};

	public sendResponse(ws: WebSocket, req: IWsRequest, status: string) {
		const orderResponse: IWsResponse = {
			method: req.method,
			channel: req.channel,
			status: status,
			pair: req.pair
		};
		util.safeWsSend(ws, JSON.stringify(orderResponse));
	}

	public sendErrorOrderResponse(ws: WebSocket, req: IWsOrderRequest, status: string) {
		const orderResponse: IWsOrderResponse = {
			method: req.method,
			channel: req.channel,
			status: status,
			pair: req.pair,
			orderHash: req.orderHash
		};
		util.safeWsSend(ws, JSON.stringify(orderResponse));
	}

	public sendUserOrderResponse(ws: WebSocket, userOrder: IUserOrder, type: string) {
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
		const stringSignedOrder = req.order as IStringSignedOrder;

		const parsedSignedorder = orderPersistenceUtil.parseSignedOrder(stringSignedOrder);
		const orderHash = this.web3Util ? await this.web3Util.validateOrder(parsedSignedorder) : '';
		if (
			orderHash &&
			orderHash === req.orderHash &&
			this.web3Util &&
			(await this.web3Util.validateOrderFillable(parsedSignedorder))
		) {
			util.logDebug('order valided, persisting');
			try {
				const userOrder = await orderPersistenceUtil.persistOrder({
					method: req.method,
					status: CST.DB_CONFIRMED,
					requestor: CST.DB_RELAYER,
					pair: req.pair,
					orderHash: orderHash,
					balance: -1,
					side: this.web3Util.getSideFromSignedOrder(stringSignedOrder, req.pair),
					signedOrder: stringSignedOrder
				});
				if (userOrder) this.sendUserOrderResponse(ws, userOrder, req.method);
				else this.sendErrorOrderResponse(ws, req, CST.WS_INVALID_ORDER);
			} catch (error) {
				util.logError(error);
				this.sendErrorOrderResponse(ws, req, CST.WS_ERROR);
			}
		} else {
			util.logDebug('invalid orderHash, ignore');
			this.sendErrorOrderResponse(ws, req, CST.WS_INVALID_ORDER);
		}
	}

	public async handleTerminateOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		util.logDebug(`terminate order ${req.orderHash}`);
		if (req.orderHash)
			try {
				const userOrder = await orderPersistenceUtil.persistOrder({
					method: req.method,
					status: CST.DB_CONFIRMED,
					requestor: CST.DB_RELAYER,
					pair: req.pair,
					orderHash: req.orderHash,
					balance: -1
				});
				if (userOrder) this.sendUserOrderResponse(ws, userOrder, req.method);
				else this.sendErrorOrderResponse(ws, req, CST.WS_INVALID_ORDER);
			} catch (error) {
				util.logError(error);
				this.sendErrorOrderResponse(ws, req, CST.WS_ERROR);
			}
		else {
			util.logDebug('invalid request, ignore');
			this.sendErrorOrderResponse(ws, req, CST.WS_INVALID_REQ);
		}
	}

	public handleOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		if (![CST.DB_ADD, CST.DB_TERMINATE].includes(req.method) || !req.orderHash) {
			this.sendErrorOrderResponse(ws, req, CST.WS_INVALID_REQ);
			return Promise.resolve();
		}

		if (req.method === CST.DB_ADD)
			return this.handleAddOrderRequest(ws, req as IWsAddOrderRequest);
		// if (req.method === CST.DB_TERMINATE)
		else return this.handleTerminateOrderRequest(ws, req);
	}

	public handleOrderBookUpdate(
		channel: string,
		orderBookSnapshotUpdate: IOrderBookSnapshotUpdate
	) {
		const pair = channel.split('|')[2];
		if (!this.orderBookPairs[pair] || !this.orderBookPairs[pair].length) return;

		this.orderBookPairs[pair].forEach(ws => {
			const orderBookResponse: IWsOrderBookUpdateResponse = {
				method: CST.DB_UPDATE,
				channel: CST.DB_ORDER_BOOKS,
				status: CST.WS_OK,
				pair: pair,
				orderBookUpdate: orderBookSnapshotUpdate
			};
			util.safeWsSend(ws, JSON.stringify(orderBookResponse));
		});
	}

	public async handleOrderBookSubscribeRequest(ws: WebSocket, req: IWsRequest) {
		if (!this.orderBookPairs[req.pair] || !this.orderBookPairs[req.pair].length) {
			this.orderBookPairs[req.pair] = [ws];
			orderBookPersistenceUtil.subscribeOrderBookUpdate(req.pair, (c, obsu) =>
				this.handleOrderBookUpdate(c, obsu)
			);
		} else if (!this.orderBookPairs[req.pair].includes(ws))
			this.orderBookPairs[req.pair].push(ws);

		const snapshot = await orderBookPersistenceUtil.getOrderBookSnapshot(req.pair);
		if (!snapshot) {
			this.sendResponse(ws, req, CST.WS_ERROR);
			return Promise.resolve();
		}

		const orderBookResponse: IWsOrderBookResponse = {
			method: CST.DB_SNAPSHOT,
			channel: CST.DB_ORDER_BOOKS,
			status: CST.WS_OK,
			pair: req.pair,
			orderBookSnapshot: snapshot
		};
		util.safeWsSend(ws, JSON.stringify(orderBookResponse));
	}

	private unsubscribeOrderBook(ws: WebSocket, pair: string) {
		if (this.orderBookPairs[pair] && this.orderBookPairs[pair].includes(ws)) {
			this.orderBookPairs[pair] = this.orderBookPairs[pair].filter(e => e !== ws);
			if (!this.orderBookPairs[pair].length) {
				delete this.orderBookPairs[pair];
				orderBookPersistenceUtil.unsubscribeOrderBookUpdate(pair);
			}
		}
	}

	public handleOrderBookUnsubscribeRequest(ws: WebSocket, req: IWsRequest) {
		this.unsubscribeOrderBook(ws, req.pair);
		this.sendResponse(ws, req, CST.WS_OK);
	}

	public handleOrderBookRequest(ws: WebSocket, req: IWsRequest) {
		if (![CST.WS_SUB, CST.WS_UNSUB].includes(req.method)) {
			this.sendResponse(ws, req, CST.WS_INVALID_REQ);
			return Promise.resolve();
		}

		if (req.method === CST.WS_SUB) return this.handleOrderBookSubscribeRequest(ws, req);
		else {
			this.handleOrderBookUnsubscribeRequest(ws, req);
			return Promise.resolve;
		}
	}

	public async handleOrderHistorySubscribeRequest(ws: WebSocket, req: IWsOrderHistoryRequest) {
		const { account, pair } = req;
		if (!this.clientPairs[account]) this.clientPairs[account] = {};
		if (!this.clientPairs[account][pair]) this.clientPairs[account][pair] = [];
		if (!this.clientPairs[account][pair].includes(ws)) this.clientPairs[account][pair].push(ws);

		const now = util.getUTCNowTimestamp();
		const userOrders = await dynamoUtil.getUserOrders(account, now - 30 * 86400000, now, pair);

		const orderBookResponse: IWsOrderHistoryResponse = {
			method: CST.WS_ORDER_HISTORY,
			channel: CST.WS_ORDER_HISTORY,
			status: CST.WS_OK,
			pair: req.pair,
			orderHistory: userOrders
		};
		util.safeWsSend(ws, JSON.stringify(orderBookResponse));
	}

	private unsubscribeOrderHistory(ws: WebSocket, account: string, pair: string) {
		if (
			this.clientPairs[account] &&
			this.clientPairs[account][pair] &&
			this.clientPairs[account][pair].includes(ws)
		) {
			this.clientPairs[account][pair] = this.clientPairs[account][pair].filter(e => e !== ws);
			if (!this.clientPairs[account][pair].length) delete this.clientPairs[account][pair];
			if (!Object.keys(this.clientPairs[account]).length) delete this.clientPairs[account];
		}
	}

	public handleOrderHistoryUnsubscribeRequest(ws: WebSocket, req: IWsOrderHistoryRequest) {
		this.unsubscribeOrderHistory(ws, req.account, req.pair);
		this.sendResponse(ws, req, CST.WS_OK);
	}

	public handleOrderHistoryRequest(ws: WebSocket, req: IWsOrderHistoryRequest) {
		if (![CST.WS_SUB, CST.WS_UNSUB].includes(req.method) || !req.account) {
			this.sendResponse(ws, req, CST.WS_INVALID_REQ);
			return Promise.resolve();
		}

		if (req.method === CST.WS_SUB) return this.handleOrderHistorySubscribeRequest(ws, req);
		else {
			this.handleOrderHistoryUnsubscribeRequest(ws, req);
			return Promise.resolve;
		}
	}

	public handleWebSocketMessage(ws: WebSocket, m: string) {
		util.logDebug('received: ' + m);
		const req: IWsRequest = JSON.parse(m);
		if (
			![CST.DB_ORDERS, CST.DB_ORDER_BOOKS, CST.WS_ORDER_HISTORY].includes(req.channel) ||
			!req.method ||
			!this.web3Util ||
			!this.web3Util.isValidPair(req.pair)
		) {
			this.sendResponse(ws, req, CST.WS_INVALID_REQ);
			return Promise.resolve();
		}

		switch (req.channel) {
			case CST.DB_ORDERS:
				return this.handleOrderRequest(ws, req as IWsOrderRequest);
			case CST.DB_ORDER_BOOKS:
				return this.handleOrderBookRequest(ws, req);
			case CST.WS_ORDER_HISTORY:
				return this.handleOrderHistoryRequest(ws, req as IWsOrderHistoryRequest);
			default:
				return Promise.resolve();
		}
	}

	public sendInfo(ws: WebSocket) {
		const staticInfoResponse: IWsInfoResponse = {
			channel: CST.WS_INFO,
			method: CST.WS_INFO,
			status: CST.WS_OK,
			pair: '',
			tokens: this.web3Util ? this.web3Util.tokens : [],
			processStatus: this.processStatus
		};
		util.safeWsSend(ws, JSON.stringify(staticInfoResponse));
	}

	public handleWebSocketConnection(ws: WebSocket) {
		util.logInfo('new connection');
		if (!this.clients.includes(ws)) this.clients.push(ws);
		this.sendInfo(ws);
		ws.on('message', message => this.handleWebSocketMessage(ws, message.toString()));
		ws.on('close', () => this.handleWebSocketClose(ws));
	}

	public handleWebSocketClose(ws: WebSocket) {
		util.logInfo('connection close');
		this.clients = this.clients.filter(w => w !== ws);
		for (const pair in this.orderBookPairs) this.unsubscribeOrderBook(ws, pair);
		for (const account in this.clientPairs)
			for (const pair in this.clientPairs) this.unsubscribeOrderHistory(ws, account, pair);
	}

	public async startServer(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		this.processStatus = await dynamoUtil.scanStatus();
		const port = 8080;
		const server = https
			.createServer({
				key: fs.readFileSync('./src/keys/websocket/key.pem', 'utf8'),
				cert: fs.readFileSync('./src/keys/websocket/cert.pem', 'utf8')
			})
			.listen(port);
		this.wsServer = new WebSocket.Server({ server: server });
		util.logInfo(`started relayer service at port ${port}`);

		if (this.wsServer) {
			setInterval(async () => {
				this.processStatus = await dynamoUtil.scanStatus();
				this.clients.forEach(ws => this.sendInfo(ws));
			}, 60000);
			this.wsServer.on('connection', ws => this.handleWebSocketConnection(ws));
		}

		if (option.server) {
			dynamoUtil.updateStatus(CST.DB_RELAYER);
			setInterval(
				() =>
					dynamoUtil.updateStatus(
						CST.DB_RELAYER,
						this.wsServer ? this.wsServer.clients.size : 0
					),
				30000
			);
		}
	}
}

const relayerServer = new RelayerServer();
export default relayerServer;
