import { BigNumber, ExchangeContractErrs, OrderRelevantState, SignedOrder } from '0x.js';

export interface IDuoOrder extends SignedOrder {
	orderHash: string;
	isValid: boolean;
	isCancelled: boolean;
	updatedAt: number;
	orderWatcherState: OrderRelevantState | ExchangeContractErrs;
}

export interface IOrderBook {
	bids: IDuoOrder[];
	asks: IDuoOrder[];
}

export interface IOrderBookSnapshotWs {
	type: WsChannelMessageTypes;
	channel: {
		name: string;
		marketId: string;
	};
	requestId: number;
	payload: IOrderBook;
}

export interface IUpdatePayloadWs {
	order: SignedOrder;
	metaData: {
		remainingTakerAssetAmount: BigNumber;
	};
}

export interface IOrderBookUpdateWS {
	side: string;
	price: string;
	amount: string;
}

export interface IUpdateResponseWs {
	type: WsChannelMessageTypes;
	channel: {
		name: WsChannelName;
		marketId: string;
	};
	changes: IOrderBookUpdateWS[];
}

export interface ICancelOrderResponseWs {
	status: string;
	orderHash: string;
}

export enum ErrorResponseWs {
	InvalidOrder = 'Invalid order schema or signature!',
	NoExistOrder = 'Order does not exist in DB!'
}

export enum WsChannelMessageTypes {
	Add = 'add',
	Update = 'update',
	Cancel = 'cancel',
	Subscribe = 'subscribe'
}

export enum WsChannelName {
	Orderbook = 'orderbook',
	Orders = 'orders'
}

export interface IOrderInfo {
	makerTokenName: string;
	takerTokenName: string;
	marketId: string;
	side: string;
	amount: string;
	price: string;
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
