import * as fs from 'fs';
import * as https from 'https';
import WebSocket from 'ws';
import * as CST from '../common/constants';
import {
	IOption,
	IOrderBookSnapshotUpdate,
	IOrderQueueItem,
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
	public pairClients: { [pair: string]: { [account: string]: WebSocket[] } } = {};

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

	public sendUserOrderResponse(ws: WebSocket, userOrder: IUserOrder, method: string) {
		const orderResponse: IWsUserOrderResponse = {
			method: method,
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

	public async handleOrderHistorySubscribeRequest(ws: WebSocket, req: IWsOrderHistoryRequest) {
		const { account, pair } = req;
		if (!this.pairClients[pair]) {
			this.pairClients[pair] = {};
			orderPersistenceUtil.subscribeOrderUpdate(pair, (channel, orderQueueItem) =>
				this.handleOrderUpdate(channel, orderQueueItem)
			);
		}
		if (!this.pairClients[pair][account]) this.pairClients[pair][account] = [];

		if (!this.pairClients[pair][account].includes(ws)) this.pairClients[pair][account].push(ws);

		const now = util.getUTCNowTimestamp();
		const userOrders = await dynamoUtil.getUserOrders(account, now - 30 * 86400000, now, pair);

		const orderBookResponse: IWsOrderHistoryResponse = {
			method: CST.WS_HISTORY,
			channel: CST.DB_ORDERS,
			status: CST.WS_OK,
			pair: req.pair,
			orderHistory: userOrders
		};
		util.safeWsSend(ws, JSON.stringify(orderBookResponse));
	}

	private unsubscribeOrderHistory(ws: WebSocket, account: string, pair: string) {
		if (
			this.pairClients[pair] &&
			this.pairClients[pair][account] &&
			this.pairClients[pair][account].includes(ws)
		) {
			this.pairClients[pair][account] = this.pairClients[pair][account].filter(e => e !== ws);
			if (!this.pairClients[pair][account].length) delete this.pairClients[pair][account];

			if (!Object.keys(this.pairClients[pair]).length) {
				delete this.pairClients[pair];
				orderPersistenceUtil.unsubscribeOrderUpdate(pair);
			}
		}
	}

	public handleOrderHistoryUnsubscribeRequest(ws: WebSocket, req: IWsOrderHistoryRequest) {
		this.unsubscribeOrderHistory(ws, req.account, req.pair);
		this.sendResponse(ws, req, CST.WS_OK);
	}

	public handleOrderRequest(ws: WebSocket, req: IWsRequest) {
		if (
			[CST.WS_SUB, CST.WS_UNSUB].includes(req.method) &&
			!(req as IWsOrderHistoryRequest).account
		) {
			this.sendResponse(ws, req, CST.WS_INVALID_REQ);
			return Promise.resolve();
		}

		if (
			[CST.DB_ADD, CST.DB_TERMINATE].includes(req.method) &&
			!(req as IWsOrderRequest).orderHash
		) {
			this.sendErrorOrderResponse(ws, req as IWsOrderRequest, CST.WS_INVALID_REQ);
			return Promise.resolve();
		}

		switch (req.method) {
			case CST.WS_SUB:
				return this.handleOrderHistorySubscribeRequest(ws, req as IWsOrderHistoryRequest);
			case CST.WS_UNSUB:
				this.handleOrderHistoryUnsubscribeRequest(ws, req as IWsOrderHistoryRequest);
				return Promise.resolve;
			case CST.DB_ADD:
				return this.handleAddOrderRequest(ws, req as IWsAddOrderRequest);
			case CST.DB_TERMINATE:
				return this.handleTerminateOrderRequest(ws, req as IWsOrderRequest);
			default:
				this.sendResponse(ws, req, CST.WS_INVALID_REQ);
				return Promise.resolve();
		}
	}

	public handleOrderUpdate(channel: string, orderQueueItem: IOrderQueueItem) {
		util.logDebug('receive update from channel: ' + channel);
		if (orderQueueItem.requestor === CST.DB_RELAYER) {
			util.logDebug('ignore order update requested by self');
			return;
		}

		const { account, pair } = orderQueueItem.liveOrder;
		if (
			this.pairClients[pair] &&
			this.pairClients[pair][account] &&
			this.pairClients[pair][account].length
		) {
			const userOrder = orderPersistenceUtil.constructUserOrder(
				orderQueueItem.liveOrder,
				orderQueueItem.method,
				orderQueueItem.status,
				orderQueueItem.requestor,
				true
			);
			this.pairClients[pair][account].forEach(ws =>
				this.sendUserOrderResponse(ws, userOrder, orderQueueItem.method)
			);
		}
	}

	public handleOrderBookUpdate(
		channel: string,
		orderBookSnapshotUpdate: IOrderBookSnapshotUpdate
	) {
		const parts = channel.split('|');
		const pair = parts[2] + '|' + parts[3];
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

	public handleWebSocketMessage(ws: WebSocket, m: string) {
		util.logDebug('received: ' + m);
		const req: IWsRequest = JSON.parse(m);
		if (
			![CST.DB_ORDERS, CST.DB_ORDER_BOOKS].includes(req.channel) ||
			!req.method ||
			!this.web3Util ||
			!this.web3Util.isValidPair(req.pair)
		) {
			this.sendResponse(ws, req, CST.WS_INVALID_REQ);
			return Promise.resolve();
		}

		switch (req.channel) {
			case CST.DB_ORDERS:
				return this.handleOrderRequest(ws, req);
			case CST.DB_ORDER_BOOKS:
				return this.handleOrderBookRequest(ws, req);
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
		for (const pair in this.pairClients)
			for (const account in this.pairClients[pair])
				this.unsubscribeOrderHistory(ws, account, pair);
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
