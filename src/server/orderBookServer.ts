import * as CST from '../common/constants';
import { ILiveOrder, IOption, IOrderQueueItem } from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import redisUtil from '../utils/redisUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class OrderBookServer {
	public pair: string = 'pair';
	public web3Util: Web3Util | null = null;
	public liveOrders: { [orderHash: string]: ILiveOrder } = {};
	public pendingUpdates: IOrderQueueItem[] = [];
	public loadingOrders: boolean = true;
	public lastSequence: number = 0;

	public handleOrderUpdate = (channel: string, orderQueueItem: IOrderQueueItem) => {
		util.logDebug('receive update from channel: ' + channel);
		if (this.loadingOrders) {
			this.pendingUpdates.push(orderQueueItem);
			return;
		}

		if (orderQueueItem.liveOrder.currentSequence <= this.lastSequence) return;

		this.lastSequence = orderQueueItem.liveOrder.currentSequence;
		// todo update snapshot
	};

	public getMaxSequence(liveOrders: { [orderHash: string]: ILiveOrder }) {
		let maxSequence = 0;
		for (const orderHash in liveOrders)
			maxSequence = Math.max(maxSequence, liveOrders[orderHash].currentSequence);

		return maxSequence;
	}

	public processPendingUpdates() {
		return;
	}

	public async startServer(web3Util: Web3Util, option: IOption) {
		this.web3Util = web3Util;
		this.pair = option.token + '-' + CST.TOKEN_WETH;

		redisUtil.onOrderUpdate((channel, orderPersistRequest) =>
			this.handleOrderUpdate(channel, orderPersistRequest)
		);

		redisUtil.subscribe(`${CST.DB_ORDERS}|${CST.DB_PUBSUB}|${this.pair}`);

		this.liveOrders = await orderPersistenceUtil.getAllLiveOrdersInPersistence(this.pair);
		util.logInfo('loaded live orders : ' + Object.keys(this.liveOrders).length);
		this.lastSequence = this.getMaxSequence(this.liveOrders);
		this.loadingOrders = false;
		this.processPendingUpdates();

		setInterval(async () => {
			this.liveOrders = await orderPersistenceUtil.getAllLiveOrdersInPersistence(this.pair);
			util.logInfo('loaded live orders : ' + Object.keys(this.liveOrders).length);
			this.lastSequence = this.getMaxSequence(this.liveOrders);
			this.loadingOrders = false;
			this.processPendingUpdates();
		}, CST.ONE_MINUTE_MS * 30);

		if (option.server) {
			dynamoUtil.updateStatus(this.pair);
			setInterval(
				() => dynamoUtil.updateStatus(this.pair, Object.keys(this.liveOrders).length),
				10000
			);
		}
	}
}

const orderWatcherServer = new OrderBookServer();
export default orderWatcherServer;
