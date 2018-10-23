import { BigNumber, OrderRelevantState, SignedOrder } from '0x.js';

export interface IOrderInfo {
	orderHash: string;
	price: number;
	updatedAt: number;
	orderRelevantState: OrderRelevantState;
}

export interface ILiveOrder {
	orderHash: string;
	price: number;
	amount: number;
	side: string;
	updatedAt: number;
	id: number;
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
	id: number;
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
	price: string;
	amount: string;
}

export interface IOrderBookUpdate {
	id: number;
	pair: string;
	price: number;
	amount: number;
}

export interface IAddOrderRequest {
	method: string;
	channel: string;
	order: SignedOrder;
}

export interface ICanceleOrderRequest {
	method: string;
	channel: string;
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

export interface IDynamoSignedOrder {
	senderAddress: string;
	makerAddress: string;
	takerAddress: string;
	makerFee: string;
	takerFee: string;
	makerAssetAmount: string;
	takerAssetAmount: string;
	makerAssetData: string;
	takerAssetData: string;
	salt: string;
	exchangeAddress: string;
	feeRecipientAddress: string;
	expirationTimeSeconds: string;
	signature: string;
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
}

export interface IOrderQueue {
	order: SignedOrder;
	orderHash: string;
	side: string;
	pair: string;
}
