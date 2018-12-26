import WebSocket from 'isomorphic-ws';
import * as CST from '../common/constants';

import {
	IAcceptedPrice,
	IOrderBookSnapshot,
	IOrderBookSnapshotUpdate,
	IPrice,
	IStatus,
	IToken,
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
	IWsUserOrderResponse
} from '../common/types';
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
	private handleOrderError: (
		method: string,
		orderHash: string,
		error: string
	) => any = () => ({});
	private handleOrderBookSnapshot: (orderBookSnapshot: IOrderBookSnapshot) => any = () => ({});
	private handleOrderBookUpdate: (orderBookUpdate: IOrderBookSnapshotUpdate) => any = () => ({});
	private handleOrderBookError: (method: string, pair: string, error: string) => any = () => ({});
	public reconnectionNumber: number = 0;
	public latestVersionNumber: number = 0;

	constructor(web3Util: Web3Util, env: string) {
		this.web3Util = web3Util;
		this.env = env;
	}

	private reconnect() {
		this.ws = null;
		this.handleReconnect();
		setTimeout(() => {
			this.connectToRelayer();
			this.reconnectionNumber++;
		}, this.reconnectionNumber * 5000);
	}

	public close() {
		this.ws = new WebSocket(`wss://relayer.${this.env}.israfel.info:8080`);
		this.ws.onclose = () => this.reconnect();
	}

	public connectToRelayer() {
		this.ws = new WebSocket(`wss://relayer.${this.env}.israfel.info:8080`);
		this.ws.onopen = () => {
			this.reconnectionNumber = 0;
			this.handleConnected();
		};
		this.ws.onmessage = (m: any) => this.handleMessage(m.data.toString());
		this.ws.onerror = () => this.reconnect();
		this.ws.onclose = () => this.reconnect();
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
			if (
				(orderBookResponse as IWsOrderBookResponse).orderBookSnapshot.version <
				this.latestVersionNumber
			) {
				this.subscribeOrderBook(
					(orderBookResponse as IWsOrderBookResponse).orderBookSnapshot.pair
				);
				this.latestVersionNumber = (orderBookResponse as IWsOrderBookResponse).orderBookSnapshot.version;
			}
			this.handleOrderBookSnapshot(
				(orderBookResponse as IWsOrderBookResponse).orderBookSnapshot
			);
		} else {
			this.latestVersionNumber = (orderBookResponse as IWsOrderBookResponse).orderBookSnapshot
				? (orderBookResponse as IWsOrderBookResponse).orderBookSnapshot.version
				: 0;
			this.handleOrderBookUpdate(
				(orderBookResponse as IWsOrderBookUpdateResponse).orderBookUpdate
			);
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
		if (!this.ws) return;

		const msg: IWsRequest = {
			method: CST.WS_SUB,
			channel: CST.DB_ORDER_BOOKS,
			pair: pair
		};
		this.ws.send(JSON.stringify(msg));
	}

	public unsubscribeOrderBook(pair: string) {
		if (!this.ws) return;

		const msg: IWsRequest = {
			method: CST.WS_UNSUB,
			channel: CST.DB_ORDER_BOOKS,
			pair: pair
		};
		this.ws.send(JSON.stringify(msg));
	}

	public subscribeOrderHistory(account: string) {
		if (!this.ws) return;

		if (!Web3Util.isValidAddress(account)) return;

		const msg: IWsOrderHistoryRequest = {
			method: CST.WS_SUB,
			channel: CST.DB_ORDERS,
			pair: '',
			account: account
		};
		this.ws.send(JSON.stringify(msg));
	}

	public unsubscribeOrderHistory(account: string) {
		if (!this.ws) return;

		const msg: IWsOrderHistoryRequest = {
			method: CST.WS_UNSUB,
			channel: CST.DB_ORDERS,
			pair: '',
			account: account
		};
		this.ws.send(JSON.stringify(msg));
	}

	public async addOrder(
		account: string,
		pair: string,
		price: number,
		amount: number,
		isBid: boolean,
		expiry: number
	) {
		if (!this.ws) return;
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
	}

	public deleteOrder(pair: string, orderHash: string, signature: string) {
		if (!this.ws) return;

		const msg: IWsTerminateOrderRequest = {
			method: CST.DB_TERMINATE,
			channel: CST.DB_ORDERS,
			pair: pair,
			orderHash: orderHash,
			signature: signature
		};
		this.ws.send(JSON.stringify(msg));
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

	public onOrderBook(
		handleSnapshot: (orderBookSnapshot: IOrderBookSnapshot) => any,
		handleUpdate: (orderBookUpdate: IOrderBookSnapshotUpdate) => any,
		handleError: (method: string, pair: string, error: string) => any
	) {
		this.handleOrderBookSnapshot = handleSnapshot;
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