import {
	ContractWrappers,
	orderHashUtils,
	RPCSubprovider,
	signatureUtils,
	SignedOrder,
	Web3ProviderEngine
} from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import * as CST from '../constants';
import firebaseUtil from '../firebaseUtil';
import { IDuoOrder, IOrderBook, IReturnWsMessage, IWsChannelMessageTypes } from '../types';

class RelayerUtil {
	public provider = new RPCSubprovider(CST.PROVIDER_LOCAL);
	public providerEngine = new Web3ProviderEngine();
	public zeroEx: ContractWrappers;
	public web3Wrapper: Web3Wrapper;
	public orders: IDuoOrder[] = [];

	constructor() {
		this.providerEngine.addProvider(this.provider);
		this.providerEngine.start();
		this.web3Wrapper = new Web3Wrapper(this.providerEngine);
		this.zeroEx = new ContractWrappers(this.providerEngine, { networkId: CST.NETWORK_ID_LOCAL	});
	}

	public setAllUnlimitedAllowance(tokenAddr: string, addrs: string[]): Array<Promise<string>> {
		return addrs.map(address => this.zeroEx.erc20Token.setUnlimitedProxyAllowanceAsync(tokenAddr, address));
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
		const isValidSig = await signatureUtils.isValidSignatureAsync(
			this.providerEngine,
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

	public async handleSnapshot(message: any): Promise<IReturnWsMessage> {
		console.log('WS: Received Message: ' + message.type);
		const baseTokenAddress = message.payload.baseTokenAddress;
		const quoteTokenAddress = message.payload.quoteTokenAddress;
		const requestId = message.requestId;
		const orderbook = await this.renderOrderBook(baseTokenAddress, quoteTokenAddress);
		const returnMessage = {
			type: IWsChannelMessageTypes.Snapshot,
			channel: CST.WS_CHANNEL_ORDERBOOK,
			requestId,
			payload: orderbook
		};
		return returnMessage;
	}

	public async handleUpdate(message: any): Promise<IReturnWsMessage> {
		console.log('WS: Received Message: ' + message.type);
		const requestId = message.requestId;
		const newOrder: SignedOrder = message.payload;
		const orderHash = orderHashUtils.getOrderHashHex(newOrder);
		if (this.validateNewOrder(newOrder, orderHash)) firebaseUtil.addOrder(newOrder, orderHash);
		const returnMessage = {
			type: IWsChannelMessageTypes.Update,
			channel: CST.WS_CHANNEL_ORDERBOOK,
			requestId,
			payload: newOrder
		};
		return returnMessage;
	}
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
