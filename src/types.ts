import { BigNumber, ExchangeContractErrs, OrderRelevantState, SignedOrder } from '0x.js';

export interface IDuoOrder extends IDuoSignedOrder {
	orderHash: string;
	isValid: boolean;
	isCancelled: boolean;
	updatedAt: number;
	orderWatcherState: OrderRelevantState | ExchangeContractErrs;
}

// export interface IOrderBook {
// 	bids: IDuoOrder[];
// 	asks: IDuoOrder[];
// }

export interface IOrderBookSnapshotWs {
	type: WsChannelResposnseTypes;
	timestamp: number;
	channel: {
		name: string;
		marketId: string;
	};
	requestId: number;
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

export interface IUpdateResponseWs {
	type: WsChannelResposnseTypes;
	lastTimestamp: number;
	currentTimestamp: number;
	channel: {
		name: WsChannelName;
		marketId: string;
	};
	bids: IOrderBookUpdateWS[];
	asks: IOrderBookUpdateWS[];
}

export interface IOrderResponseWs {
	channel: {
		name: WsChannelName;
		marketId: string;
	};
	status: string;
	failedReason: string;
}

export interface ICancelOrderResponseWs {
	status: string;
	orderHash: string;
}

export enum ErrorResponseWs {
	InvalidOrder = 'Invalid order schema or signature!',
	NoExistOrder = 'Order does not exist in DB!'
}

export interface IDuoSignedOrder {
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

export enum WsChannelResposnseTypes {
	Update = 'update',
	Snapshot = 'snapshot'
}

export enum WsChannelName {
	Orderbook = 'orderbook',
	Order = 'order'
}

export interface IOrderStateCancelled {
	isCancelled: boolean;
	orderHash: string;
}

export interface IOption {
	token: string;
	maker: number;
	spender: number;
	amount: number;
}
