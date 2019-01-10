import * as fs from 'fs';
import * as https from 'https';
import WebSocket, { VerifyClientCallbackSync } from 'ws';
import { API_GDAX, API_GEMINI, API_KRAKEN } from '../../../duo-admin/src/common/constants';
import duoDynamoUtil from '../../../duo-admin/src/utils/dynamoUtil';
import * as CST from '../common/constants';
import {
	IAcceptedPrice,
	IOption,
	IOrderBookSnapshotUpdate,
	IOrderQueueItem,
	IPrice,
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
	IWsUserOrderResponse
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderBookPersistenceUtil from '../utils/orderBookPersistenceUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import orderUtil from '../utils/orderUtil';
import tradePriceUtil from '../utils/tradePriceUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

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

	public sendResponse(ws: WebSocket, req: IWsRequest, status: string) {
		const orderResponse: IWsResponse = {
			method: req.method,
			channel: req.channel,
			status: status,
			pair: req.pair
		};
		util.safeWsSend(ws, JSON.stringify(orderResponse));
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
		if (!req.orderHash || !this.web3Util) {
			util.logDebug('invalid request, ignore');
			this.sendResponse(ws, req, CST.WS_INVALID_REQ);
			return;
		}
		const stringSignedOrder = req.order as IStringSignedOrder;
		const token = this.web3Util.getTokenByCode(req.pair.split('|')[0]);
		if (!token) {
			util.logDebug('invalid token, ignore');
			this.sendErrorOrderResponse(ws, req, req.orderHash, CST.WS_INVALID_ORDER);
			return;
		}

		try {
			const orderHash = await orderUtil.validateOrder(
				this.web3Util,
				req.pair,
				token,
				stringSignedOrder
			);
			if (orderHash === req.orderHash) {
				util.logDebug('order valided, persisting');

				const userOrder = await orderPersistenceUtil.persistOrder({
					method: req.method,
					status: CST.DB_CONFIRMED,
					requestor: CST.DB_RELAYER,
					pair: req.pair,
					orderHash: orderHash,
					token: token,
					signedOrder: stringSignedOrder
				});
				if (userOrder) this.sendUserOrderResponse(ws, userOrder, req.method);
				else this.sendErrorOrderResponse(ws, req, req.orderHash, CST.WS_INVALID_ORDER);
			} else {
				util.logDebug('invalid orderHash, ignore');
				this.sendErrorOrderResponse(ws, req, req.orderHash, orderHash);
			}
		} catch (error) {
			util.logError(error);
			this.sendErrorOrderResponse(ws, req, req.orderHash, CST.WS_ERROR);
		}
	}

	public async handleTerminateOrderRequest(ws: WebSocket, req: IWsTerminateOrderRequest) {
		util.logDebug(`terminate order ${req.orderHashes.join(',')}`);
		if (!req.orderHashes.length || !this.web3Util) {
			util.logDebug('invalid request, ignore');
			this.sendResponse(ws, req, CST.WS_INVALID_REQ);
			return;
		}
		const { pair, orderHashes, signature } = req;
		const account = this.web3Util
			.web3AccountsRecover(CST.TERMINATE_SIGN_MSG + orderHashes.join(','), signature)
			.toLowerCase();
		util.logDebug(`recovered account: ${account}`);
		for (const orderHash of orderHashes) {
			const rawOrder = await orderPersistenceUtil.getRawOrderInPersistence(pair, orderHash);
			util.logDebug(`rawOrder account: ${rawOrder ? rawOrder.signedOrder.makerAddress : ''}`);
			if (account && rawOrder && rawOrder.signedOrder.makerAddress === account)
				try {
					const userOrder = await orderPersistenceUtil.persistOrder({
						method: req.method,
						status: CST.DB_CONFIRMED,
						requestor: CST.DB_RELAYER,
						pair: req.pair,
						orderHash: orderHash
					});
					if (userOrder) this.sendUserOrderResponse(ws, userOrder, req.method);
					else this.sendErrorOrderResponse(ws, req, orderHash, CST.WS_INVALID_ORDER);
				} catch (error) {
					util.logError(error);
					this.sendErrorOrderResponse(ws, req, orderHash, CST.WS_ERROR);
				}
			else {
				util.logDebug('invalid order, ignore');
				this.sendErrorOrderResponse(ws, req, orderHash, CST.WS_INVALID_ORDER);
			}
		}
	}

	public async handleOrderHistorySubscribeRequest(ws: WebSocket, req: IWsOrderHistoryRequest) {
		if (this.web3Util) {
			const { account } = req;
			if (util.isEmptyObject(this.accountClients)) {
				const deadline = util.getUTCNowTimestamp();
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

			const now = util.getUTCNowTimestamp();
			const userOrders = await dynamoUtil.getUserOrders(account, now - 30 * 86400000, now);

			const orderBookResponse: IWsOrderHistoryResponse = {
				method: CST.WS_HISTORY,
				channel: CST.DB_ORDERS,
				status: CST.WS_OK,
				pair: '',
				orderHistory: userOrders
			};
			util.safeWsSend(ws, JSON.stringify(orderBookResponse));
		} else {
			const orderBookResponse: IWsResponse = {
				method: CST.WS_HISTORY,
				channel: CST.DB_ORDERS,
				status: CST.WS_ERROR,
				pair: ''
			};
			util.safeWsSend(ws, JSON.stringify(orderBookResponse));
		}
	}

	public unsubscribeOrderHistory(ws: WebSocket, account: string) {
		if (this.accountClients[account] && this.accountClients[account].includes(ws)) {
			this.accountClients[account] = this.accountClients[account].filter(e => e !== ws);
			if (!this.accountClients[account].length) delete this.accountClients[account];

			if (util.isEmptyObject(this.accountClients) && this.web3Util) {
				const tokens = this.web3Util.tokens;
				for (const token of tokens)
					for (const code in token.feeSchedules)
						orderPersistenceUtil.unsubscribeOrderUpdate(`${token.code}|${code}`);
			}
		}
	}

	public handleOrderHistoryUnsubscribeRequest(ws: WebSocket, req: IWsOrderHistoryRequest) {
		this.unsubscribeOrderHistory(ws, req.account);
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
			(!this.web3Util || !this.web3Util.isValidPair(req.pair))
		) {
			this.sendResponse(ws, req, CST.WS_INVALID_REQ);
			return Promise.resolve();
		}

		switch (req.method) {
			case CST.WS_SUB:
				return this.handleOrderHistorySubscribeRequest(ws, req as IWsOrderHistoryRequest);
			case CST.WS_UNSUB:
				this.handleOrderHistoryUnsubscribeRequest(ws, req as IWsOrderHistoryRequest);
				return Promise.resolve();
			case CST.DB_ADD:
				return this.handleAddOrderRequest(ws, req as IWsAddOrderRequest);
			case CST.DB_TERMINATE:
				return this.handleTerminateOrderRequest(ws, req as IWsTerminateOrderRequest);
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

		const { account } = orderQueueItem.liveOrder;
		if (this.accountClients[account] && this.accountClients[account].length) {
			const userOrder = orderUtil.constructUserOrder(
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
		util.logDebug(`received order book updates from channel ${channel}`);
		const pair = orderBookSnapshotUpdate.pair;
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
		this.sendResponse(ws, req, CST.WS_OK);
	}

	public handleOrderBookRequest(ws: WebSocket, req: IWsRequest) {
		if (
			![CST.WS_SUB, CST.WS_UNSUB].includes(req.method) ||
			!this.web3Util ||
			!this.web3Util.isValidPair(req.pair)
		) {
			this.sendResponse(ws, req, CST.WS_INVALID_REQ);
			return Promise.resolve();
		}

		if (req.method === CST.WS_SUB) return this.handleOrderBookSubscribeRequest(ws, req);
		else {
			this.handleOrderBookUnsubscribeRequest(ws, req);
			return Promise.resolve();
		}
	}

	public handleTradeUpdate(channel: string, trade: ITrade) {
		util.logDebug('receive update from channel: ' + channel);
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
				method: CST.DB_UPDATE,
				channel: CST.DB_ORDER_BOOKS,
				status: CST.WS_OK,
				pair: pair,
				trades: [trade]
			};
			util.safeWsSend(ws, JSON.stringify(tradeResponse));
		});
	}

	public handleTradeSubscribeRequest(ws: WebSocket, req: IWsRequest) {
		if (!this.tradePairs[req.pair] || !this.tradePairs[req.pair].length)
			this.tradePairs[req.pair] = [ws];
		else if (!this.tradePairs[req.pair].includes(ws)) this.tradePairs[req.pair].push(ws);

		const tradeResponse: IWsTradeResponse = {
			method: CST.DB_TRADES,
			channel: CST.DB_TRADES,
			status: CST.WS_OK,
			pair: req.pair,
			trades: this.marketTrades[req.pair]
		};
		util.safeWsSend(ws, JSON.stringify(tradeResponse));
	}

	public unsubscribeTrade(ws: WebSocket, pair: string) {
		if (this.tradePairs[pair] && this.tradePairs[pair].includes(ws)) {
			this.tradePairs[pair] = this.tradePairs[pair].filter(e => e !== ws);
			if (!this.tradePairs[pair].length) delete this.tradePairs[pair];
		}
	}

	public handleTradeUnsubscribeRequest(ws: WebSocket, req: IWsRequest) {
		this.unsubscribeTrade(ws, req.pair);
		this.sendResponse(ws, req, CST.WS_OK);
	}

	public handleTradeRequest(ws: WebSocket, req: IWsRequest) {
		if (
			![CST.WS_SUB, CST.WS_UNSUB].includes(req.method) ||
			!this.web3Util ||
			!this.web3Util.isValidPair(req.pair)
		) {
			this.sendResponse(ws, req, CST.WS_INVALID_REQ);
			return;
		}

		if (req.method === CST.WS_SUB) this.handleTradeSubscribeRequest(ws, req);
		else this.handleTradeUnsubscribeRequest(ws, req);
	}

	public handleWebSocketMessage(ws: WebSocket, ip: string, m: string) {
		util.logDebug('received: ' + m + ' from ' + ip);
		const req: IWsRequest = JSON.parse(m);

		switch (req.channel) {
			case CST.DB_ORDERS:
				return this.handleOrderRequest(ws, req);
			case CST.DB_ORDER_BOOKS:
				return this.handleOrderBookRequest(ws, req);
			case CST.DB_TRADES:
				this.handleTradeRequest(ws, req);
				return Promise.resolve();
			default:
				this.sendResponse(ws, req, CST.WS_INVALID_REQ);
				return Promise.resolve();
		}
	}

	public sendInfo(ws: WebSocket) {
		const staticInfoResponse: IWsInfoResponse = {
			channel: CST.WS_INFO,
			method: CST.WS_INFO,
			status: CST.WS_OK,
			pair: '',
			acceptedPrices: this.duoAcceptedPrices,
			exchangePrices: this.duoExchangePrices,
			tokens: this.web3Util ? this.web3Util.tokens : [],
			processStatus: this.processStatus
		};
		util.safeWsSend(ws, JSON.stringify(staticInfoResponse));
	}

	public handleWebSocketConnection(ws: WebSocket, ip: string) {
		util.logInfo('new connection');
		this.sendInfo(ws);
		ws.on('message', message => this.handleWebSocketMessage(ws, ip, message.toString()));
		ws.on('close', () => this.handleWebSocketClose(ws, ip));
	}

	public handleWebSocketClose(ws: WebSocket, ip: string) {
		util.logInfo('connection close from ' + ip);
		for (const pair in this.orderBookPairs) this.unsubscribeOrderBook(ws, pair);
		for (const pair in this.tradePairs) this.unsubscribeTrade(ws, pair);
		for (const account in this.accountClients) this.unsubscribeOrderHistory(ws, account);
	}

	public async loadDuoAcceptedPrices() {
		if (this.web3Util) {
			const custodians: string[] = [];
			for (const token of this.web3Util.tokens)
				if (!custodians.includes(token.custodian)) custodians.push(token.custodian);
			if (!custodians.length) {
				util.logDebug('no custodian, skip loading duo accepted prices');
				return;
			}
			const dates = util.getDates(8, 1, 'day', 'YYYY-MM-DD');
			for (const custodian of custodians)
				this.duoAcceptedPrices[custodian] = await duoDynamoUtil.queryAcceptPriceEvent(
					Web3Util.toChecksumAddress(custodian),
					dates
				);
			util.logDebug('loaded duo accepted prices');
		}
	}

	public async loadDuoExchangePrices() {
		const start = util.getUTCNowTimestamp() - 24 * 3600000;
		for (const source of [API_GDAX, API_GEMINI, API_KRAKEN])
			this.duoExchangePrices[source] = await duoDynamoUtil.getPrices(
				source,
				60,
				start,
				0,
				'ETH|USD'
			);
		util.logDebug('loaded duo exchange prices');
	}

	public async loadAndSubscribeMarketTrades() {
		if (this.web3Util) {
			const now = util.getUTCNowTimestamp();
			const start = now - 3600000 * 2;
			for (const token of this.web3Util.tokens) {
				const pair = token.code + '|' + CST.TOKEN_WETH;
				const trades = await dynamoUtil.getTrades(pair, start, now);
				if (trades.length) this.marketTrades[trades[0].pair] = trades;
				tradePriceUtil.subscribeTradeUpdate(pair, (c, trade) =>
					this.handleTradeUpdate(c, trade)
				);
			}
		}
	}

	public async initializeCache(web3Util: Web3Util) {
		web3Util.setTokens(await dynamoUtil.scanTokens());
		global.setInterval(async () => web3Util.setTokens(await dynamoUtil.scanTokens()), 3600000);
		await this.loadDuoAcceptedPrices();
		await this.loadDuoExchangePrices();
		await this.loadAndSubscribeMarketTrades();
		global.setInterval(() => this.loadDuoAcceptedPrices(), 600000);
		this.ipList = await dynamoUtil.scanIpList();
		this.processStatus = await dynamoUtil.scanStatus();
		util.logDebug('loaded ip list and status');
		global.setInterval(async () => {
			await this.loadDuoExchangePrices();
			this.ipList = await dynamoUtil.scanIpList();
			this.processStatus = await dynamoUtil.scanStatus();
			util.logDebug('loaded up ip list and status');
		}, 30000);
	}

	public verifyClient: VerifyClientCallbackSync = info => {
		const ip = (info.req.headers['x-forwarded-for'] ||
			info.req.connection.remoteAddress) as string;
		util.logDebug(ip);
		if (this.ipList[ip] === CST.DB_BLACK) {
			util.logDebug(`ip ${ip} in blacklist, refuse connection`);
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
		this.web3Util = new Web3Util(null, option.env === CST.DB_LIVE, '', false);
		duoDynamoUtil.init(
			config,
			option.env === CST.DB_LIVE,
			CST.DB_RELAYER,
			Web3Util.fromWei,
			async txHash => {
				const txReceipt = this.web3Util
					? await this.web3Util.getTransactionReceipt(txHash)
					: null;
				if (!txReceipt) return null;
				return {
					status: txReceipt.status as string
				};
			}
		);
		await this.initializeCache(this.web3Util);
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
		util.logInfo(`started relayer service at port ${port}`);
		this.initializeWsServer(wsServer);
		if (option.server) {
			dynamoUtil.updateStatus(CST.DB_RELAYER);
			setInterval(
				() => dynamoUtil.updateStatus(CST.DB_RELAYER, wsServer.clients.size),
				30000
			);
		}
	}
}

const relayerServer = new RelayerServer();
export default relayerServer;
