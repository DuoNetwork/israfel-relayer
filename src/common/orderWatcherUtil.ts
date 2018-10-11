import { ContractWrappers, orderHashUtils, OrderWatcher, RPCSubprovider, SignedOrder } from '0x.js';
import * as CST from '../constants';
import firebaseUtil from '../firebaseUtil';
import { providerEngine } from '../providerEngine';
import { IDuoOrder, IOption } from '../types';
import util from '../util';

class OrderWatcherUtil {
	public provider = new RPCSubprovider(CST.PROVIDER_LOCAL);
	// public providerEngine = new Web3ProviderEngine();
	public zeroEx: ContractWrappers;
	public orderWatcher: OrderWatcher;

	constructor() {
		// this.providerEngine.addProvider(this.provider);
		// this.providerEngine.start();
		this.zeroEx = new ContractWrappers(providerEngine, { networkId: CST.NETWORK_ID_LOCAL });
		this.orderWatcher = new OrderWatcher(providerEngine, CST.NETWORK_ID_LOCAL);
	}

	public unsubOrderWatcher() {
		this.orderWatcher.unsubscribe();
	}

	//remove orders remaining invalid for 24 hours from DB
	public async pruneOrders(option: IOption) {
		const marketId = option.token + '-' + CST.TOKEN_WETH;
		firebaseUtil.init();
		const orders = await firebaseUtil.getOrders(marketId);
		console.log('length before prune is', orders.length);
		orders.forEach(order => {
			const inValidTime = !order.isValid ? Date.now() - order.updatedAt : 0;
			console.log(inValidTime);
			if (inValidTime > CST.PENDING_HOURS * 3600000) {
				firebaseUtil.deleteOrder(order.orderHash);
				this.orderWatcher.removeOrder(order.orderHash);
				console.log('remove order!');
			}
		});
		console.log('length after prune is', orders.length);
	}

	public parseToSignedOrder(order: IDuoOrder): SignedOrder {
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

	public async startOrderWatcher(option: IOption) {
		const marketId = option.token + '-' + CST.TOKEN_WETH;
		util.logInfo('start order watcher for ' + marketId);
		firebaseUtil.init();
		const orders: IDuoOrder[] = await firebaseUtil.getOrders(marketId);

		const signedOrders: SignedOrder[] = orders.map(order => this.parseToSignedOrder(order));
		console.log('length in DB is ', signedOrders.length);
		let hash: string;
		for (const order of signedOrders) {
			const { signature, ...originalOrder } = order;
			hash = orderHashUtils.getOrderHashHex(originalOrder);
			try {
				await this.orderWatcher.addOrderAsync(order);
				console.log('succsfully added %s', hash);
			} catch (e) {
				console.log('failed to add %s', hash, 'error is ' + e);
			}
		}

		this.orderWatcher.subscribe(async (err, orderState) => {
			if (err) {
				console.log(err);
				return;
			}

			console.log(Date.now().toString(), orderState);
			if (orderState !== undefined) await firebaseUtil.updateOrderState(orderState, marketId);
		});
	}
}

const orderWatcherUtil = new OrderWatcherUtil();
export default orderWatcherUtil;
