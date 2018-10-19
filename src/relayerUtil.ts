import {
	ContractWrappers,
	OrderRelevantState,
	// orderHashUtils,
	signatureUtils,
	SignedOrder
} from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
// import moment from 'moment';
import assetsUtil from './common/assetsUtil';
import * as CST from './constants';
import dynamoUtil from './dynamoUtil';
// import firebaseUtil from './firebaseUtil';
import matchOrdersUtil from './matchOrdersUtil';
import orderBookUtil from './orderBookUtil';
import { providerEngine } from './providerEngine';
import redisUtil from './redisUtil';
import {
	ErrorResponseWs,
	IDuoOrder,
	// IDuoSignedOrder,
	// ILiveOrders,
	IOption,
	IOrderBookSnapshot,
	IOrderBookSnapshotWs,
	// IOrderBookUpdateWS,
	IOrderResponseWs,
	// IOrderStateCancelled,
	// IUpdateResponseWs,
	WsChannelName,
	WsChannelResposnseTypes
} from './types';
import util from './util';

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

	public async init(tool: string, option: IOption) {
		const config = require('./keys/' + (option.live ? 'live' : 'dev') + '/dynamo.json');
		dynamoUtil.init(config, option.live, tool);

		orderBookUtil.calculateOrderBookSnapshot();
		this.orderBook = orderBookUtil.orderBook;
	}

	public async validateNewOrder(signedOrder: SignedOrder, orderHash: string): Promise<boolean> {
		const { orderSchema } = schemas;
		const { signature, ...rest } = signedOrder;
		const validator = new SchemaValidator();
		const isValidSchema = validator.validate(rest, orderSchema).valid;
		// const ECSignature = signatureUtils.parseECSignature(signature);
		// console.log(signature);
		// const isValidSig = await signatureUtils.isValidECSignature(
		// 	orderHash,
		// 	ECSignature,
		// 	rest.makerAddress
		// );

		const isValidSig = await signatureUtils.isValidSignatureAsync(
			providerEngine,
			orderHash,
			signature,
			rest.makerAddress
		);
		console.log('schema is %s and signature is %s', isValidSchema, isValidSig);
		return isValidSchema && isValidSig;
	}

	public handleSubscribe(message: any): IOrderBookSnapshotWs {
		console.log('Handle Message: ' + message.type);
		const returnMessage = {
			type: WsChannelResposnseTypes.Snapshot,
			timestamp: this.now,
			channel: { name: message.channel.name, marketId: message.channel.marketId },
			requestId: message.requestId,
			bids: this.orderBook[message.channel.marketId].bids,
			asks: this.orderBook[message.channel.marketId].asks
		};
		console.log('return msg is', returnMessage);
		return returnMessage;
	}

	public toSignedOrder(order: any): SignedOrder {
		return {
			signature: order.signature,
			senderAddress: order.senderAddress,
			makerAddress: order.makerAddress,
			takerAddress: order.takerAddress,
			makerFee: util.stringToBN(order.makerFee),
			takerFee: util.stringToBN(order.takerFee),
			makerAssetAmount: util.stringToBN(order.makerAssetAmount),
			takerAssetAmount: util.stringToBN(order.takerAssetAmount),
			makerAssetData: order.makerAssetData,
			takerAssetData: order.takerAssetData,
			salt: util.stringToBN(order.salt),
			exchangeAddress: order.exchangeAddress,
			feeRecipientAddress: order.feeRecipientAddress,
			expirationTimeSeconds: util.stringToBN(order.expirationTimeSeconds)
		};
	}

	public determineSide(order: SignedOrder, marketId: string): string {
		const baseToken = marketId.split('-')[0];
		return assetsUtil.assetDataToTokenName(order.takerAssetData) === baseToken
			? CST.DB_BUY
			: CST.DB_SELL;
	}

	public async handleAddorder(message: any): Promise<IOrderResponseWs> {
		const order: SignedOrder = this.toSignedOrder(message.payload.order);
		const orderHash = message.payload.orderHash;
		const marketId = message.channel.marketId;

		redisUtil.publish(
			CST.ORDERBOOK_UPDATE,
			JSON.stringify({
				marketId: marketId,
				price: util.round(
					order.makerAssetAmount.div(order.takerAssetAmount).valueOf()
				),
				amount: order.makerAssetAmount.valueOf()
			})
		);

		const side = this.determineSide(order, marketId);
		matchOrdersUtil.matchOrder(order, marketId, side);

		if (await this.validateNewOrder(order, orderHash)) {
			await dynamoUtil.addLiveOrder(order, orderHash, marketId, side);

			await dynamoUtil.addRawOrder(order, orderHash);

			//TODO: Publish price delta to redis

			return {
				channel: {
					name: WsChannelName.Order,
					marketId: marketId
				},
				status: 'success',
				failedReason: ''
			};
		} else
			return {
				channel: {
					name: WsChannelName.Order,
					marketId: marketId
				},
				status: 'failed',
				failedReason: ErrorResponseWs.InvalidOrder
			};
	}

	public async handleCancel(orderHash: string, marketId: string): Promise<IOrderResponseWs> {
		try {
			// Atomic transaction needs to be ensured
			await dynamoUtil.removeLiveOrder(marketId, orderHash);
			await dynamoUtil.deleteOrderSignature(orderHash);
			return {
				channel: {
					name: WsChannelName.Order,
					marketId: marketId
				},
				status: 'success',
				failedReason: ''
			};
		} catch {
			return {
				channel: {
					name: WsChannelName.Order,
					marketId: marketId
				},
				status: 'failed',
				failedReason: ErrorResponseWs.InvalidOrder
			};
		}
	}

	// public onModifiedOrder(modifiedOrder: IDuoOrder): IDuoOrder {}

	public onRemovedOrder(removedOrder: IDuoOrder): IDuoOrder {
		const { orderRelevantState, ...rest } = removedOrder;
		const deltaOrderState: OrderRelevantState = {
			makerBalance: orderRelevantState.makerBalance,
			makerProxyAllowance: orderRelevantState.makerFeeBalance,
			makerFeeBalance: orderRelevantState.makerFeeBalance,
			makerFeeProxyAllowance: orderRelevantState.makerFeeProxyAllowance,
			filledTakerAssetAmount: orderRelevantState.filledTakerAssetAmount,
			remainingFillableMakerAssetAmount: orderRelevantState.remainingFillableMakerAssetAmount.neg(),
			remainingFillableTakerAssetAmount: orderRelevantState.remainingFillableTakerAssetAmount.neg()
		};
		return { orderRelevantState: deltaOrderState, ...rest };
	}
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
