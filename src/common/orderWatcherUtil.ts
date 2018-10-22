import { ContractWrappers, OrderWatcher, RPCSubprovider } from '0x.js';
import * as CST from '../constants';
import dynamoUtil from '../dynamoUtil';
import { providerEngine } from '../providerEngine';
import { ILiveOrders, IOption } from '../types';
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

	public init(tool: string, option: IOption) {
		const config = require('../keys/' + (option.live ? 'live' : 'dev') + '/dynamo.json');
		dynamoUtil.init(config, option.live, tool);
	}

	public unsubOrderWatcher() {
		this.orderWatcher.unsubscribe();
	}

	//remove orders remaining invalid for 24 hours from DB
	public async pruneOrders(option: IOption) {
		const pair = option.token + '-' + CST.TOKEN_WETH;
		const orders = await dynamoUtil.getLiveOrders(pair);
		console.log('length before prune is', orders.length);
		orders.forEach(order => {
			const inValidTime = !order.isValid ? Date.now() - order.updatedAt : 0;
			console.log(inValidTime);
			if (inValidTime > CST.PENDING_HOURS * 3600000) {
				dynamoUtil.removeLiveOrder(pair, order.orderHash);
				this.orderWatcher.removeOrder(order.orderHash);
				console.log('remove order!');
			}
		});
		console.log('length after prune is', orders.length);
	}

	public async startOrderWatcher(option: IOption) {
		const pair = option.token + '-' + CST.TOKEN_WETH;
		util.logInfo('start order watcher for ' + pair);
		const liveOrders: ILiveOrders[] = await dynamoUtil.getLiveOrders(pair);

		console.log('length in DB is ', liveOrders.length);
		for (const order of liveOrders)
			try {
				await this.orderWatcher.addOrderAsync(
					await dynamoUtil.getRawOrder(order.orderHash)
				);
				console.log('succsfully added %s', order.orderHash);
			} catch (e) {
				console.log('failed to add %s', order.orderHash, 'error is ' + e);
			}

		this.orderWatcher.subscribe(async (err, orderState) => {
			if (err) {
				console.log(err);
				return;
			}

			console.log(Date.now().toString(), orderState);
			if (orderState !== undefined) await dynamoUtil.updateOrderState(orderState, pair);
		});
	}
}

const orderWatcherUtil = new OrderWatcherUtil();
export default orderWatcherUtil;
