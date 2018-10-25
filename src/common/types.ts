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

// export interface IOrderBookSnapshotWs extends IOrderBookSnapshot {
// 	type: WsChannelResposnseTypes;
// 	channel: {
// 		name: string;
// 		pair: string;
// 	};
// 	requestId: number;
// }

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
}

export interface IWsResponse {
	status: string;
	channel: string;
}

export interface IWsSequenceResponse extends IWsResponse {
	pair: string;
	sequence: number;
}

export interface IWsAddOrderRequest extends IWsRequest {
	pair: string;
	order: IStringSignedOrder;
}

export interface IWsAddOrderResponse extends IWsResponse {
	pair: string;
	userOrder: IUserOrder;
}

export interface IWsCanceleOrderRequest extends IWsRequest {
	pair: string;
	orderHash: string;
}

export interface IWsCancelOrderResponse extends IWsResponse {
	pair: string;
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
	type: string;
}

export interface IRelayerQueueItem {
	ws: WebSocket;
	pair: string;
	method: string;
	orderHash: string;
	order: IStringSignedOrder | ILiveOrder;
}

export interface IStatus {
	hostname: string;
	updatedAt: number;
	pair: string;
	tool: string;
	count?: number;
	sequence?: number;
}
