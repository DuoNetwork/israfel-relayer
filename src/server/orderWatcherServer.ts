import { OrderState, OrderWatcher } from '0x.js';
import SequenceClient from '../client/SequenceClient';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOption,
	IOrderWatcherCacheItem,
	IRawOrder,
	IStringSignedOrder,
	IWsOrderSequenceResponse
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderUtil from '../utils/orderUtil';
import relayerUtil from '../utils/relayerUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class OrderWatcherServer extends SequenceClient {
	public sequenceMethods = [CST.DB_UPDATE, CST.DB_EXPIRE];
	public orderWatcher: OrderWatcher | null = null;
	public requestCache: { [methodPairOrderHash: string]: IOrderWatcherCacheItem } = {};
	public web3Util: Web3Util | null = null;
	public watchingOrders: string[] = [];

	public async handleSequenceResponse(
		res: IWsOrderSequenceResponse,
		cacheKey: string,
		cahceItem: IOrderWatcherCacheItem
	) {
		util.logDebug(cacheKey);
		const { sequence, pair } = res;
		if (!(await relayerUtil.handleUpdateOrder(sequence, pair, cahceItem)))
			if (this.orderWatcher) {
				await this.orderWatcher.removeOrder(cahceItem.orderState.orderHash);
				this.watchingOrders = this.watchingOrders.filter(
					hash => hash !== cahceItem.orderState.orderHash
				);
			}
	}

	public unsubOrderWatcher() {
		if (this.orderWatcher) this.orderWatcher.unsubscribe();
	}

	public async handleOrderWatcherUpdate(pair: string, orderState: OrderState) {
		if (!this.sequenceWsClient) {
			util.logError('sequence service is unavailable');
			return;
		}

		this.requestSequence(CST.DB_UPDATE, pair, orderState.orderHash);
		this.requestCache[`${CST.DB_UPDATE}|${pair}|${orderState.orderHash}`] = {
			pair,
			method: CST.DB_UPDATE,
			orderState
		};
	}

	public async startOrderWatcher(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		await this.connectToSequenceServer(option.server);
		this.orderWatcher = new OrderWatcher(
			this.web3Util.web3Wrapper.getProvider(),
			option.live ? CST.NETWORK_ID_MAIN : CST.NETWORK_ID_KOVAN
		);

		const pair = option.token + '-' + CST.TOKEN_WETH;
		if (option.server) {
			dynamoUtil.updateStatus(pair);
			setInterval(() => dynamoUtil.updateStatus(pair, this.watchingOrders.length), 10000);
		}

		util.logInfo('start order watcher for ' + pair);
		const liveOrders: ILiveOrder[] = await dynamoUtil.getLiveOrders(pair);
		util.logInfo('length in DB is ' + liveOrders.length);

		if (this.orderWatcher) {
			for (const order of liveOrders)
				try {
					const rawOrder: IRawOrder | null = await dynamoUtil.getRawOrder(
						order.orderHash
					);
					if (rawOrder && rawOrder.signedOrder.signature) {
						await this.orderWatcher.addOrderAsync(
							orderUtil.parseSignedOrder(rawOrder.signedOrder as IStringSignedOrder)
						);

						this.watchingOrders.push(order.orderHash);
						util.logDebug('succsfully added ' + order.orderHash);
					}
				} catch (e) {
					util.logError('failed to add ' + order.orderHash + 'error is ' + e);
				}

			this.orderWatcher.subscribe(async (err, orderState) => {
				if (err) {
					util.logError(err);
					return;
				}

				util.logDebug(JSON.stringify(orderState));
				if (orderState) this.handleOrderWatcherUpdate(pair, orderState);
			});
		}
	}
}

const orderWatcherServer = new OrderWatcherServer();
export default orderWatcherServer;
