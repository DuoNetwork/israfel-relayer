import { ZeroEx } from '0x.js';
import { SignedOrder } from '@0xproject/connect';
import { OrderbookChannelMessageTypes } from '@0xproject/connect/lib/src/types';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import * as Web3 from 'web3';
import * as CST from '../constants';
import firebaseUtil from '../firebaseUtil';
import { IDuoOrder, IOrderBook, IReturnWsMessage } from '../types';

class RelayerUtil {
	public zeroEx: ZeroEx;
	public provider = new Web3.providers.HttpProvider(CST.PROVIDER_LOCAL);
	public orders: IDuoOrder[] = [];

	constructor() {
		this.zeroEx = new ZeroEx(this.provider, {
			networkId: CST.NETWORK_ID_LOCAL
		});
	}

	public setAllUnlimitedAllowance(tokenAddr: string, addrs: string[]): Array<Promise<string>> {
		return addrs.map(address =>
			this.zeroEx.token.setUnlimitedProxyAllowanceAsync(tokenAddr, address)
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
				return this.zeroEx.awaitTransactionMinedAsync(tx);
			})
		);
	}

	public validateNewOrder(signedOrder: SignedOrder, orderHash: string): boolean {
		const { orderSchema } = schemas;
		const { ecSignature, ...rest } = signedOrder;
		const validator = new SchemaValidator();
		const isValidSchema = validator.validate(rest, orderSchema).valid;
		const isValidSig = ZeroEx.isValidSignature(orderHash, ecSignature, rest.maker);
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
				order.takerTokenAddress === baseTokenAddress &&
				order.makerTokenAddress === quoteTokenAddress
			);
		});
		const asks = this.orders.filter(order => {
			return (
				order.takerTokenAddress === quoteTokenAddress &&
				order.makerTokenAddress === baseTokenAddress
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
			type: OrderbookChannelMessageTypes.Snapshot,
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
		const orderHash = ZeroEx.getOrderHashHex(newOrder);
		if (this.validateNewOrder(newOrder, orderHash)) firebaseUtil.addOrder(newOrder, orderHash);
		const returnMessage = {
			type: OrderbookChannelMessageTypes.Update,
			channel: CST.WS_CHANNEL_ORDERBOOK,
			requestId,
			payload: newOrder
		};
		return returnMessage;
	}
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
