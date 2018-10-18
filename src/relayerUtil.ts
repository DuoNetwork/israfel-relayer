import {
	ContractWrappers,
	OrderRelevantState,
	// orderHashUtils,
	signatureUtils,
	SignedOrder
} from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import moment from 'moment';
import assetsUtil from './common/assetsUtil';
import * as CST from './constants';
import dynamoUtil from './dynamoUtil';
// import firebaseUtil from './firebaseUtil';
import matchOrdersUtil from './matchOrdersUtil';
import { providerEngine } from './providerEngine';
import redisUtil from './redisUtil';
import {
	ErrorResponseWs,
	IDuoOrder,
	// IDuoSignedOrder,
	ILiveOrders,
	IOption,
	IOrderBookSnapshot,
	IOrderBookSnapshotWs,
	IOrderBookUpdateWS,
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

		for (const marketId of CST.TRADING_PAIRS) {
			util.logInfo('initializing orderBook for ' + marketId);
			const liveOrders: ILiveOrders[] = await dynamoUtil.getLiveOrders(marketId);
			this.orderBook[marketId] = this.aggrOrderBook(liveOrders);
		}
	}

	public applyChangeOrderBook(
		marketId: string,
		timestamp: number,
		bidChanges: IOrderBookUpdateWS[],
		askChanges: IOrderBookUpdateWS[]
	) {
		const newBids = [...this.orderBook[marketId].bids, ...bidChanges].sort((a, b) => {
			return a.price > b.price ? 1 : b.price > a.price ? -1 : 0;
		});
		const newAsks = [...this.orderBook[marketId].asks, ...askChanges].sort((a, b) => {
			return a.price > b.price ? -1 : b.price > a.price ? 1 : 0;
		});
		this.orderBook[marketId] = {
			timestamp: timestamp,
			bids: this.aggrByPrice(newBids),
			asks: this.aggrByPrice(newAsks)
		};
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

	public aggrOrderBook(rawLiveOrders: ILiveOrders[]): IOrderBookSnapshot {
		// const rawOrderBook = this.getOrderBook(rawOrders, marketId);

		return {
			timestamp: moment.utc().valueOf(),
			bids: this.aggrByPrice(
				rawLiveOrders
					.filter(order => order[CST.DB_SIDE] === CST.DB_BUY)
					.map(bid => this.parseOrderBookUpdate(bid))
			),
			asks: this.aggrByPrice(
				rawLiveOrders
					.filter(order => order[CST.DB_SIDE] === CST.DB_SELL)
					.map(bid => this.parseOrderBookUpdate(bid))
			)
		};
	}

	public aggrByPrice(orderInfo: IOrderBookUpdateWS[]) {
		return orderInfo.reduce((past: IOrderBookUpdateWS[], current) => {
			const same = past.find(r => r && r.price === current.price);
			if (same) same.amount = (Number(same.amount) + Number(current.amount)).toString();
			else past.push(current);
			return past;
		}, []);
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

	public getOrderBook(orders: IDuoOrder[], marketId: string): IDuoOrder[][] {
		const baseToken = marketId.split('-')[0];
		const bidOrders = orders.filter(order => {
			const takerTokenName = order.takerAssetData
				? assetsUtil.assetDataToTokenName(order.takerAssetData)
				: null;
			return takerTokenName === baseToken;
		});

		const askOrders = orders.filter(order => {
			const makerTokenName = order.makerAssetData
				? assetsUtil.assetDataToTokenName(order.makerAssetData)
				: null;
			return makerTokenName === baseToken;
		});

		return [bidOrders, askOrders];
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
				price: util.keepPrecision(
					order.makerAssetAmount.div(order.takerAssetAmount).valueOf(),
					CST.PRICE_PRECISION
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

	public parseOrderBookUpdate(order: ILiveOrders): IOrderBookUpdateWS {
		return {
			amount: order.amount.toString(),
			price: order.price.toString()
		};
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
