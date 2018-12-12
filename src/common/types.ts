import { SignedOrder } from '0x.js';
import { ChildProcess } from 'child_process';
export { IAcceptedPrice, IPrice } from '../../../duo-admin/src/common/types';
import { IAcceptedPrice, IPrice } from '../../../duo-admin/src/common/types';

export enum Wallet {
	None,
	Local,
	MetaMask,
	Ledger
}

export interface ILiveOrder {
	account: string;
	pair: string;
	orderHash: string;
	price: number;
	amount: number;
	balance: number;
	matching: number;
	fill: number;
	side: string;
	expiry: number;
	createdAt: number;
	updatedAt?: number;
	initialSequence: number;
	currentSequence: number;
	fee: number;
	feeAsset: string;
}

export interface IUserOrder extends ILiveOrder {
	type: string;
	status: string;
	updatedBy: string;
	processed: boolean;
}

export interface IRawOrder {
	pair: string;
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
	status: string;
	requestor: string;
	token?: IToken;
	fill?: number;
	matching?: number;
	signedOrder?: IStringSignedOrder;
}

export interface IOrderQueueItem {
	method: string;
	status: string;
	requestor: string;
	liveOrder: ILiveOrder;
	signedOrder?: IStringSignedOrder;
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
	balance: number;
	initialSequence: number;
}

export interface IOrderBookSnapshotLevel {
	price: number;
	balance: number;
	count: number;
}

export interface IOrderUpdate {
	liveOrder: ILiveOrder;
	method: string;
}

export interface IOrderBookLevelUpdate {
	price: number;
	change: number;
	count: number;
	side: string;
}

export interface IOrderBookSnapshotUpdate {
	pair: string;
	updates: IOrderBookLevelUpdate[];
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

export interface IWsOrderHistoryRequest extends IWsRequest {
	account: string;
}

export interface IWsAddOrderRequest extends IWsOrderRequest {
	order: IStringSignedOrder | SignedOrder;
}

export interface IWsTerminateOrderRequest extends IWsOrderRequest {
	signature: string;
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

export interface IWsOrderHistoryResponse extends IWsResponse {
	orderHistory: IUserOrder[];
}

export interface IWsInfoResponse extends IWsResponse {
	acceptedPrices: { [custodian: string]: IAcceptedPrice[] };
	exchangePrices: { [source: string]: IPrice[] };
	tokens: IToken[];
	processStatus: IStatus[];
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

export interface IMatchingCandidate {
	leftOrder: ILiveOrder;
	rightOrder: ILiveOrder;
	matchingAmount: number;
}

export interface IToken {
	custodian: string;
	address: string;
	code: string;
	denomination: number;
	precisions: {
		[key: string]: number;
	};
	feeSchedules: {
		[key: string]: IFeeSchedule;
	};
	maturity?: number;
}

export interface IFeeSchedule {
	asset?: string;
	rate: number;
	minimum: number;
}

export interface ISubProcess {
	token: string;
	instance: ChildProcess;
	lastFailTimestamp: number;
	failCount: number;
}
