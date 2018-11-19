import { SignedOrder } from '0x.js';

export interface ILiveOrder {
	account: string;
	pair: string;
	orderHash: string;
	price: number;
	amount: number;
	balance: number;
	fill: number;
	side: string;
	createdAt?: number;
	updatedAt?: number;
	initialSequence: number;
	currentSequence: number;
}

export interface IUserOrder extends ILiveOrder {
	type: string;
	status: string;
	updatedBy: string;
}

export interface IRawOrder {
	orderHash: string;
	signedOrder: IStringSignedOrder | SignedOrder;
	createdAt?: number;
	updatedAt?: number;
}

export interface IStringSignedOrder {
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

export interface IOrderPersistRequest {
	method: string;
	pair: string;
	orderHash: string;
	balance: number;
	side?: string;
	fill?: number;
	signedOrder?: IStringSignedOrder;
}

export interface IOrderQueueItem {
	method: string;
	liveOrder: ILiveOrder;
	signedOrder?: IStringSignedOrder;
}

export interface IOrderBookSnapshotWs extends IOrderBookSnapshot {
	type: string;
	sequence: number;
	channel: string;
}

export interface IOrderBookSnapshot {
	sequence: number;
	bids: IOrderBookUpdateWS[];
	asks: IOrderBookUpdateWS[];
}

export interface IUpdatePayloadWs {
	order: IStringSignedOrder;
	metaData: {
		remainingTakerAssetAmount: string;
	};
}

export interface IOrderBookUpdateWS {
	price: number;
	amount: number;
}

export interface IOrderBookUpdateItem {
	pair: string;
	price: number;
	amount: number;
	side: string;
	baseSequence: number;
	sequence: number;
}

export interface IWsRequest {
	method: string;
	channel: string;
	pair: string;
}

export interface IWsResponse {
	status: string;
	method: string;
	channel: string;
	pair: string;
}

export interface IWsOrderRequest extends IWsRequest {
	orderHash: string;
}

export interface IWsAddOrderRequest extends IWsOrderRequest {
	order: IStringSignedOrder | SignedOrder;
}

export interface IWsOrderResponse extends IWsResponse {
	orderHash: string;
}

export interface IWsUserOrderResponse extends IWsOrderResponse {
	userOrder: IUserOrder;
}

export interface ISubscribeOrderBookRequest {
	method: string;
	channel: string;
}

// export interface IUpdateResponseWs {
// 	type: WsChannelResposnseTypes;
// 	lastTimestamp: number;
// 	currentTimestamp: number;
// 	channel: {
// 		name: WsChannelName;
// 		pair: string;
// 	};
// 	bids: IOrderBookUpdateWS[];
// 	asks: IOrderBookUpdateWS[];
// }

// export interface IOrderResponseWs {
// 	channel: {
// 		name: WsChannelName;
// 		pair: string;
// 	};
// 	status: string;
// 	failedReason: string;
// }

export interface IOption {
	live: boolean;
	token: string;
	maker: number;
	spender: number;
	amount: number;
	debug: boolean;
	server: boolean;
}

export interface IStatus {
	hostname: string;
	updatedAt: number;
	pair: string;
	tool: string;
	count?: number;
}

export interface IService {
	service: string;
	hostname: string;
	url: string;
}
