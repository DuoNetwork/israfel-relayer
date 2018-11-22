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

export interface IMatchingOrders {
	orderHash: string;
	fillAmt: number;
}

export interface IUserOrder extends ILiveOrder {
	type: string;
	status: string;
	updatedBy: string;
	processed: boolean;
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
	requestor: string;
	status: string;
	side?: string;
	fill?: number;
	signedOrder?: IStringSignedOrder;
}

export interface IOrderQueueItem {
	method: string;
	status: string;
	requestor: string;
	liveOrder: ILiveOrder;
	signedOrder?: IStringSignedOrder;
}

export interface IOrderBookSnapshotWs extends IOrderBookSnapshot {
	type: string;
	sequence: number;
	channel: string;
}

export interface IOrderBook {
	bids: IOrderBookLevel[];
	asks: IOrderBookLevel[];
}

export interface IOrderBookSnapshot {
	version: number;
	pair: string;
	bids: IOrderBookSnapshotLevel[];
	asks: IOrderBookSnapshotLevel[];
}

export interface IOrderBookLevel {
	orderHash: string;
	price: number;
	amount: number;
	initialSequence: number;
}

export interface IOrderBookSnapshotLevel {
	price: number;
	amount: number;
	count: number;
}

export interface IOrderBookSnapshotUpdate {
	pair: string;
	price: number;
	amount: number;
	count: number;
	side: string;
	prevVersion: number;
	version: number;
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

export interface IWsOrderBookResponse extends IWsResponse {
	orderBookSnapshot: IOrderBookSnapshot;
}

export interface IWsOrderBookUpdateResponse extends IWsResponse {
	orderBookUpdate: IOrderBookSnapshotUpdate;
}

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

export interface IMatchingOrderResult {
	orderHash: string;
	newBalance: number;
	sequence: number;
}
