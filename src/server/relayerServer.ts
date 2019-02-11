import {
	Constants as DataConstants,
	DynamoUtil as DuoDynamoUtil,
	IAcceptedPrice,
	IPrice
} from '@finbook/duo-market-data';
import {
	Constants,
	IOrderBookSnapshotUpdate,
	IStatus,
	IStringSignedOrder,
	ITrade,
	IUserOrder,
	IWsAddOrderRequest,
	IWsInfoResponse,
	IWsOrderBookResponse,
	IWsOrderBookUpdateResponse,
	IWsOrderHistoryRequest,
	IWsOrderHistoryResponse,
	IWsOrderResponse,
	IWsRequest,
	IWsResponse,
	IWsTerminateOrderRequest,
	IWsTradeResponse,
	IWsUserOrderResponse,
	OrderUtil,
	Util,
	Web3Util
} from '@finbook/israfel-common';
import * as fs from 'fs';
import * as https from 'https';
import WebSocket, { VerifyClientCallbackSync } from 'ws';
import { IOption, IOrderQueueItem } from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import tradePriceUtil from '../utils/tradePriceUtil';

class RelayerServer {
	public processStatus: IStatus[] = [];
	public web3Util: Web3Util | null = null;
	public tradePairs: { [pair: string]: WebSocket[] } = {};
	public orderBookPairs: { [pair: string]: WebSocket[] } = {};
	public accountClients: { [account: string]: WebSocket[] } = {};
	public duoAcceptedPrices: { [custodian: string]: IAcceptedPrice[] } = {};
	public duoExchangePrices: { [source: string]: IPrice[] } = {};
	public marketTrades: { [pair: string]: ITrade[] } = {};
	public ipList: { [ip: string]: string } = {};
	public connectedIp: { [ip: string]: number[] } = {};

	public sendResponse(ws: WebSocket, req: IWsRequest, status: string) {
		const orderResponse: IWsResponse = {
			method: req.method,
			channel: req.channel,
			status: status,
			pair: req.pair
		};
		Util.safeWsSend(ws, JSON.stringify(orderResponse));
	}

	public sendErrorOrderResponse(
		ws: WebSocket,
		req: IWsRequest,
		orderHash: string,
		status: string
	) {
		const orderResponse: IWsOrderResponse = {
			method: req.method,
			channel: req.channel,
			status: status,
			pair: req.pair,
			orderHash: orderHash
		};
		Util.safeWsSend(ws, JSON.stringify(orderResponse));
	}

	public sendUserOrderResponse(ws: WebSocket, userOrder: IUserOrder, method: string) {
		const orderResponse: IWsUserOrderResponse = {
			method: method,
			channel: Constants.DB_ORDERS,
			status: Constants.WS_OK,
			pair: userOrder.pair,
			orderHash: userOrder.orderHash,
			userOrder: userOrder
		};
		Util.safeWsSend(ws, JSON.stringify(orderResponse));
	}

	public async handleAddOrderRequest(ws: WebSocket, req: IWsAddOrderRequest) {
		Util.logDebug(`add new order ${req.orderHash}`);
		if (!req.orderHash || !this.web3Util) {
			Util.logDebug('invalid request, ignore');
			this.sendResponse(ws, req, Constants.WS_INVALID_REQ);
			return;
		}
		const stringSignedOrder = req.order as IStringSignedOrder;
		const token = this.web3Util.getTokenByCode(req.pair.split('|')[0]);
		if (!token) {
			Util.logDebug('invalid token, ignore');
			this.sendErrorOrderResponse(ws, req, req.orderHash, Constants.WS_INVALID_ORDER);
			return;
		}

		try {
			const orderHash = await OrderUtil.validateOrder(
				this.web3Util,
				req.pair,
				token,
				stringSignedOrder
			);
			if (orderHash === req.orderHash) {
				Util.logDebug('order valided, persisting');

				const userOrder = await orderPersistenceUtil.persistOrder({
					method: req.method,
					status: Constants.DB_CONFIRMED,
					requestor: Constants.DB_RELAYER,
					pair: req.pair,
					orderHash: orderHash,
					token: token,
					signedOrder: stringSignedOrder
				});
				if (userOrder) this.sendUserOrderResponse(ws, userOrder, req.method);
				else
					this.sendErrorOrderResponse(ws, req, req.orderHash, Constants.WS_INVALID_ORDER);
			} else {
				Util.logDebug('invalid orderHash, ignore');
				this.sendErrorOrderResponse(ws, req, req.orderHash, orderHash);
			}
		} catch (error) {
			Util.logError(error);
			this.sendErrorOrderResponse(ws, req, req.orderHash, Constants.WS_ERROR);
		}
	}

	public async handleTerminateOrderRequest(ws: WebSocket, req: IWsTerminateOrderRequest) {
		Util.logDebug(`terminate order ${req.orderHashes.join(',')}`);
		if (!req.orderHashes.length || !this.web3Util) {
			Util.logDebug('invalid request, ignore');
			this.sendResponse(ws, req, Constants.WS_INVALID_REQ);
			return;
		}
		const { pair, orderHashes, signature } = req;
		const account = this.web3Util
			.web3AccountsRecover(Constants.TERMINATE_SIGN_MSG + orderHashes.join(','), signature)
			.toLowerCase();
		Util.logDebug(`recovered account: ${account}`);
		for (const orderHash of orderHashes) {
			const rawOrder = await orderPersistenceUtil.getRawOrderInPersistence(pair, orderHash);
			Util.logDebug(`rawOrder account: ${rawOrder ? rawOrder.signedOrder.makerAddress : ''}`);
			if (account && rawOrder && rawOrder.signedOrder.makerAddress === account)
				try {
					const userOrder = await orderPersistenceUtil.persistOrder({
						method: req.method,
						status: Constants.DB_CONFIRMED,
						requestor: Constants.DB_RELAYER,
						pair: req.pair,
						orderHash: orderHash
					});
					if (userOrder) this.sendUserOrderResponse(ws, userOrder, req.method);
					else
						this.sendErrorOrderResponse(ws, req, orderHash, Constants.WS_INVALID_ORDER);
				} catch (error) {
					Util.logError(error);
					this.sendErrorOrderResponse(ws, req, orderHash, Constants.WS_ERROR);
				}
			else {
				Util.logDebug('invalid order, ignore');
				this.sendErrorOrderResponse(ws, req, orderHash, Constants.WS_INVALID_ORDER);
			}
		}
	}

	public async handleOrderHistorySubscribeRequest(ws: WebSocket, req: IWsOrderHistoryRequest) {
		if (this.web3Util) {
			const { account } = req;
			if (Util.isEmptyObject(this.accountClients)) {
				const deadline = Util.getUTCNowTimestamp();
				const tokens = this.web3Util.tokens;
				for (const token of tokens)
					if (!token.maturity || token.maturity > deadline)
						for (const code in token.feeSchedules)
							orderPersistenceUtil.subscribeOrderUpdate(
								`${token.code}|${code}`,
								(channel, orderQueueItem) =>
									this.handleOrderUpdate(channel, orderQueueItem)
							);
			}

			if (!this.accountClients[account]) this.accountClients[account] = [];
			if (!this.accountClients[account].includes(ws)) this.accountClients[account].push(ws);

			const now = Util.getUTCNowTimestamp();
			const userOrders = await dynamoUtil.getUserOrders(account, now - 30 * 86400000, now);

			const orderBookResponse: IWsOrderHistoryResponse = {
				method: Constants.WS_HISTORY,
				channel: Constants.DB_ORDERS,
				status: Constants.WS_OK,
				pair: '',
				orderHistory: userOrders
			};
			Util.safeWsSend(ws, JSON.stringify(orderBookResponse));
		} else {
			const orderBookResponse: IWsResponse = {
				method: Constants.WS_HISTORY,
				channel: Constants.DB_ORDERS,
				status: Constants.WS_ERROR,
				pair: ''
			};
			Util.safeWsSend(ws, JSON.stringify(orderBookResponse));
		}
	}

	public unsubscribeOrderHistory(ws: WebSocket, account: string) {
		if (this.accountClients[account] && this.accountClients[account].includes(ws)) {
			this.accountClients[account] = this.accountClients[account].filter(e => e !== ws);
			if (!this.accountClients[account].length) delete this.accountClients[account];

			if (Util.isEmptyObject(this.accountClients) && this.web3Util) {
				const tokens = this.web3Util.tokens;
				for (const token of tokens)
					for (const code in token.feeSchedules)
						orderPersistenceUtil.unsubscribeOrderUpdate(`${token.code}|${code}`);
			}
		}
	}

	public handleOrderHistoryUnsubscribeRequest(ws: WebSocket, req: IWsOrderHistoryRequest) {
		this.unsubscribeOrderHistory(ws, req.account);
		this.sendResponse(ws, req, Constants.WS_OK);
	}

	public handleOrderRequest(ws: WebSocket, req: IWsRequest) {
		if (
			[Constants.WS_SUB, Constants.WS_UNSUB].includes(req.method) &&
			!(req as IWsOrderHistoryRequest).account
		) {
			this.sendResponse(ws, req, Constants.WS_INVALID_REQ);
			return Promise.resolve();
		}

		if (
			[Constants.DB_ADD, Constants.DB_TERMINATE].includes(req.method) &&
			(!this.web3Util || !this.web3Util.isValidPair(req.pair))
		) {
			this.sendResponse(ws, req, Constants.WS_INVALID_REQ);
			return Promise.resolve();
		}

		switch (req.method) {
			case Constants.WS_SUB:
				return this.handleOrderHistorySubscribeRequest(ws, req as IWsOrderHistoryRequest);
			case Constants.WS_UNSUB:
				this.handleOrderHistoryUnsubscribeRequest(ws, req as IWsOrderHistoryRequest);
				return Promise.resolve();
			case Constants.DB_ADD:
				return this.handleAddOrderRequest(ws, req as IWsAddOrderRequest);
			case Constants.DB_TERMINATE:
				return this.handleTerminateOrderRequest(ws, req as IWsTerminateOrderRequest);
			default:
				this.sendResponse(ws, req, Constants.WS_INVALID_REQ);
				return Promise.resolve();
		}
	}

	public handleOrderUpdate(channel: string, orderQueueItem: IOrderQueueItem) {
		Util.logDebug('receive update from channel: ' + channel);
		if (orderQueueItem.requestor === Constants.DB_RELAYER) {
			Util.logDebug('ignore order update requested by self');
			return;
		}

		const { account } = orderQueueItem.liveOrder;
		if (this.accountClients[account] && this.accountClients[account].length) {
			const userOrder = OrderUtil.constructUserOrder(
				orderQueueItem.liveOrder,
				orderQueueItem.method,
				orderQueueItem.status,
				orderQueueItem.requestor,
				true,
				orderQueueItem.transactionHash
			);
			this.accountClients[account].forEach(ws =>
				this.sendUserOrderResponse(ws, userOrder, orderQueueItem.method)
			);
		}
	}

	public handleOrderBookUpdate(
		channel: string,
		orderBookSnapshotUpdate: IOrderBookSnapshotUpdate
	) {
		Util.logDebug(`received order book updates from channel ${channel}`);
		const pair = orderBookSnapshotUpdate.pair;
		if (!this.orderBookPairs[pair] || !this.orderBookPairs[pair].length) return;

		this.orderBookPairs[pair].forEach(ws => {
			const orderBookResponse: IWsOrderBookUpdateResponse = {
				method: Constants.DB_UPDATE,
				channel: Constants.DB_ORDER_BOOKS,
				status: Constants.WS_OK,
				pair: pair,
				orderBookUpdate: orderBookSnapshotUpdate
			};
			Util.safeWsSend(ws, JSON.stringify(orderBookResponse));
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
			this.sendResponse(ws, req, Constants.WS_ERROR);
			return Promise.resolve();
		}

		const orderBookResponse: IWsOrderBookResponse = {
			method: Constants.DB_SNAPSHOT,
			channel: Constants.DB_ORDER_BOOKS,
			status: Constants.WS_OK,
			pair: req.pair,
			orderBookSnapshot: snapshot
		};
		Util.safeWsSend(ws, JSON.stringify(orderBookResponse));
	}

	public unsubscribeOrderBook(ws: WebSocket, pair: string) {
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
		this.sendResponse(ws, req, Constants.WS_OK);
	}

	public handleOrderBookRequest(ws: WebSocket, req: IWsRequest) {
		if (
			![Constants.WS_SUB, Constants.WS_UNSUB].includes(req.method) ||
			!this.web3Util ||
			!this.web3Util.isValidPair(req.pair)
		) {
			this.sendResponse(ws, req, Constants.WS_INVALID_REQ);
			return Promise.resolve();
		}

		if (req.method === Constants.WS_SUB) return this.handleOrderBookSubscribeRequest(ws, req);
		else {
			this.handleOrderBookUnsubscribeRequest(ws, req);
			return Promise.resolve();
		}
	}

	public handleTradeUpdate(channel: string, trade: ITrade) {
		Util.logDebug('receive update from channel: ' + channel);
		const pair = trade.pair;
		if (!this.marketTrades[pair]) this.marketTrades[pair] = [trade];
		else {
			this.marketTrades[pair].push(trade);
			this.marketTrades[pair].sort((a, b) => a.timestamp - b.timestamp);
			this.marketTrades[pair].slice(1, 21);
		}

		if (!this.tradePairs[pair] || !this.tradePairs[pair].length) return;

		this.tradePairs[pair].forEach(ws => {
			const tradeResponse: IWsTradeResponse = {
				method: Constants.DB_UPDATE,
				channel: Constants.DB_TRADES,
				status: Constants.WS_OK,
				pair: pair,
				trades: [trade]
			};
			Util.safeWsSend(ws, JSON.stringify(tradeResponse));
		});
	}

	public handleTradeSubscribeRequest(ws: WebSocket, req: IWsRequest) {
		if (!this.tradePairs[req.pair] || !this.tradePairs[req.pair].length)
			this.tradePairs[req.pair] = [ws];
		else if (!this.tradePairs[req.pair].includes(ws)) this.tradePairs[req.pair].push(ws);

		const tradeResponse: IWsTradeResponse = {
			method: Constants.DB_TRADES,
			channel: Constants.DB_TRADES,
			status: Constants.WS_OK,
			pair: req.pair,
			trades: this.marketTrades[req.pair]
		};
		Util.safeWsSend(ws, JSON.stringify(tradeResponse));
	}

	public unsubscribeTrade(ws: WebSocket, pair: string) {
		if (this.tradePairs[pair] && this.tradePairs[pair].includes(ws)) {
			this.tradePairs[pair] = this.tradePairs[pair].filter(e => e !== ws);
			if (!this.tradePairs[pair].length) delete this.tradePairs[pair];
		}
	}

	public handleTradeUnsubscribeRequest(ws: WebSocket, req: IWsRequest) {
		this.unsubscribeTrade(ws, req.pair);
		this.sendResponse(ws, req, Constants.WS_OK);
	}

	public handleTradeRequest(ws: WebSocket, req: IWsRequest) {
		if (
			![Constants.WS_SUB, Constants.WS_UNSUB].includes(req.method) ||
			!this.web3Util ||
			!this.web3Util.isValidPair(req.pair)
		) {
			this.sendResponse(ws, req, Constants.WS_INVALID_REQ);
			return;
		}

		if (req.method === Constants.WS_SUB) this.handleTradeSubscribeRequest(ws, req);
		else this.handleTradeUnsubscribeRequest(ws, req);
	}

	public handleWebSocketMessage(ws: WebSocket, ip: string, m: string) {
		Util.logDebug('received: ' + m + ' from ' + ip);
		const req: IWsRequest = JSON.parse(m);

		switch (req.channel) {
			case Constants.DB_ORDERS:
				return this.handleOrderRequest(ws, req);
			case Constants.DB_ORDER_BOOKS:
				return this.handleOrderBookRequest(ws, req);
			case Constants.DB_TRADES:
				this.handleTradeRequest(ws, req);
				return Promise.resolve();
			default:
				this.sendResponse(ws, req, Constants.WS_INVALID_REQ);
				return Promise.resolve();
		}
	}

	public sendInfo(ws: WebSocket) {
		const staticInfoResponse: IWsInfoResponse = {
			channel: Constants.WS_INFO,
			method: Constants.WS_INFO,
			status: Constants.WS_OK,
			pair: '',
			acceptedPrices: this.duoAcceptedPrices,
			exchangePrices: this.duoExchangePrices,
			tokens: this.web3Util ? this.web3Util.tokens : [],
			processStatus: this.processStatus
		};
		Util.safeWsSend(ws, JSON.stringify(staticInfoResponse));
	}

	public handleWebSocketConnection(ws: WebSocket, ip: string) {
		Util.logInfo('new connection');
		this.sendInfo(ws);
		ws.on('message', message => this.handleWebSocketMessage(ws, ip, message.toString()));
		ws.on('close', () => this.handleWebSocketClose(ws, ip));
	}

	public handleWebSocketClose(ws: WebSocket, ip: string) {
		Util.logInfo('connection close from ' + ip);
		for (const pair in this.orderBookPairs) this.unsubscribeOrderBook(ws, pair);
		for (const pair in this.tradePairs) this.unsubscribeTrade(ws, pair);
		for (const account in this.accountClients) this.unsubscribeOrderHistory(ws, account);
	}

	public async loadDuoAcceptedPrices(duoDynamoUtil: DuoDynamoUtil) {
		if (this.web3Util) {
			const custodians: string[] = [];
			for (const token of this.web3Util.tokens)
				if (!custodians.includes(token.custodian)) custodians.push(token.custodian);
			if (!custodians.length) {
				Util.logDebug('no custodian, skip loading duo accepted prices');
				return;
			}
			const dates = Util.getDates(8, 1, 'day', 'YYYY-MM-DD');
			for (const custodian of custodians)
				this.duoAcceptedPrices[custodian] = await duoDynamoUtil.queryAcceptPriceEvent(
					Web3Util.toChecksumAddress(custodian),
					dates
				);
			Util.logDebug('loaded duo accepted prices');
		}
	}

	public async loadDuoExchangePrices(duoDynamoUtil: DuoDynamoUtil) {
		const start = Util.getUTCNowTimestamp() - 24 * 3600000;
		for (const source of [
			DataConstants.API_GDAX,
			DataConstants.API_GEMINI,
			DataConstants.API_KRAKEN,
			DataConstants.API_BITSTAMP
		])
			this.duoExchangePrices[source] = await duoDynamoUtil.getPrices(
				source,
				60,
				start,
				0,
				'ETH|USD'
			);
		Util.logDebug('loaded duo exchange prices');
	}

	public async loadAndSubscribeMarketTrades() {
		if (this.web3Util) {
			const now = Util.getUTCNowTimestamp();
			const start = now - 3600000 * 2;
			for (const token of this.web3Util.tokens) {
				const pair = token.code + '|' + Constants.TOKEN_WETH;
				const trades = await dynamoUtil.getTrades(pair, start, now);
				this.marketTrades[pair] = trades;
				tradePriceUtil.subscribeTradeUpdate(pair, (c, trade) =>
					this.handleTradeUpdate(c, trade)
				);
			}
		}
	}

	public async initializeCache(web3Util: Web3Util, duoDynamoUtil: DuoDynamoUtil) {
		web3Util.setTokens(await dynamoUtil.scanTokens());
		global.setInterval(async () => web3Util.setTokens(await dynamoUtil.scanTokens()), 3600000);
		await this.loadDuoAcceptedPrices(duoDynamoUtil);
		await this.loadDuoExchangePrices(duoDynamoUtil);
		await this.loadAndSubscribeMarketTrades();
		global.setInterval(() => this.loadDuoAcceptedPrices(duoDynamoUtil), 600000);
		this.ipList = await dynamoUtil.scanIpList();
		this.processStatus = await dynamoUtil.scanStatus();
		Util.logDebug('loaded ip list and status');
		global.setInterval(async () => {
			await this.loadDuoExchangePrices(duoDynamoUtil);
			this.ipList = await dynamoUtil.scanIpList();
			this.processStatus = await dynamoUtil.scanStatus();
			Util.logDebug('loaded up ip list and status');
		}, 30000);
	}

	public verifyClient: VerifyClientCallbackSync = info => {
		const ip = (info.req.headers['x-forwarded-for'] ||
			info.req.connection.remoteAddress) as string;
		Util.logDebug(ip);
		if (this.ipList[ip] === Constants.DB_BLACK) {
			Util.logDebug(`ip ${ip} in blacklist, refuse connection`);
			return false;
		} else if (this.ipList[ip] === Constants.DB_WHITE) return true;

		const currentTs = Util.getUTCNowTimestamp();
		if (!this.connectedIp[ip] || !this.connectedIp[ip].length) {
			this.connectedIp[ip] = [currentTs];
			return true;
		}

		const lastConnectionTs = this.connectedIp[ip][this.connectedIp[ip].length - 1];
		this.connectedIp[ip].push(currentTs);
		this.connectedIp[ip] = this.connectedIp[ip].filter(ts => ts > currentTs - 60000);
		if (this.connectedIp[ip].length > 20) {
			this.ipList[ip] = Constants.DB_BLACK;
			dynamoUtil.updateIpList(ip, Constants.DB_BLACK);
			delete this.connectedIp[ip];
			return false;
		} else if (currentTs - lastConnectionTs < 3000) {
			Util.logDebug(`ip ${ip} connects to frequently, refuse this connection request`);
			return false;
		}

		return true;
	};

	public initializeWsServer(wsServer: WebSocket.Server) {
		global.setInterval(() => wsServer.clients.forEach(ws => this.sendInfo(ws)), 30000);
		wsServer.on('connection', (ws, req) =>
			this.handleWebSocketConnection(ws, (req.headers['x-forwarded-for'] ||
				req.connection.remoteAddress) as string)
		);
	}

	public async startServer(config: object, option: IOption) {
		const live = option.env === Constants.DB_LIVE;
		let infura = { token: '' };
		try {
			infura = require('../keys/infura.json');
		} catch (error) {
			Util.logError(error);
		}
		this.web3Util = new Web3Util(
			null,
			(live ? Constants.PROVIDER_INFURA_MAIN : Constants.PROVIDER_INFURA_KOVAN) +
				'/' +
				infura.token,
			'',
			live
		);
		const duoDynamoUtil = new DuoDynamoUtil(
			config,
			option.env === Constants.DB_LIVE,
			Constants.DB_RELAYER
		);
		await this.initializeCache(this.web3Util, duoDynamoUtil);
		const port = 8080;
		const wsServer = new WebSocket.Server({
			server: https
				.createServer({
					key: fs.readFileSync(`./src/keys/websocket/key.${option.env}.pem`, 'utf8'),
					cert: fs.readFileSync(`./src/keys/websocket/cert.${option.env}.pem`, 'utf8')
				})
				.listen(port),
			verifyClient: this.verifyClient
		});
		Util.logInfo(`started relayer service at port ${port}`);
		this.initializeWsServer(wsServer);
		if (option.server) {
			dynamoUtil.updateStatus(Constants.DB_RELAYER);
			global.setInterval(
				() => dynamoUtil.updateStatus(Constants.DB_RELAYER, wsServer.clients.size),
				30000
			);
		}
	}
}

const relayerServer = new RelayerServer();
export default relayerServer;
