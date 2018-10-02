import {
	assetDataUtils,
	ContractWrappers,
	//  orderHashUtils,
	signatureUtils,
	SignedOrder
} from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import * as CST from './constants';
import firebaseUtil from './firebaseUtil';
import { providerEngine } from './providerEngine';
import {
	ErrorResponseWs,
	ICancelOrderResponseWs,
	IDuoOrder,
	IDuoSignedOrder,
	// IOrderBook,
	IOrderBookSnapshotWs,
	// IOrderBookUpdateWS,
	IOrderInfo,
	IOrderStateCancelled,
	IUpdateResponseWs,
	WsChannelName
} from './types';

class RelayerUtil {
	public contractWrappers: ContractWrappers;
	public web3Wrapper: Web3Wrapper;
	public orders: IDuoOrder[] = [];
	// public returnOrders: IUpdatePayloadWs[] = [];

	constructor() {
		this.web3Wrapper = new Web3Wrapper(providerEngine);
		this.contractWrappers = new ContractWrappers(providerEngine, {
			networkId: CST.NETWORK_ID_LOCAL
		});
	}

	public async validateNewOrder(signedOrder: SignedOrder, orderHash: string): Promise<boolean> {
		const { orderSchema } = schemas;
		const { signature, ...rest } = signedOrder;
		const validator = new SchemaValidator();
		const isValidSchema = validator.validate(rest, orderSchema).valid;
		// const ECSignature = signatureUtils.parseECSignature(signature);
		// console.log(ECSignature);
		const isValidSig = await signatureUtils.isValidSignatureAsync(
			providerEngine,
			orderHash,
			signature,
			rest.makerAddress
		);
		console.log('schema is %s and signature is %s', isValidSchema, isValidSig);
		return isValidSchema && isValidSig;
	}

	public async aggrOrderBook(rawOrderBook: IDuoOrder[], marketId: string): Promise<any> {
		cosnt baseToken = 
		const bids = rawOrderBook.filter(order => order.makerAssetData )
		// const bidAggr = this.aggrByPrice(
		// 	rawOrderBook.bids.map(bid => this.parseOrderInfo(bid, marketId))
		// );
		// const askAggr = this.aggrByPrice(
		// 	rawOrderBook.asks.map(ask => this.parseOrderInfo(ask, marketId))
		// );
		// console.log('length of bids is ' + bidAggr.length);
		// console.log('length of asks is ' + askAggr.length);
		// return {
		// 	bids: bidAggr,
		// 	asks: askAggr
		// };
	}

	public aggrByPrice(orderInfo: IOrderInfo[]) {
		return orderInfo.reduce((past: IOrderInfo[], current) => {
			const same = past.find(r => r && r.price === current.price);
			if (same) same.amount = (Number(same.amount) + Number(current.amount)).toString();
			else past.push(current);
			return past;
		}, []);
	}

	public async handleSubscribe(message: any): Promise<IOrderBookSnapshotWs> {
		console.log('Handle Message: ' + message.type);
		const rawOrders: IDuoOrder[] = await firebaseUtil.getOrders(
			message.channel.marketId
		);
		const orderbook = await this.aggrOrderBook(rawOrders, message.channel.marketId);
		const returnMessage = {
			type: message.type,
			channel: { name: message.channel.name, marketId: message.channel.marketId },
			requestId: message.requestId,
			payload: orderbook
		};
		return returnMessage;
	}

	public async handleDBChanges(changedOrders: IDuoOrder[], marketId: string) {
		console.log(changedOrders, '###### changed orders');
		const bids = changedOrders.filter(order => {
			const takerTokenName = this.assetDataToTokenName(order.takerAssetData);
			return takerTokenName === marketId.split('-')[1];
		});

		const asks = changedOrders.filter(order => {
			const makerTokenName = this.assetDataToTokenName(order.makerAssetData);
			return makerTokenName === marketId.split('-')[1];
		});
		const changedOrderbook: IOrderBook = {
			bids: bids,
			asks: asks
		};

		return await this.aggrOrderBook(changedOrderbook, marketId);
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

	public async handleAddorder(message: any): Promise<IUpdateResponseWs | string> {
		console.log(message.payload);
		const order: SignedOrder = message.payload.order;
		const orderHash = message.payload.orderHash;
		const parsedOrder = this.parseOrderInfo(order, message.channel.marketId);

		if (await this.validateNewOrder(order, orderHash)) {
			await firebaseUtil.addOrder(
				this.parseSignedOrder(order),
				orderHash,
				message.channel.marketId
			);
			return {
				type: message.type,
				channel: {
					name: WsChannelName.Orderbook,
					marketId: parsedOrder.marketId
				},
				changes: [
					{
						side: parsedOrder.side,
						price: parsedOrder.price,
						amount: parsedOrder.amount
					}
				]
			};
		} else return ErrorResponseWs.InvalidOrder;
	}

	public async handleCancel(
		orderHash: string,
		marketId: string
	): Promise<ICancelOrderResponseWs | string> {
		if (firebaseUtil.isExistRef(orderHash)) {
			const cancelledOrderState: IOrderStateCancelled = {
				isCancelled: true,
				orderHash: orderHash
			};
			await firebaseUtil.updateOrderState(cancelledOrderState, marketId);
			console.log('cancelled order');
			return {
				status: 'success',
				orderHash: orderHash
			};
			// return 'success';
		} else return ErrorResponseWs.NoExistOrder;
	}

	public assetDataToTokenName(assetData: string): string {
		const tokenAddr = assetDataUtils.decodeERC20AssetData(assetData).tokenAddress;
		return CST.TOKEN_MAPPING[tokenAddr];
	}

	public parseOrderInfo(order: SignedOrder | IDuoOrder, marketId: string): IOrderInfo {
		const makerToken = this.assetDataToTokenName(order.makerAssetData);
		const takerToken = this.assetDataToTokenName(order.takerAssetData);
		return {
			makerTokenName: makerToken,
			takerTokenName: takerToken,
			marketId: marketId,
			side: makerToken === marketId.split('-')[1] ? CST.ORDER_SELL : CST.ORDER_BUY,
			amount: order.takerAssetAmount.toString(),
			price: (Number(order.makerAssetAmount) / Number(order.takerAssetAmount)).toString()
		};
	}
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
