import {
	assetDataUtils,
	ContractWrappers,
	//  orderHashUtils,
	signatureUtils,
	SignedOrder
} from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import * as CST from '../constants';
import firebaseUtil from '../firebaseUtil';
import { providerEngine } from '../providerEngine';
import {
	ErrorResponseWs,
	ICancelOrderResponseWs,
	IDuoOrder,
	IOrderBook,
	IOrderBookSnapshotWs,
	// IOrderBookUpdateWS,
	IOrderInfo,
	IOrderStateCancelled,
	IUpdateResponseWs,
	WsChannelName
} from '../types';

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

	public async aggrOrderBook(baseTokenAddress: string, quoteTokenAddress: string): Promise<any> {
		const rawOrderBook: IOrderBook = await firebaseUtil.getOrderBook(
			baseTokenAddress,
			quoteTokenAddress
		);
		const bidAggr = this.aggrByPrice(rawOrderBook.bids.map(bid => this.parseOrderInfo(bid)));
		const askAggr = this.aggrByPrice(rawOrderBook.asks.map(ask => this.parseOrderInfo(ask)));
		return { bidAggr, askAggr };
	}

	public aggrByPrice(orderInfo: IOrderInfo[]) {
		return orderInfo.reduce((rv: IOrderInfo[], v) => {
			const el = rv.find(r => r && r.price === v.price);
			if (el) el.amount = (Number(el.amount) + Number(v.amount)).toString();
			else rv.push(v);
			return rv;
		}, []);
	}

	public async handleSnapshot(message: any): Promise<IOrderBookSnapshotWs> {
		console.log('WS: Received Message: ' + message.type);
		const baseTokenAddress = message.payload.baseTokenAddress;
		const quoteTokenAddress = message.payload.quoteTokenAddress;
		const orderbook = await this.aggrOrderBook(baseTokenAddress, quoteTokenAddress);
		const returnMessage = {
			type: message.type,
			channel: message.channel,
			requestId: message.requestId,
			payload: orderbook
		};
		return returnMessage;
	}

	public async handleAddorder(message: any): Promise<IUpdateResponseWs | string> {
		console.log(message.payload);
		const order: SignedOrder = message.payload.order;
		const orderHash = message.payload.orderHash;
		const parsedOrder = this.parseOrderInfo(order);

		if (await this.validateNewOrder(order, orderHash)) {
			await firebaseUtil.addOrder(order, orderHash, message.channel.marketId);
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

	public async handleCancel(orderHash: string): Promise<ICancelOrderResponseWs | string> {
		if (firebaseUtil.isExistRef(orderHash)) {
			const cancelledOrderState: IOrderStateCancelled = {
				isCancelled: true,
				orderHash: orderHash
			};
			await firebaseUtil.updateOrderState(cancelledOrderState);
			return {
				status: 'success',
				orderHash: orderHash
			};
			// return 'success';
		} else return ErrorResponseWs.NoExistOrder;
	}

	public parseOrderInfo(order: SignedOrder | IDuoOrder): IOrderInfo {
		const makerTokenAddr = assetDataUtils.decodeERC20AssetData(order.makerAssetData);
		const takerTokenAddr = assetDataUtils.decodeERC20AssetData(order.takerAssetData);
		const makerToken = CST.TOKEN_MAPPING[makerTokenAddr.tokenAddress];
		const takerToken = CST.TOKEN_MAPPING[takerTokenAddr.tokenAddress];
		return {
			takerTokenName: makerToken,
			makerTokenName: takerToken,
			marketId:
				(makerToken === CST.TOKEN_WETH ? takerToken : CST.TOKEN_WETH) +
				'-' +
				CST.TOKEN_WETH,
			side: makerToken === CST.TOKEN_ZRX ? CST.ORDER_SELL : CST.ORDER_BUY,
			amount: order.takerAssetAmount.toString(),
			price: (Number(order.makerAssetAmount) / Number(order.takerAssetAmount)).toString()
		};
	}
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
