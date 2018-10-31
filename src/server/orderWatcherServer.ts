import { OrderWatcher, RPCSubprovider } from '0x.js';
import SequenceClient from '../client/SequenceClient';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOption,
	IOrderWatcherCacheItem,
	IRawOrder,
	IStringSignedOrder,
	IWsOrderSequenceResponse,
	IWsResponse
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderUtil from '../utils/orderUtil';
import relayerUtil from '../utils/relayerUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class OrderWatcherServer extends SequenceClient {
	public provider = new RPCSubprovider(CST.PROVIDER_LOCAL);
	public orderWatcher: OrderWatcher | null = null;
	public requestCache: { [methodPairOrderHash: string]: IOrderWatcherCacheItem } = {};
	public web3Util: Web3Util | null = null;
	public watchedOrders: string[] = [];

	public unsubOrderWatcher() {
		if (this.orderWatcher) this.orderWatcher.unsubscribe();
	}

	public async startOrderWatcher(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		this.orderWatcher = new OrderWatcher(
			this.web3Util.web3Wrapper.getProvider(),
			CST.NETWORK_ID_LOCAL
		);

		let url = `ws://13.251.115.119:8080`;
		if (option.server) {
			const sequenceService = await dynamoUtil.getServices(CST.DB_SEQUENCE);
			if (!sequenceService.length) {
				util.logInfo('no sequence service config, exit');
				return;
			}
			util.logInfo('loaded sequence service config');
			util.logInfo(sequenceService[0]);
			url = sequenceService[0].url;
		}

		this.connectToSequenceServer(url);

		const pair = option.token + '-' + CST.TOKEN_WETH;
		dynamoUtil.updateStatus(CST.DB_ORDER_WATCHER);
		setInterval(
			() =>
				dynamoUtil.updateStatus(
					`${CST.DB_ORDER_WATCHER}|${pair}`,
					this.watchedOrders.length
				),
			10000
		);

		util.logInfo('start order watcher for ' + pair);
		const liveOrders: ILiveOrder[] = await dynamoUtil.getLiveOrders(pair);

		util.logInfo('length in DB is ' + liveOrders.length);
		if (this.orderWatcher) {
			for (const order of liveOrders)
				try {
					const rawOrder: IRawOrder | null = await dynamoUtil.getRawOrder(
						order.orderHash
					);
					if (rawOrder) {
						await this.orderWatcher.addOrderAsync(
							orderUtil.parseSignedOrder(rawOrder.signedOrder as IStringSignedOrder)
						);

						this.watchedOrders.push(order.orderHash);
						util.logInfo('succsfully added ' + order.orderHash);
					}
				} catch (e) {
					util.logInfo('failed to add ' + order.orderHash + 'error is ' + e);
				}

			this.orderWatcher.subscribe(async (err, orderState) => {
				if (err) util.logError(err);

				util.logInfo(Date.now().toString() + JSON.stringify(orderState));
				if (orderState !== undefined) {
					if (!this.sequenceWsClient) throw new Error('sequence service is unavailable');
					this.requestSequence(CST.DB_UPDATE, pair, orderState.orderHash);
					this.requestCache[`${CST.DB_UPDATE}|${pair}|${orderState.orderHash}`] = {
						pair,
						method: CST.DB_UPDATE,
						orderState
					};
				}
			});
		}
	}

	public async handleSequenceMessage(m: string) {
		const res: IWsResponse = JSON.parse(m);
		if (res.channel !== CST.DB_SEQUENCE || res.status !== CST.WS_OK) return;

		const { sequence, pair, orderHash, method } = res as IWsOrderSequenceResponse;
		if (!sequence || !pair || !orderHash) {
			util.logDebug('returned sequence messae is wrong');
			return;
		}
		const requestId = `${method}|${pair}|${orderHash}`;
		if (!this.requestCache[requestId]) {
			util.logDebug('request id does not exist');
			return;
		}

		const queueItem = this.requestCache[requestId];
		delete this.requestCache[requestId];
		if (!queueItem) return;

		if (!(await relayerUtil.handleUpdateOrder(sequence, pair, queueItem)))
			if (this.orderWatcher) {
				await this.orderWatcher.removeOrder(queueItem.orderState.orderHash);
				this.watchedOrders = this.watchedOrders.filter(
					hash => hash !== queueItem.orderState.orderHash
				);
			}
	}

	//remove orders remaining invalid for 24 hours from DB
	// public async pruneOrders(option: IOption) {
	// 	const pair = option.token + '-' + CST.TOKEN_WETH;
	// 	const orders = await dynamoUtil.getLiveOrders(pair);
	// 	console.log('length before prune is', orders.length);
	// 	orders.forEach(order => {
	// 		const inValidTime = !order.isValid ? Date.now() - order.updatedAt : 0;
	// 		console.log(inValidTime);
	// 		if (inValidTime > CST.PENDING_HOURS * 3600000) {
	// 			dynamoUtil.removeLiveOrder(pair, order.orderHash);
	// 			this.orderWatcher.removeOrder(order.orderHash);
	// 			console.log('remove order!');
	// 		}
	// 	});
	// 	console.log('length after prune is', orders.length);
	// }
}

const orderWatcherServer = new OrderWatcherServer();
export default orderWatcherServer;
