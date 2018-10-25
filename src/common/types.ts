import { BigNumber, SignedOrder } from '0x.js';
import WebSocket from 'ws';

export interface ILiveOrder {
	pair: string;
	orderHash: string;
	price: number;
	amount: number;
	side: string;
	createdAt?: number;
	updatedAt?: number;
	initialSequence: number;
	currentSequence: number;
}

export interface IRawOrder {
	orderHash: string;
	signedOrder: SignedOrder;
	createdAt?: number;
	updatedAt?: number;
}

export interface INewOrderQueueItem {
	liveOrder: ILiveOrder;
	rawOrder: IRawOrder;
}

export interface ICancelOrderQueueItem {
	liveOrder: ILiveOrder;
	account: string;
}

export interface IUserOrder {
	account: string;
	pair: string;
	type: string;
	status: string;
	orderHash: string;
	price: number;
	amount: number;
	side: string;
	sequence: number;
	updatedAt?: number;
	updatedBy: string;
}

export interface IOrderBookSnapshotWs extends IOrderBookSnapshot {
	type: WsChannelResposnseTypes;
	channel: {
		name: string;
		pair: string;
	};
	requestId: number;
}

export interface IOrderBookSnapshot {
	sequence: number;
	bids: IOrderBookUpdateWS[];
	asks: IOrderBookUpdateWS[];
}

export interface IUpdatePayloadWs {
	order: SignedOrder;
	metaData: {
		remainingTakerAssetAmount: BigNumber;
	};
}

export interface IOrderBookUpdateWS {
	price: number;
	amount: number;
}

export interface IOrderBookUpdate {
	sequence: number;
	pair: string;
	price: number;
	amount: number;
}

export interface IWsRequest {
	method: string;
	channel: string;
}

export interface IWsResponse {
	status: string;
	channel: string;
}

export interface IWsSequenceResponse extends IWsResponse {
	pair: string;
	sequence: number;
}

export interface IAddOrderRequest extends IWsRequest {
	order: SignedOrder;
}

export interface ICanceleOrderRequest extends IWsRequest {
	orderHash: string;
}

export interface IOrderResponse {
	method: string;
	channel: string;
	status: string;
	orderHash: string;
	message: string;
}

export interface ISubscribeOrderBookRequest {
	method: string;
	channel: string;
}

export interface IUpdateResponseWs {
	type: WsChannelResposnseTypes;
	lastTimestamp: number;
	currentTimestamp: number;
	channel: {
		name: WsChannelName;
		pair: string;
	};
	bids: IOrderBookUpdateWS[];
	asks: IOrderBookUpdateWS[];
}

export interface IOrderResponseWs {
	channel: {
		name: WsChannelName;
		pair: string;
	};
	status: string;
	failedReason: string;
}

export enum ErrorResponseWs {
	InvalidOrder = 'Invalid order schema or signature!',
	NoExistOrder = 'Order does not exist in DB!'
}

export enum WsChannelMessageTypes {
	Add = 'add',
	Cancel = 'cancel',
	Subscribe = 'subscribe'
}

export enum UserOrderOperation {
	ADD = 'add',
	CANCEL = 'cancel',
	FILL = 'fill'
}

export enum WsChannelResposnseTypes {
	Update = 'update',
	Snapshot = 'snapshot'
}

export enum WsChannelName {
	Orderbook = 'orderbook',
	Order = 'order'
}

export interface IOption {
	live: boolean;
	token: string;
	maker: number;
	spender: number;
	amount: number;
	debug: boolean;
	type: string;
}

export interface IQueueOrder {
	ws: WebSocket;
	pair: string;
	method: string;
	orderHash: string;
	order: SignedOrder | ILiveOrder;
}

// export enum IOrderAction {
// 	InvalidOrder = 'Invalid order schema or signature!',
// 	NoExistOrder = 'Order does not exist in DB!'
// }

export interface IStatus {
	hostname: string;
	updatedAt: number;
	pair: string;
	tool: string;
	count?: number;
	sequence?: number;
}
