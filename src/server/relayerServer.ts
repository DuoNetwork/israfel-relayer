import * as fs from 'fs';
import * as https from 'https';
import WebSocket from 'ws';
import * as CST from '../common/constants';
import {
	IOption,
	IOrderBookSnapshot,
	IOrderBookUpdate,
	IStringSignedOrder,
	IUserOrder,
	IWsAddOrderRequest,
	IWsOrderRequest,
	IWsOrderResponse,
	IWsRequest,
	IWsResponse,
	IWsUserOrderResponse
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookUtil from '../utils/orderBookUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import redisUtil from '../utils/redisUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class RelayerServer {
	public web3Util: Web3Util | null = null;
	public wsServer: WebSocket.Server | null = null;
	public orderBooks: { [pair: string]: IOrderBookSnapshot } = {};

	public handleErrorOrderRequest(ws: WebSocket, req: IWsOrderRequest, status: string) {
		const orderResponse: IWsOrderResponse = {
			method: req.method,
			channel: req.channel,
			status: status,
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

	public handleOrderBooksUpdate(channel: string, orderBooksUpdate: string) {
		util.logInfo(`received update from obderBook server`);
		const type = channel.split('|')[1];
		const pair = channel.split('|')[2];
		if (!type || !pair) util.logDebug('wrong channel or pair');
		switch (type) {
			case CST.DB_SNAPSHOT:
				util.logInfo('new orderBookSnapshot received');
				const newSnapshot: IOrderBookSnapshot = JSON.parse(orderBooksUpdate);
				if (newSnapshot.sequence > this.orderBooks[pair].sequence)
					this.orderBooks[pair] = newSnapshot;
				if (this.wsServer)
					this.wsServer.clients.forEach(client =>
						util.safeWsSend(
							client,
							JSON.stringify({
								channel: channel,
								orderBooksUpdate: this.orderBooks[pair]
							})
						)
					);

				break;
			case CST.DB_UPDATE:
				util.logInfo('new orderBookupdate received');
				const newUpdate: IOrderBookUpdate = JSON.parse(orderBooksUpdate);
				if (this.orderBooks[pair].sequence === newUpdate.baseSequence) {
					const updateDelta = [{ price: newUpdate.price, amount: newUpdate.amount }];
					this.orderBooks[pair] = orderBookUtil.applyChangeOrderBook(
						this.orderBooks[pair],
						newUpdate.sequence,
						newUpdate.side === CST.DB_BID ? updateDelta : [],
						newUpdate.side === CST.DB_ASK ? updateDelta : []
					);

					if (this.wsServer)
						this.wsServer.clients.forEach(client =>
							util.safeWsSend(
								client,
								JSON.stringify({
									channel: channel,
									update: newUpdate
								})
							)
						);
				}

				break;
			default:
				return;
		}
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
					pair: req.pair,
					orderHash: orderHash,
					balance: -1,
					side: this.web3Util.getSideFromSignedOrder(stringSignedOrder, req.pair),
					signedOrder: stringSignedOrder
				});
				if (userOrder) this.handleUserOrder(ws, userOrder, req.method);
				else this.handleErrorOrderRequest(ws, req, CST.WS_INVALID_ORDER);
			} catch (error) {
				util.logError(error);
				this.handleErrorOrderRequest(ws, req, CST.WS_ERROR);
			}
		} else {
			util.logDebug('invalid orderHash, ignore');
			this.handleErrorOrderRequest(ws, req, CST.WS_INVALID_ORDER);
		}
	}

	public async handleTerminateOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		util.logDebug(`terminate order ${req.orderHash}`);
		if (req.orderHash)
			try {
				const userOrder = await orderPersistenceUtil.persistOrder({
					method: req.method,
					pair: req.pair,
					orderHash: req.orderHash,
					balance: -1
				});
				if (userOrder) this.handleUserOrder(ws, userOrder, req.method);
				else this.handleErrorOrderRequest(ws, req, CST.WS_INVALID_ORDER);
			} catch (error) {
				util.logError(error);
				this.handleErrorOrderRequest(ws, req, CST.WS_ERROR);
			}
		else {
			util.logDebug('invalid request, ignore');
			this.handleErrorOrderRequest(ws, req, CST.WS_INVALID_REQ);
		}
	}

	public handleOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		if (![CST.DB_ADD, CST.DB_TERMINATE].includes(req.method) || !req.orderHash) {
			this.handleErrorOrderRequest(ws, req, CST.WS_INVALID_REQ);
			return Promise.resolve();
		}

		if (req.method === CST.DB_ADD)
			return this.handleAddOrderRequest(ws, req as IWsAddOrderRequest);
		// if (req.method === CST.DB_TERMINATE)
		else return this.handleTerminateOrderRequest(ws, req);
	}

	public handleWebSocketMessage(ws: WebSocket, m: string) {
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
		let port = 8080;
		redisUtil.patternSubscribe(`${CST.DB_ORDER_BOOKS}|*`);

		redisUtil.onOrderBooks((channel, orderBooksUpdate) =>
			this.handleOrderBooksUpdate(channel, orderBooksUpdate)
		);
		if (option.server) {
			const relayerService = await dynamoUtil.getServices(CST.DB_RELAYER, true);
			if (!relayerService.length) {
				util.logInfo('no relayer service config, exit');
				return;
			}
			util.logInfo('loaded relayer service config');
			util.logInfo(JSON.stringify(relayerService[0]));
			port = Number(relayerService[0].url.split(':').slice(-1)[0]);
		}
		const server = https
			.createServer({
				key: fs.readFileSync('./src/keys/websocket/key.pem', 'utf8'),
				cert: fs.readFileSync('./src/keys/websocket/cert.pem', 'utf8')
			})
			.listen(port);
		this.wsServer = new WebSocket.Server({ server: server });
		util.logInfo(`started relayer service at port ${port}`);

		if (this.wsServer)
			this.wsServer.on('connection', ws => {
				util.logInfo('new connection');
				ws.on('message', message => this.handleWebSocketMessage(ws, message.toString()));
				ws.on('close', () => util.logInfo('connection close'));
			});

		if (option.server) {
			dynamoUtil.updateStatus(CST.DB_RELAYER);
			setInterval(
				() =>
					dynamoUtil.updateStatus(
						CST.DB_RELAYER,
						this.wsServer ? this.wsServer.clients.size : 0
					),
				10000
			);
		}
	}
}

const relayerServer = new RelayerServer();
export default relayerServer;
