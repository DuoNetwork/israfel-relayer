import {
	ContractWrappers,
	// OrderRelevantState,
	// signatureUtils,
	SignedOrder
} from '0x.js';
// import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
// import moment from 'moment';
import * as CST from '../common/constants';

import {
	ErrorResponseWs,
	// IDuoOrder,
	// IDuoSignedOrder,
	// ILiveOrders,
	// IOption,
	// IAddOrderRequest,
	IOrderBookSnapshot,
	IOrderBookSnapshotWs,
	IOrderBookUpdate,
	IOrderResponse,
	// IOrderResponseWs,
	// IOrderStateCancelled,
	// IUpdateResponseWs,
	WsChannelName,
	WsChannelResposnseTypes
} from '../common/types';
import { providerEngine } from '../providerEngine';
import assetsUtil from './assetsUtil';
import dynamoUtil from './dynamoUtil';
// import matchOrdersUtil from './matchOrdersUtil';
import orderBookUtil from './orderBookUtil';
import redisUtil from './redisUtil';

class RelayerUtil {
	public contractWrappers: ContractWrappers;
	public web3Wrapper: Web3Wrapper;
	public orderBook: { [key: string]: IOrderBookSnapshot } = {};
	public now: number;
	// public returnOrders: IUpdatePayloadWs[] = [];

	constructor() {
		this.web3Wrapper = new Web3Wrapper(providerEngine);
		this.contractWrappers = new ContractWrappers(providerEngine, {
			networkId: CST.NETWORK_ID_LOCAL
		});
		this.now = Date.now();
	}

	public async init() {
		orderBookUtil.calculateOrderBookSnapshot();
		this.orderBook = orderBookUtil.orderBook;
		redisUtil.patternSubscribe(`${CST.ORDERBOOK_UPDATE}|*`);

		redisUtil.onOrderBooks((channel, orderBookUpdate) =>
			this.handleOrderBookUpdate(channel, orderBookUpdate)
		);
	}

	public handleOrderBookUpdate = (channel: string, orderBookUpdate: IOrderBookUpdate) => {
		if (orderBookUpdate.id > this.orderBook[orderBookUpdate.pair].id) {
			// TODO: apply orderBook update
		}
	};

	public handleSubscribe(message: any): IOrderBookSnapshotWs {
		console.log('Handle Message: ' + message.type);
		const returnMessage = {
			type: WsChannelResposnseTypes.Snapshot,
			id: this.orderBook[message.channel.pair].id,
			channel: { name: message.channel.name, pair: message.channel.pair },
			requestId: message.requestId,
			bids: this.orderBook[message.channel.pair].bids,
			asks: this.orderBook[message.channel.pair].asks
		};
		console.log('return msg is', returnMessage);
		return returnMessage;
	}

	public determineSide(order: SignedOrder, pair: string): string {
		const baseToken = pair.split('-')[0];
		return assetsUtil.assetDataToTokenName(order.takerAssetData) === baseToken
			? CST.DB_BID
			: CST.DB_ASK;
	}

	public handleAddOrder(
		id: string,
		pair: string,
		orderHash: string,
		signedOrder: SignedOrder
	): void {
		const side = this.determineSide(signedOrder, pair);
		// matchOrdersUtil.matchOrder(signedOrder, pair, side);
		redisUtil.push(
			CST.DB_ORDERS,
			JSON.stringify({
				id,
				signedOrder,
				orderHash,
				pair,
				side
			})
		);
	}

	public async handleCancel(orderHash: string, pair: string): Promise<IOrderResponse> {
		try {
			// Atomic transaction needs to be ensured
			await dynamoUtil.removeLiveOrder(pair, orderHash);
			await dynamoUtil.deleteOrderSignature(orderHash);
			return {
				method: CST.DB_TP_CANCEL,
				channel: `${WsChannelName.Order}| ${pair}`,
				status: 'success',
				orderHash: orderHash,
				message: ''
			};
		} catch {
			return {
				method: CST.DB_TP_CANCEL,
				channel: `${WsChannelName.Order}| ${pair}`,
				status: 'failed',
				orderHash: orderHash,
				message: ErrorResponseWs.InvalidOrder
			};
		}
	}

	// public onModifiedOrder(modifiedOrder: IDuoOrder): IDuoOrder {}

	// public onRemovedOrder(removedOrder: IDuoOrder): IDuoOrder {
	// 	const { orderRelevantState, ...rest } = removedOrder;
	// 	const deltaOrderState: OrderRelevantState = {
	// 		makerBalance: orderRelevantState.makerBalance,
	// 		makerProxyAllowance: orderRelevantState.makerFeeBalance,
	// 		makerFeeBalance: orderRelevantState.makerFeeBalance,
	// 		makerFeeProxyAllowance: orderRelevantState.makerFeeProxyAllowance,
	// 		filledTakerAssetAmount: orderRelevantState.filledTakerAssetAmount,
	// 		remainingFillableMakerAssetAmount: orderRelevantState.remainingFillableMakerAssetAmount.neg(),
	// 		remainingFillableTakerAssetAmount: orderRelevantState.remainingFillableTakerAssetAmount.neg()
	// 	};
	// 	return { orderRelevantState: deltaOrderState, ...rest };
	// }
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
