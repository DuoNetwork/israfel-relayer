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
	type: string;
	pair: string;
	changes: Array<{
		side: string;
		price: string;
		amount: string;
	}>;
}

export interface IUpdateResponseWs {
	type: string;
	channel: string;
	requestId: number;
	payload: IOrderBookUpdateWS | string;
}

export enum ErrorResponseWs {
	InvalidOrder = 'Invalid order schema or signature!',
	ExistOrder = 'Order exists in DB!'
}

export  enum WsChannelMessageTypes {
	Subscribe = 'subscribe',
	Update = 'update',
	Unknown = 'unknown'
}

export  enum WsChannel {
	Orderbook = 'orderbook',
	Orders = 'orders'
}
