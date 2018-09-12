import { SignedOrder } from '0x.js';

export interface IDuoOrder extends SignedOrder {
	orderHash: string;
	isValid: boolean;
	updatedAt: number;
}

export interface IOrderBook {
	bids: IDuoOrder[];
	asks: IDuoOrder[];
}

export interface IReturnWsMessage {
	type: string;
	channel: string;
	requestId: number;
	payload: IOrderBook | SignedOrder;
}

export declare enum IWsChannelMessageTypes {
	Snapshot = 'snapshot',
	Update = 'update',
	Unknown = 'unknown'
}
