import {
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
	IDuoOrder,
	IOrderBook,
	IOrderBookSnapshotWs,
	IOrderBookUpdateWS,
	IUpdateResponseWs,
	WsChannel,
	WsChannelMessageTypes
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

	public setAllUnlimitedAllowance(tokenAddr: string, addrs: string[]): Array<Promise<string>> {
		return addrs.map(address =>
			this.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(tokenAddr, address)
		);
	}

	public async setBaseQuoteAllowance(
		baseToken: string,
		quoteToken: string,
		addrs: string[]
	): Promise<void> {
		const responses = await Promise.all(
			this.setAllUnlimitedAllowance(quoteToken, addrs).concat(
				this.setAllUnlimitedAllowance(baseToken, addrs)
			)
		);
		await Promise.all(
			responses.map(tx => {
				return this.web3Wrapper.awaitTransactionSuccessAsync(tx);
			})
		);
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

	public async renderOrderBook(
		baseTokenAddress: string,
		quoteTokenAddress: string
	): Promise<IOrderBook> {
		this.orders = await firebaseUtil.getOrders();
		const bids = this.orders.filter(order => {
			return (
				order.takerAssetData === baseTokenAddress &&
				order.makerAssetData === quoteTokenAddress
			);
		});
		const asks = this.orders.filter(order => {
			return (
				order.takerAssetData === quoteTokenAddress &&
				order.makerAssetData === baseTokenAddress
			);
		});
		return {
			bids,
			asks
		};
	}

	public async handleSnapshot(message: any): Promise<IOrderBookSnapshotWs> {
		console.log('WS: Received Message: ' + message.type);
		const baseTokenAddress = message.payload.baseTokenAddress;
		const quoteTokenAddress = message.payload.quoteTokenAddress;
		const requestId = message.requestId;
		const orderbook = await this.renderOrderBook(baseTokenAddress, quoteTokenAddress);
		const returnMessage = {
			type: WsChannelMessageTypes.Subscribe,
			channel: WsChannel.Orderbook,
			requestId,
			payload: orderbook
		};
		return returnMessage;
	}

	public async handleAddorder(message: any): Promise<IUpdateResponseWs> {
		const requestId = message.requestId;
		// const receiveOrder: SignedOrder = message.payload.order;
		const order: SignedOrder = message.payload;
		const orderHash = message.orderHash;
		console.log(message.payload);
		// const orderHash = orderHashUtils.getOrderHashHex(order);
		console.log(orderHash);

		return {
			type: CST.WS_TYPE_ORDER_ADD,
			channel: CST.WS_CHANNEL_ORDER,
			requestId,
			payload: await this.newOrderHandler(order, orderHash)
		};
	}

	public async newOrderHandler(
		order: SignedOrder,
		orderHash: string
	): Promise<IOrderBookUpdateWS | string> {
		if (await this.validateNewOrder(order, orderHash)) {
			console.log('save order to db');
			await firebaseUtil.addOrder(order, orderHash);
			return {
				type: CST.WS_TYPE_ORDER_ADD,
				// channel: CST.WS_CHANNEL_ORDER,
				pair: order.makerAssetData + order.takerAssetData,
				changes: [
					{
						side: 'sell',
						price: '',
						amount: ''
					}
				]
			};
			// const returnOrders: IOrderBookUpdateWS[] = await this.getDBUpdates();
			// return returnOrders;
		} else return ErrorResponseWs.InvalidOrder;
	}

	// public async getDBUpdates(): IUpdatePayloadWs[] {}
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
