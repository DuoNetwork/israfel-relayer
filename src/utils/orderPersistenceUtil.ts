import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOption,
	IOrderPersistRequest,
	IOrderQueueItem,
	IStringSignedOrder,
	IToken
} from '../common/types';
import dynamoUtil from './dynamoUtil';
import orderUtil from './orderUtil';
import redisUtil from './redisUtil';
import util from './util';

class OrderPersistenceUtil {
	private getCacheMapField(pair: string, method: string, orderHash: string) {
		return `${pair}|${method}|${orderHash}`;
	}

	private getOrderPubSubChannel(pair: string) {
		return `${CST.DB_ORDERS}|${CST.DB_PUBSUB}|${pair}`;
	}

	private getOrderCacheMapKey(pair: string) {
		return `${CST.DB_ORDERS}|${CST.DB_CACHE}|${pair}`;
	}

	private getOrderQueueKey() {
		return `${CST.DB_ORDERS}|${CST.DB_QUEUE}`;
	}

	public subscribeOrderUpdate(
		pair: string,
		handleOrderUpdate: (channel: string, orderQueueItem: IOrderQueueItem) => any
	) {
		redisUtil.onOrderUpdate(handleOrderUpdate);
		redisUtil.subscribe(this.getOrderPubSubChannel(pair));
	}

	public unsubscribeOrderUpdate(pair: string) {
		redisUtil.unsubscribe(this.getOrderPubSubChannel(pair));
	}

	public async addUserOrderToDB(
		liveOrder: ILiveOrder,
		type: string,
		status: string,
		updatedBy: string,
		processed: boolean,
		txHash?: string
	) {
		const userOrder = orderUtil.constructUserOrder(
			liveOrder,
			type,
			status,
			updatedBy,
			processed,
			txHash
		);
		try {
			await dynamoUtil.addUserOrder(userOrder);
			util.logDebug(`added user order ${liveOrder.orderHash}|${type}|${status}|${updatedBy}`);
		} catch (error) {
			util.logError(error);
		}

		return userOrder;
	}

	public async getLiveOrderInPersistence(pair: string, orderHash: string) {
		const terminateKey = this.getCacheMapField(pair, CST.DB_TERMINATE, orderHash);
		const updateKey = this.getCacheMapField(pair, CST.DB_UPDATE, orderHash);
		const addKey = this.getCacheMapField(pair, CST.DB_ADD, orderHash);
		const queueStrings = await redisUtil.hashMultiGet(
			this.getOrderCacheMapKey(pair),
			terminateKey,
			updateKey,
			addKey
		);
		if (queueStrings[terminateKey]) return null;

		const updateQueueString = queueStrings[updateKey];
		if (updateQueueString) {
			const orderQueueItem: IOrderQueueItem = JSON.parse(updateQueueString);
			return orderQueueItem.liveOrder;
		}

		const addQueueString = queueStrings[addKey];
		if (addQueueString) {
			const orderQueueItem: IOrderQueueItem = JSON.parse(addQueueString);
			return orderQueueItem.liveOrder;
		}

		const liveOrders = await dynamoUtil.getLiveOrders(pair, orderHash);
		if (liveOrders.length < 1) return null;

		return liveOrders[0];
	}

	public async getAllLiveOrdersInPersistence(pair: string) {
		const redisOrders = await redisUtil.hashGetAll(this.getOrderCacheMapKey(pair));
		const dynamoOrders = await dynamoUtil.getLiveOrders(pair);

		const addOrders: { [orderHash: string]: ILiveOrder } = {};
		const updateOrders: { [orderHash: string]: ILiveOrder } = {};
		const terminateOrders: { [orderHash: string]: ILiveOrder } = {};
		for (const key in redisOrders) {
			const parts = key.split('|');
			const method = parts[2];
			const orderHash = parts[3];
			const orderQueueItem: IOrderQueueItem = JSON.parse(redisOrders[key]);
			if (method === CST.DB_TERMINATE) terminateOrders[orderHash] = orderQueueItem.liveOrder;
			else if (method === CST.DB_ADD) addOrders[orderHash] = orderQueueItem.liveOrder;
			else updateOrders[orderHash] = orderQueueItem.liveOrder;
		}

		const allOrders: { [orderHash: string]: ILiveOrder } = {};
		dynamoOrders.forEach(o => (allOrders[o.orderHash] = o));
		Object.assign(allOrders, addOrders);
		Object.assign(allOrders, updateOrders);
		for (const orderHash in terminateOrders)
			if (allOrders[orderHash]) delete allOrders[orderHash];

		return allOrders;
	}

	public async getRawOrderInPersistence(pair: string, orderHash: string) {
		const terminateKey = this.getCacheMapField(pair, CST.DB_TERMINATE, orderHash);
		const addKey = this.getCacheMapField(pair, CST.DB_ADD, orderHash);
		const queueStrings = await redisUtil.hashMultiGet(
			this.getOrderCacheMapKey(pair),
			terminateKey,
			addKey
		);
		if (queueStrings[terminateKey]) return null;

		const addQueueString = queueStrings[addKey];
		if (addQueueString) {
			const orderQueueItem: IOrderQueueItem = JSON.parse(addQueueString);
			return {
				pair: pair,
				orderHash: orderHash,
				signedOrder: orderQueueItem.signedOrder as IStringSignedOrder
			};
		}

		const dynamoRawOrder = await dynamoUtil.getRawOrder(orderHash);
		if (!dynamoRawOrder || !dynamoRawOrder.signedOrder.signature) return null;

		return dynamoRawOrder;
	}

	public async persistOrder(orderPersistRequest: IOrderPersistRequest) {
		util.logDebug('persist request: ' + JSON.stringify(orderPersistRequest));
		const {
			pair,
			orderHash,
			method,
			fill,
			matching,
			token,
			status,
			requestor,
			transactionHash
		} = orderPersistRequest;
		if (method === CST.DB_ADD && !token) {
			util.logDebug(`invalid add request ${orderHash}, missing token`);
			return null;
		}

		let liveOrder = await this.getLiveOrderInPersistence(pair, orderHash);
		if (method === CST.DB_ADD && liveOrder) {
			util.logDebug(`order ${orderHash} already exist, ignore add request`);
			return null;
		} else if (method !== CST.DB_ADD && !liveOrder) {
			util.logDebug(`order ${orderHash} does not exist, ignore ${method} request`);
			return null;
		}

		const sequence = await redisUtil.increment(`${CST.DB_SEQUENCE}|${pair}`);
		if (!util.isNumber(sequence)) {
			util.logDebug(`sequence ${sequence} is not a number ....`);
			return null;
		}

		if (method === CST.DB_ADD) {
			liveOrder = orderUtil.constructNewLiveOrder(
				orderPersistRequest.signedOrder as IStringSignedOrder,
				token as IToken,
				pair,
				orderHash
			);
			liveOrder.initialSequence = sequence;
		}
		const orderQueueItem: IOrderQueueItem = {
			method: method,
			status: status,
			requestor: requestor,
			liveOrder: liveOrder as ILiveOrder
		};
		orderQueueItem.liveOrder.currentSequence = sequence;
		if (method === CST.DB_ADD) orderQueueItem.signedOrder = orderPersistRequest.signedOrder;
		else if (orderPersistRequest.status === CST.DB_FILL) {
			orderQueueItem.liveOrder.fill = orderQueueItem.liveOrder.amount;
			orderQueueItem.liveOrder.matching = 0;
			orderQueueItem.liveOrder.balance = 0;
		} else if (fill) {
			// from orderMatcher or orderWatcher
			// if from orderMatcher, matching will be a negative number to offset previous matching number
			// if from orderWatcher, matching wont be set and need to use difference in fill to adjust matching
			const matchinAdjust = Math.min(matching || 0, -fill + orderQueueItem.liveOrder.fill);
			orderQueueItem.liveOrder.matching = util.round(
				Math.max(orderQueueItem.liveOrder.matching + matchinAdjust, 0)
			);
			orderQueueItem.liveOrder.fill = util.round(fill);
			orderQueueItem.liveOrder.balance = util.round(
				Math.max(
					orderQueueItem.liveOrder.amount -
						orderQueueItem.liveOrder.fill -
						orderQueueItem.liveOrder.matching,
					0
				)
			);
		} else if (!fill && matching) {
			// only from orderMatcher
			orderQueueItem.liveOrder.matching = util.round(
				Math.min(
					orderQueueItem.liveOrder.amount - orderQueueItem.liveOrder.fill,
					orderQueueItem.liveOrder.matching + matching
				)
			);
			orderQueueItem.liveOrder.balance = util.round(
				Math.max(
					orderQueueItem.liveOrder.amount -
						orderQueueItem.liveOrder.fill -
						orderQueueItem.liveOrder.matching,
					0
				)
			);
		}

		if (transactionHash) orderQueueItem.transactionHash = transactionHash;

		const orderQueueItemString = JSON.stringify(orderQueueItem);
		util.logDebug(`storing order queue item in redis ${orderHash}: ${orderQueueItemString}`);
		await redisUtil.multi();
		const key = this.getCacheMapField(pair, method, orderHash);
		// store order in hash map
		redisUtil.hashSet(this.getOrderCacheMapKey(pair), key, orderQueueItemString);
		// push orderhash into queue
		redisUtil.push(this.getOrderQueueKey(), key);
		await redisUtil.exec();
		util.logDebug(`done`);

		try {
			redisUtil.publish(this.getOrderPubSubChannel(pair), orderQueueItemString);
		} catch (error) {
			util.logError(error);
		}

		return this.addUserOrderToDB(
			orderQueueItem.liveOrder,
			method,
			status,
			requestor,
			false,
			transactionHash
		);
	}

	public async processOrderQueue() {
		const queueKey = await redisUtil.pop(this.getOrderQueueKey());
		if (!queueKey) return false;
		const [code1, code2, method, orderHash] = queueKey.split('|');
		const pair = `${code1}|${code2}`;
		const queueItemString = await redisUtil.hashGet(this.getOrderCacheMapKey(pair), queueKey);
		util.logDebug(`processing order: ${queueKey}`);
		if (!queueItemString) {
			util.logDebug('empty queue item, ignore');
			return true;
		}

		const orderQueueItem: IOrderQueueItem = JSON.parse(queueItemString);
		try {
			util.logDebug(`${method} order`);
			if (method === CST.DB_ADD) {
				await dynamoUtil.addRawOrder({
					pair: pair,
					orderHash: orderHash,
					signedOrder: orderQueueItem.signedOrder as IStringSignedOrder
				});
				util.logDebug(`added raw order`);
				await dynamoUtil.addLiveOrder(orderQueueItem.liveOrder);
				util.logDebug(`added live order`);
			} else if (method === CST.DB_TERMINATE) {
				await dynamoUtil.deleteRawOrderSignature(orderHash);
				util.logDebug(`deleted raw order`);
				await dynamoUtil.deleteLiveOrder(orderQueueItem.liveOrder);
				util.logDebug(`deleted live order`);
			} else {
				await dynamoUtil.updateLiveOrder(orderQueueItem.liveOrder);
				util.logDebug(`added live order`);
			}
			redisUtil.hashDelete(this.getOrderCacheMapKey(pair), queueKey);
			util.logDebug(`removed redis data`);
		} catch (err) {
			util.logError(`error in processing for ${queueKey}`);
			util.logError(err);
			await redisUtil.multi();
			redisUtil.hashSet(this.getOrderCacheMapKey(pair), queueKey, queueItemString);
			redisUtil.putBack(this.getOrderQueueKey(), queueKey);
			await redisUtil.exec();
			return false;
		}

		await this.addUserOrderToDB(
			orderQueueItem.liveOrder,
			method,
			orderQueueItem.status,
			orderQueueItem.requestor,
			true,
			orderQueueItem.transactionHash
		);

		return true;
	}

	public async startProcessing(option: IOption) {
		if (option.server) {
			dynamoUtil.updateStatus(
				CST.DB_ORDERS,
				await redisUtil.getQueueLength(this.getOrderQueueKey())
			);

			setInterval(
				async () =>
					dynamoUtil.updateStatus(
						CST.DB_ORDERS,
						await redisUtil.getQueueLength(this.getOrderQueueKey())
					),
				15000
			);
		}

		const loop = () =>
			this.processOrderQueue().then(result => {
				setTimeout(() => loop(), result ? 0 : 500);
			});
		loop();
	}
}
const orderPersistenceUtil = new OrderPersistenceUtil();
export default orderPersistenceUtil;
