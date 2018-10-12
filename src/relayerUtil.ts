import {
	assetDataUtils,
	ContractWrappers,
	OrderRelevantState,
	// orderHashUtils,
	signatureUtils,
	SignedOrder
} from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import * as CST from './constants';
import firebaseUtil from './firebaseUtil';
import matchOrdersUtil from './matchOrdersUtil';
import { providerEngine } from './providerEngine';
import {
	ErrorResponseWs,
	IDuoOrder,
	IDuoSignedOrder,
	IOrderBookSnapshot,
	IOrderBookSnapshotWs,
	IOrderBookUpdateWS,
	IOrderResponseWs,
	IOrderStateCancelled,
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

	public async init() {
		for (const marketId of CST.TRADING_PAIRS) {
			util.logInfo('initializing orderBook for ' + marketId);
			const rawOrders: IDuoOrder[] = await firebaseUtil.getOrders(marketId);
			const timestamp = Date.now();
			this.orderBook[marketId] = this.aggrOrderBook(rawOrders, marketId, timestamp);
		}
	}

	public applyChangeOrderBook(
		marketId: string,
		timestamp: number,
		bidChanges: IOrderBookUpdateWS[],
		askChanges: IOrderBookUpdateWS[]
	) {
		const newBids = [...this.orderBook[marketId].bids, ...bidChanges];
		const newAsks = [...this.orderBook[marketId].asks, ...askChanges];
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

	public aggrOrderBook(
		rawOrders: IDuoOrder[],
		marketId: string,
		timestamp: number
	): IOrderBookSnapshot {
		const rawOrderBook = this.getOrderBook(rawOrders, marketId);
		const bidAggr: IOrderBookUpdateWS[] = this.aggrByPrice(
			rawOrderBook[0].map(bid => this.parseOrderInfo(bid))
		);
		const askAggr: IOrderBookUpdateWS[] = this.aggrByPrice(
			rawOrderBook[1].map(ask => this.parseOrderInfo(ask))
		);
		console.log('length of bids is ' + bidAggr.length);
		console.log('length of asks is ' + askAggr.length);
		return {
			timestamp: timestamp,
			bids: bidAggr,
			asks: askAggr
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
				? this.assetDataToTokenName(order.takerAssetData)
				: null;
			return takerTokenName === baseToken;
		});

		const askOrders = orders.filter(order => {
			const makerTokenName = order.makerAssetData
				? this.assetDataToTokenName(order.makerAssetData)
				: null;
			return makerTokenName === baseToken;
		});

		return [bidOrders, askOrders];
	}

	public parseSignedOrder(order: SignedOrder): IDuoSignedOrder {
		return {
			signature: order.signature,
			senderAddress: order.senderAddress,
			makerAddress: order.makerAddress,
			takerAddress: order.takerAddress,
			makerFee: order.makerFee.valueOf(),
			takerFee: order.takerFee.valueOf(),
			makerAssetAmount: order.makerAssetAmount.valueOf(),
			takerAssetAmount: order.takerAssetAmount.valueOf(),
			makerAssetData: order.makerAssetData,
			takerAssetData: order.takerAssetData,
			salt: order.salt.valueOf(),
			exchangeAddress: order.exchangeAddress,
			feeRecipientAddress: order.feeRecipientAddress,
			expirationTimeSeconds: order.expirationTimeSeconds.valueOf()
		};
	}

	public async handleAddorder(message: any): Promise<IOrderResponseWs> {
		console.log(message.payload);
		const order: SignedOrder = message.payload.order;
		const orderHash = message.payload.orderHash;
		matchOrdersUtil.matchOrder(order, message.channel.marketId);

		if (await this.validateNewOrder(order, orderHash)) {
			await firebaseUtil.addOrder(
				this.parseSignedOrder(order),
				orderHash,
				message.channel.marketId
			);
			return {
				channel: {
					name: WsChannelName.Order,
					marketId: message.channel.marketId
				},
				status: 'success',
				failedReason: ''
			};
		} else
			return {
				channel: {
					name: WsChannelName.Order,
					marketId: message.channel.marketId
				},
				status: 'failed',
				failedReason: ErrorResponseWs.InvalidOrder
			};
	}

	public async handleCancel(orderHash: string, marketId: string): Promise<IOrderResponseWs> {
		if (firebaseUtil.isExistRef(orderHash)) {
			const cancelledOrderState: IOrderStateCancelled = {
				isCancelled: true,
				orderHash: orderHash
			};
			await firebaseUtil.updateOrderState(cancelledOrderState, marketId);
			console.log('cancelled order');
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

	public assetDataToTokenName(assetData: string): string {
		const tokenAddr = assetDataUtils.decodeERC20AssetData(assetData).tokenAddress;
		return CST.TOKEN_MAPPING[tokenAddr];
	}

	public parseOrderInfo(order: IDuoOrder): IOrderBookUpdateWS {
		return {
			amount: order.orderRelevantState.remainingFillableTakerAssetAmount.toString(),
			price: (util.stringToBN(order.makerAssetAmount).div(util.stringToBN(order.takerAssetAmount))).toString()
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
