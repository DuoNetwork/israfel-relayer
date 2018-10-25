import { ContractWrappers, OrderState, OrderWatcher, RPCSubprovider } from '0x.js';
import WebSocket from 'ws';
import * as CST from '../common/constants';
import { ILiveOrder, IOption, IRawOrder, IWsRequest, IWsSequenceResponse } from '../common/types';
import { providerEngine } from '../providerEngine';
import dynamoUtil from '../utils/dynamoUtil';
import relayerUtil from '../utils/relayerUtil';
import util from '../utils/util';

class OrderWatcherServer {
	public provider = new RPCSubprovider(CST.PROVIDER_LOCAL);
	// public providerEngine = new Web3ProviderEngine();
	public zeroEx: ContractWrappers;
	public orderWatcher: OrderWatcher;
	public ws: WebSocket | null = null;
	public ip: string = '';
	public pendingRequest: Array<{ pair: string; orderState: OrderState }> = [];

	constructor() {
		// this.providerEngine.addProvider(this.provider);
		// this.providerEngine.start();
		this.zeroEx = new ContractWrappers(providerEngine, { networkId: CST.NETWORK_ID_LOCAL });
		this.orderWatcher = new OrderWatcher(providerEngine, CST.NETWORK_ID_LOCAL);
	}

	public init(tool: string, option: IOption) {
		const config = require('../keys/' + (option.live ? 'live' : 'dev') + '/dynamo.json');
		dynamoUtil.init(config, option.live, tool);
		this.connectToIdService();
	}

	public unsubOrderWatcher() {
		this.orderWatcher.unsubscribe();
	}

	public connectToIdService() {
		this.ws = new WebSocket(`${CST.ID_SERVICE_URL}:${CST.ID_SERVICE_PORT}`);

		this.ws.on('open', () => {
			console.log('client connected!');
		});

		this.ws.on('message', m => {
			const receivedMsg: IWsSequenceResponse = JSON.parse(m.toString());

			const orderObj = this.pendingRequest[0];
			delete this.pendingRequest[0];

			relayerUtil.handleUpdateOrder(
				receivedMsg.sequence + '',
				orderObj.pair,
				orderObj.orderState
			);
		});

		this.ws.on('error', (error: Error) => {
			console.log('client got error! %s', error);
		});

		this.ws.on('close', () => console.log('connection closed!'));
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

	public async startOrderWatcher(option: IOption) {
		const pair = option.token + '-' + CST.TOKEN_WETH;
		util.logInfo('start order watcher for ' + pair);
		const liveOrders: ILiveOrder[] = await dynamoUtil.getLiveOrders(pair);

		console.log('length in DB is ', liveOrders.length);
		for (const order of liveOrders)
			try {
				const rawOrder: IRawOrder | null = await dynamoUtil.getRawOrder(order.orderHash);
				if (rawOrder) await this.orderWatcher.addOrderAsync(rawOrder.signedOrder);

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
			if (orderState !== undefined) {
				if (!this.ws) throw new Error('sequence service is unavailable');
				// const requestId = orderState.orderHash + '|' + CST.WS_TYPE_ORDER_UPDATE;

				const requestSequence: IWsRequest = {
					method: pair,
					channel: CST.DB_SEQUENCE
				};
				this.ws.send(JSON.stringify(requestSequence));
				this.pendingRequest.push({
					pair: pair,
					orderState: orderState
				});
				// await dynamoUtil.updateOrderState(orderState, pair);
			}
		});
	}
}

const orderWatcherServer = new OrderWatcherServer();
export default orderWatcherServer;
