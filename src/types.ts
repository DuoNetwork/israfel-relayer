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

export declare enum ErrorResponseWs {
	InvalidOrder = 'Invalid order schema or signature!',
	ExistOrder = 'Order exists in DB!'
}

export interface IUpdateResponseWs {
	type: string;
	channel: string;
	requestId: number;
	payload: IUpdatePayloadWs[] | string;
}

export declare enum WsChannelMessageTypes {
	Subscribe = 'subscribe',
	Update = 'update',
	Unknown = 'unknown'
}

export declare enum WsChannel {
	Orderbook = 'orderbook',
	Orders = 'orders'
}
