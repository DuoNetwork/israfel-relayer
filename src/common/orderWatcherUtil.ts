import { ContractWrappers, orderHashUtils, OrderWatcher, RPCSubprovider, SignedOrder } from '0x.js';
import * as CST from '../constants';
import dynamoUtil from '../dynamoUtil';
import { providerEngine } from '../providerEngine';
import { IDuoOrder, ILiveOrders, IOption } from '../types';
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

	public init(option: IOption, tool: string) {
		const config = require('./keys/' + (option.live ? 'live' : 'dev') + '/dynamo.json');
		dynamoUtil.init(config, option.live, tool);
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

		const liveOrders: ILiveOrders[] = await dynamoUtil.getLiveOrders(marketId);

		let hash: string;
		for (const order of liveOrders) {
			// const { signature, ...originalOrder } = order;
			const rawOrder: SignedOrder = await dynamoUtil.getRawOrder(order.orderHash);
			hash = orderHashUtils.getOrderHashHex(rawOrder);
			try {
				await this.orderWatcher.addOrderAsync(rawOrder);
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
			if (orderState !== undefined) await dynamoUtil.updateOrderState(orderState, marketId);
		});
	}
}

const orderWatcherUtil = new OrderWatcherUtil();
export default orderWatcherUtil;
