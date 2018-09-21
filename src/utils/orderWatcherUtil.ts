import {
	ContractWrappers,
	OrderWatcher,
	RPCSubprovider,
	SignedOrder,
	Web3ProviderEngine
} from '0x.js';
import * as CST from '../constants';
import firebaseUtil from '../firebaseUtil';
import { IDuoOrder } from '../types';

class OrderWatcherUtil {
	public provider = new RPCSubprovider(CST.PROVIDER_LOCAL);
	public providerEngine = new Web3ProviderEngine();
	public zeroEx: ContractWrappers;
	public orderWatcher: OrderWatcher;

	constructor() {
		this.providerEngine.addProvider(this.provider);
		this.providerEngine.start();
		this.zeroEx = new ContractWrappers(this.providerEngine, { networkId: CST.NETWORK_ID_LOCAL });
		this.orderWatcher = new OrderWatcher(this.providerEngine, CST.NETWORK_ID_LOCAL);
	}

	public async subscribeOrderWatcher() {
		this.orderWatcher.subscribe(async (err, orderState) => {
			if (err) {
				console.log(err);
				return;
			}

			console.log(Date.now().toString(), 'Subscribed rderstate is %s', orderState);
			if (orderState !== undefined) await firebaseUtil.updateOrderState(orderState);
		});
	}

	public unsubOrderWatcher() {
		this.orderWatcher.unsubscribe();
	}

	//remove orders remaining invalid for 24 hours from DB
	public async pruneOrders(orders: IDuoOrder[]) {
		for (const order of orders) {
			const inValidTime = !order.isValid ? Date.now() - order.updatedAt : 0;
			const signedOrder: SignedOrder = {
				senderAddress: order.senderAddress,
				makerAddress: order.makerAddress,
				takerAddress: order.takerAddress,
				makerFee: order.makerFee,
				takerFee: order.takerFee,
				makerAssetData: order.makerAssetData,
				takerAssetData: order.takerAssetData,
				makerAssetAmount: order.makerAssetAmount,
				takerAssetAmount: order.takerAssetAmount,
				feeRecipientAddress: order.feeRecipientAddress,
				salt: order.salt,
				exchangeAddress: order.exchangeAddress,
				expirationTimeSeconds: order.expirationTimeSeconds,
				signature: order.signature
			};
			if (inValidTime > CST.PENDING_HOURS * 3600000) {
				firebaseUtil.deleteOrder(order.orderHash);
				await this.orderWatcher.removeOrder(order.orderHash);
				console.log('order removed!');
			} else {
				// await this.orderWatcher.removeOrder(order.orderHash);
				await this.orderWatcher.addOrderAsync(signedOrder);
				console.log('order added to watcher!');
			}
		}
	}
}

const orderWatcherUtil = new OrderWatcherUtil();
export default orderWatcherUtil;
