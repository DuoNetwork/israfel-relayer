import WebSocket from 'ws';

export interface ILiveOrder {
	account: string;
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

export interface IUserOrder extends ILiveOrder {
	type: string;
	status: string;
	updatedBy: string;
}

export interface IRawOrder {
	orderHash: string;
	signedOrder: IStringSignedOrder;
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

export interface INewOrderQueueItem {
	liveOrder: ILiveOrder;
	signedOrder: IStringSignedOrder;
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

export interface IOrderBookUpdate {
	sequence: number;
	pair: string;
	price: number;
	amount: number;
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
	order: IStringSignedOrder;
}

export interface IWsOrderResponse extends IWsResponse {
	orderHash: string;
}

export interface IWsUserOrderResponse extends IWsOrderResponse {
	userOrder: IUserOrder;
}

export interface IWsOrderSequenceResponse extends IWsOrderResponse {
	sequence: number;
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
	type: string;
}

export interface IRelayerCacheItem {
	ws: WebSocket;
	pair: string;
	method: string;
	liveOrder: ILiveOrder;
	signedOrder?: IStringSignedOrder;
}

export interface IStatus {
	hostname: string;
	updatedAt: number;
	pair: string;
	tool: string;
	count?: number;
	sequence?: number;
}
