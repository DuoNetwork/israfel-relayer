import * as fs from 'fs';
import * as https from 'https';
import WebSocket from 'ws';
import * as CST from '../common/constants';
import {
	IOption,
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
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class RelayerServer {
	public web3Util: Web3Util | null = null;
	public relayerWsServer: WebSocket.Server | null = null;

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

	public async handleAddOrderRequest(ws: WebSocket, req: IWsAddOrderRequest) {
		util.logDebug(`add new order ${req.orderHash}`);
		const stringSignedOrder = req.order as IStringSignedOrder;

		const parsedSignedorder = orderPersistenceUtil.parseSignedOrder(stringSignedOrder);
		const orderHash = this.web3Util ? await this.web3Util.validateOrder(parsedSignedorder) : '';
		if (orderHash && orderHash === req.orderHash)
			try {
				const userOrder = await orderPersistenceUtil.persistOrder(
					{
						method: req.method,
						pair: req.pair,
						orderHash: orderHash,
						amount: -1,
						signedOrder: stringSignedOrder
					},
					true
				);
				if (userOrder) this.handleUserOrder(ws, userOrder, req.method);
				else this.handleErrorOrderRequest(ws, req, CST.WS_INVALID_ORDER);
			} catch (error) {
				util.logError(error);
				this.handleErrorOrderRequest(ws, req, CST.WS_ERROR);
			}
		else {
			util.logDebug('invalid orderHash, ignore');
			this.handleErrorOrderRequest(ws, req, CST.WS_INVALID_ORDER);
		}
	}

	public async handleTerminateOrderRequest(ws: WebSocket, req: IWsOrderRequest) {
		util.logDebug(`terminate order ${req.orderHash}`);
		if (req.orderHash)
			try {
				const userOrder = await orderPersistenceUtil.persistOrder(
					{
						method: req.method,
						pair: req.pair,
						orderHash: req.orderHash,
						amount: 0,
					},
					true
				);
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
