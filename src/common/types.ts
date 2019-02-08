import { ILiveOrder, IStringSignedOrder, IToken } from '@finbook/israfel-common';
import { ChildProcess } from 'child_process';

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
	transactionHash?: string;
}

export interface IOrderMatchRequest {
	pair: string;
	feeAsset: string;
	bid: IOrderMatchingInfo;
	ask: IOrderMatchingInfo;
	takerSide: string;
	transactionHash?: string;
}

export interface IOrderMatchingInfo {
	orderHash: string;
	orderAmount: number;
	matchingAmount: number;
	price: number;
	fee: number;
}

export interface IOrderQueueItem {
	method: string;
	status: string;
	requestor: string;
	liveOrder: ILiveOrder;
	signedOrder?: IStringSignedOrder;
	transactionHash?: string;
}

export interface IOrderUpdate {
	liveOrder: ILiveOrder;
	method: string;
}

export interface IOption {
	env: string;
	tokens: string[];
	token: string;
	debug: boolean;
	server: boolean;
}

export interface ISubProcess {
	token: string;
	instance: ChildProcess;
	lastFailTimestamp: number;
	failCount: number;
}
