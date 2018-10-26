import { OrderState, OrderWatcher, RPCSubprovider } from '0x.js';
import SequenceClient from '../client/SequenceClient';
import * as CST from '../common/constants';
import { ILiveOrder, IOption, IRawOrder, IWsRequest, IWsResponse, IWsSequenceResponse } from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderUtil from '../utils/orderUtil';
import relayerUtil from '../utils/relayerUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util1';

class OrderWatcherServer extends SequenceClient {
	public provider = new RPCSubprovider(CST.PROVIDER_LOCAL);
	public orderWatcher: OrderWatcher | null = null;
	public requestQueue: { [pair: string]: OrderState[] } = {};
	public web3Util: Web3Util | null = null;
	public numOfWatchedOrders: number = 0;

	public init(live: boolean) {
		this.web3Util = new Web3Util();
		this.orderWatcher = new OrderWatcher(
			this.web3Util.web3Wrapper.getProvider(),
			CST.NETWORK_ID_LOCAL
		);
		this.connectToSequenceServer(live);
	}

	public unsubOrderWatcher() {
		if (this.orderWatcher) this.orderWatcher.unsubscribe();
	}

	public async startOrderWatcher(option: IOption) {
		dynamoUtil.updateStatus(CST.DB_ORDER_WATCHER);
		setInterval(
			() => dynamoUtil.updateStatus(CST.DB_ORDER_WATCHER, this.numOfWatchedOrders),
			10000
		);

		const pair = option.token + '-' + CST.TOKEN_WETH;
		util.logInfo('start order watcher for ' + pair);
		const liveOrders: ILiveOrder[] = await dynamoUtil.getLiveOrders(pair);

		console.log('length in DB is ', liveOrders.length);
		if (this.orderWatcher) {
			for (const order of liveOrders)
				try {
					const rawOrder: IRawOrder | null = await dynamoUtil.getRawOrder(
						order.orderHash
					);
					if (rawOrder) {
						await this.orderWatcher.addOrderAsync(
							orderUtil.parseSignedOrder(rawOrder.signedOrder)
						);
						this.numOfWatchedOrders++;
						console.log('succsfully added %s', order.orderHash);
					}
				} catch (e) {
					console.log('failed to add %s', order.orderHash, 'error is ' + e);
				}

			this.orderWatcher.subscribe(async (err, orderState) => {
				if (err) {
					console.log(err);
					return;
				}

				console.log(Date.now().toString(), orderState);
				if (orderState !== undefined) {
					if (!this.sequenceWsClient) throw new Error('sequence service is unavailable');
					const requestSequence: IWsRequest = {
						method: pair,
						channel: CST.DB_SEQUENCE
					};
					this.sequenceWsClient.send(JSON.stringify(requestSequence));
					this.requestQueue[pair].push(orderState);
				}
			});
		}
	}

	public handleSequenceMessage(m: string) {
		util.logDebug('received: ' + m);
		const res: IWsResponse = JSON.parse(m);
		if (res.channel !== CST.DB_SEQUENCE || res.status !== CST.WS_OK) return;

		const { sequence, method } = res as IWsSequenceResponse;
		const pair = method;
		if (!this.requestQueue[pair] || !this.requestQueue[pair].length) return;

		const queueItem = this.requestQueue[pair].pop();
		if (!queueItem) return;

		relayerUtil.handleUpdateOrder(
			sequence + '',
			pair,
			queueItem
		);
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
