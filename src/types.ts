import { BigNumber, OrderRelevantState, SignedOrder } from '0x.js';

export interface IDuoOrder extends SignedOrder {
	orderHash: string;
	isValid: boolean;
	updatedAt: number;
	orderRelevantState: OrderRelevantState;
}

export interface IOrderBook {
	bids: IDuoOrder[];
	asks: IDuoOrder[];
}

export interface IOrderBookSnapshotWs {
	type: string;
	channel: string;
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
	type: string;
	channel: {
		name: WsChannelName;
		marketId: string;
	};
	changes: IOrderBookUpdateWS[];
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
