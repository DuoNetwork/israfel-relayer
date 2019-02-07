import { IAcceptedPrice, IPrice } from '@finbook/duo-market-data';
import WebSocket from 'isomorphic-ws';
import * as CST from '../common/constants';
import {
	IOrderBookSnapshot,
	IOrderBookSnapshotUpdate,
	IStatus,
	IToken,
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
import orderBookUtil from '../utils/orderBookUtil';
import orderUtil from '../utils/orderUtil';
import Web3Util from '../utils/Web3Util';

export default class RelayerClient {
	public web3Util: Web3Util;
	private env: string;
	public ws: WebSocket | null = null;
	private handleConnected: () => any = () => ({});
	private handleReconnect: () => any = () => ({});
	private handleInfoUpdate: (
		tokens: IToken[],
		status: IStatus[],
		acceptedPrices: { [custodian: string]: IAcceptedPrice[] },
		exchangePrices: { [source: string]: IPrice[] }
	) => any = () => ({});
	private handleOrderUpdate: (userOrder: IUserOrder) => any = () => ({});
	private handleOrderHistoryUpdate: (userOrders: IUserOrder[]) => any = () => ({});
	private handleTradeUpdate: (pair: string, trades: ITrade[]) => any = () => ({});
	private handleTradeError: (method: string, pair: string, error: string) => any = () => ({});
	private handleOrderError: (
		method: string,
		orderHash: string,
		error: string
	) => any = () => ({});
	private handleOrderBookUpdate: (orderBookSnapshot: IOrderBookSnapshot) => any = () => ({});
	private handleOrderBookError: (method: string, pair: string, error: string) => any = () => ({});
	public reconnectionNumber: number = 0;
	public orderBookSnapshots: { [pair: string]: IOrderBookSnapshot } = {};
	public pendingOrderBookUpdates: { [pair: string]: IOrderBookSnapshotUpdate[] } = {};
	public orderBookSnapshotAvailable: { [pair: string]: boolean } = {};

	constructor(web3Util: Web3Util, env: string) {
		this.web3Util = web3Util;
		this.env = env;
	}

	public reconnect() {
		if (this.ws) this.ws.close();

		this.ws = null;
		this.handleReconnect();
		if (this.reconnectionNumber < 5) {
			this.reconnectionNumber++;
			global.setTimeout(() => this.connectToRelayer(), this.reconnectionNumber * 10000);
		}
	}

	public connectToRelayer() {
		this.ws = new WebSocket(`wss://relayer.${this.env}.israfel.info:8080`);
		this.ws.onopen = () => {
			this.reconnectionNumber = 0;
			this.handleConnected();
		};
		this.ws.onmessage = (m: any) => this.handleMessage(m.data.toString());
		this.ws.onerror = error => {
			console.log('ws error');
			console.log(JSON.stringify(error));
			this.reconnect();
		};
		this.ws.onclose = () => {
			console.log('ws close');
			this.reconnect();
		};
	}

	public handleTradeResponse(response: IWsResponse) {
		if (response.status !== CST.WS_OK)
			this.handleTradeError(
				response.method,
				(response as IWsTradeResponse).pair,
				response.status
			);
		else this.handleTradeUpdate(response.pair, (response as IWsTradeResponse).trades);
	}

	public handleOrderResponse(response: IWsResponse) {
		if (response.status !== CST.WS_OK)
			this.handleOrderError(
				response.method,
				(response as IWsOrderResponse).orderHash,
				response.status
			);
		else if (response.method === CST.WS_HISTORY)
			this.handleOrderHistoryUpdate((response as IWsOrderHistoryResponse).orderHistory);
		else this.handleOrderUpdate((response as IWsUserOrderResponse).userOrder);
	}

	public handleOrderBookResponse(orderBookResponse: IWsResponse) {
		if (orderBookResponse.status !== CST.WS_OK)
			this.handleOrderBookError(
				orderBookResponse.method,
				orderBookResponse.pair,
				orderBookResponse.status
			);
		else if (orderBookResponse.method === CST.DB_SNAPSHOT) {
			const { pair, orderBookSnapshot } = orderBookResponse as IWsOrderBookResponse;
			this.orderBookSnapshots[pair] = orderBookSnapshot;
			const pendingUpdates = this.pendingOrderBookUpdates[pair];
			let hasGap = false;
			if (pendingUpdates && pendingUpdates.length) {
				pendingUpdates.sort((a, b) => a.version - b.version);
				while (true) {
					const update = pendingUpdates.shift();
					if (!update) break;
					if (update.prevVersion < orderBookSnapshot.version) continue;
					if (update.prevVersion > orderBookSnapshot.version) {
						hasGap = true;
						pendingUpdates.unshift(update);
						break;
					}
					orderBookUtil.updateOrderBookSnapshot(orderBookSnapshot, update);
				}
			}

			if (!hasGap) this.orderBookSnapshotAvailable[pair] = true;
			else this.subscribeOrderBook(pair);

			this.handleOrderBookUpdate(orderBookSnapshot);
		} else if (orderBookResponse.method === CST.DB_UPDATE) {
			const { pair, orderBookUpdate } = orderBookResponse as IWsOrderBookUpdateResponse;
			if (!this.orderBookSnapshotAvailable[pair])
				this.pendingOrderBookUpdates[pair].push(orderBookUpdate);
			else {
				const orderBookSnapshot = this.orderBookSnapshots[pair];
				if (orderBookUpdate.prevVersion === orderBookSnapshot.version) {
					orderBookUtil.updateOrderBookSnapshot(orderBookSnapshot, orderBookUpdate);
					this.handleOrderBookUpdate(orderBookSnapshot);
				} else if (orderBookUpdate.prevVersion > orderBookSnapshot.version) {
					this.pendingOrderBookUpdates[pair].push(orderBookUpdate);
					this.subscribeOrderBook(pair);
				}
			}
		}
	}

	public handleMessage(message: string) {
		const res: IWsResponse = JSON.parse(message);
		if (res.method !== CST.WS_UNSUB)
			switch (res.channel) {
				case CST.DB_ORDERS:
					this.handleOrderResponse(res as IWsOrderResponse);
					break;
				case CST.DB_ORDER_BOOKS:
					this.handleOrderBookResponse(res);
					break;
				case CST.DB_TRADES:
					this.handleTradeResponse(res as IWsTradeResponse);
					break;
				case CST.WS_INFO:
					const {
						tokens,
						processStatus,
						acceptedPrices,
						exchangePrices
					} = res as IWsInfoResponse;
					this.web3Util.setTokens(tokens);
					this.handleInfoUpdate(tokens, processStatus, acceptedPrices, exchangePrices);
					break;
				default:
					break;
			}
	}

	public subscribeOrderBook(pair: string) {
		if (!this.ws) return false;
		this.orderBookSnapshotAvailable[pair] = false;
		if (!this.pendingOrderBookUpdates[pair]) this.pendingOrderBookUpdates[pair] = [];
		const msg: IWsRequest = { method: CST.WS_SUB, channel: CST.DB_ORDER_BOOKS, pair: pair };
		this.ws.send(JSON.stringify(msg));
		return true;
	}

	public subscribeTrade(pair: string) {
		if (!this.ws) return false;
		const msg: IWsRequest = { method: CST.WS_SUB, channel: CST.DB_TRADES, pair: pair };
		this.ws.send(JSON.stringify(msg));
		return true;
	}

	public unsubscribeTrade(pair: string) {
		if (!this.ws) return false;
		const msg: IWsRequest = { method: CST.WS_UNSUB, channel: CST.DB_TRADES, pair: pair };
		this.ws.send(JSON.stringify(msg));
		return true;
	}

	public unsubscribeOrderBook(pair: string) {
		if (!this.ws) return false;

		const msg: IWsRequest = { method: CST.WS_UNSUB, channel: CST.DB_ORDER_BOOKS, pair: pair };
		this.ws.send(JSON.stringify(msg));
		this.orderBookSnapshotAvailable[pair] = false;
		delete this.orderBookSnapshots[pair];
		this.pendingOrderBookUpdates[pair] = [];
		return true;
	}

	public subscribeOrderHistory(account: string) {
		if (!this.ws) return false;
		if (!Web3Util.isValidAddress(account)) return false;

		const msg: IWsOrderHistoryRequest = {
			method: CST.WS_SUB,
			channel: CST.DB_ORDERS,
			pair: '',
			account: account
		};
		this.ws.send(JSON.stringify(msg));
		return true;
	}

	public unsubscribeOrderHistory(account: string) {
		if (!this.ws) return false;

		const msg: IWsOrderHistoryRequest = {
			method: CST.WS_UNSUB,
			channel: CST.DB_ORDERS,
			pair: '',
			account: account
		};
		this.ws.send(JSON.stringify(msg));
		return true;
	}

	public async addOrder(
		account: string,
		pair: string,
		price: number,
		amount: number,
		isBid: boolean,
		expiry: number
	) {
		if (!this.ws) return '';
		if (!this.web3Util.isValidPair(pair)) throw new Error('invalid pair');
		const [code1, code2] = pair.split('|');
		const token1 = this.web3Util.getTokenByCode(code1);
		if (!token1) throw new Error('invalid pair');
		const address1 = token1.address;
		const address2 = this.web3Util.getTokenAddressFromCode(code2);
		const amountAfterFee = orderUtil.getAmountAfterFee(
			amount,
			price,
			token1.feeSchedules[code2],
			isBid
		);

		if (!amountAfterFee.makerAssetAmount || !amountAfterFee.takerAssetAmount)
			throw new Error('invalid amount');

		const rawOrder = await this.web3Util.createRawOrder(
			pair,
			account,
			isBid ? address2 : address1,
			isBid ? address1 : address2,
			amountAfterFee.makerAssetAmount,
			amountAfterFee.takerAssetAmount,
			Math.ceil(expiry / 1000)
		);
		const msg: IWsAddOrderRequest = {
			method: CST.DB_ADD,
			channel: CST.DB_ORDERS,
			pair: pair,
			orderHash: rawOrder.orderHash,
			order: rawOrder.signedOrder
		};
		this.ws.send(JSON.stringify(msg));
		return rawOrder.orderHash;
	}

	public deleteOrder(pair: string, orderHashes: string[], signature: string) {
		if (!this.ws) return false;

		const msg: IWsTerminateOrderRequest = {
			method: CST.DB_TERMINATE,
			channel: CST.DB_ORDERS,
			pair: pair,
			orderHashes: orderHashes,
			signature: signature
		};
		this.ws.send(JSON.stringify(msg));
		return true;
	}

	public onOrder(
		handleHistory: (userOrders: IUserOrder[]) => any,
		handleUpdate: (userOrder: IUserOrder) => any,
		handleError: (method: string, orderHash: string, error: string) => any
	) {
		this.handleOrderHistoryUpdate = handleHistory;
		this.handleOrderUpdate = handleUpdate;
		this.handleOrderError = handleError;
	}

	public onTrade(
		handleUpdate: (pair: string, trades: ITrade[]) => any,
		handleError: (method: string, pair: string, error: string) => any
	) {
		this.handleTradeUpdate = handleUpdate;
		this.handleTradeError = handleError;
	}

	public onOrderBook(
		handleUpdate: (orderBookSnapshot: IOrderBookSnapshot) => any,
		handleError: (method: string, pair: string, error: string) => any
	) {
		this.handleOrderBookUpdate = handleUpdate;
		this.handleOrderBookError = handleError;
	}

	public onConnection(handleConnected: () => any, handleReconnect: () => any) {
		this.handleConnected = handleConnected;
		this.handleReconnect = handleReconnect;
	}

	public onInfoUpdate(
		handleInfoUpdate: (
			tokens: IToken[],
			status: IStatus[],
			acceptedPrices: { [custodian: string]: IAcceptedPrice[] },
			exchangePrices: { [source: string]: IPrice[] }
		) => any
	) {
		this.handleInfoUpdate = handleInfoUpdate;
	}
}
