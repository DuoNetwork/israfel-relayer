import {
	Constants,
	ILiveOrder,
	IStringSignedOrder,
	IToken,
	OrderUtil,
	Util
} from '@finbook/israfel-common';
import { IOption, IOrderPersistRequest, IOrderQueueItem } from '../common/types';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';

class OrderPersistenceUtil {
	private getCacheMapField(pair: string, method: string, orderHash: string) {
		return `${pair}|${method}|${orderHash}`;
	}

	private getOrderPubSubChannel(pair: string) {
		return `${Constants.DB_ORDERS}|${Constants.DB_PUBSUB}|${pair}`;
	}

	private getOrderCacheMapKey(pair: string) {
		return `${Constants.DB_ORDERS}|${Constants.DB_CACHE}|${pair}`;
	}

	public getOrderQueueKey() {
		return `${Constants.DB_ORDERS}|${Constants.DB_QUEUE}`;
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
		const userOrder = OrderUtil.constructUserOrder(
			liveOrder,
			type,
			status,
			updatedBy,
			processed,
			txHash
		);
		try {
			await dynamoUtil.addUserOrder(userOrder);
			Util.logDebug(`added user order ${liveOrder.orderHash}|${type}|${status}|${updatedBy}`);
		} catch (error) {
			Util.logError(error);
		}

		return userOrder;
	}

	public async getLiveOrderInPersistence(pair: string, orderHash: string) {
		const terminateKey = this.getCacheMapField(pair, Constants.DB_TERMINATE, orderHash);
		const updateKey = this.getCacheMapField(pair, Constants.DB_UPDATE, orderHash);
		const addKey = this.getCacheMapField(pair, Constants.DB_ADD, orderHash);
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
			if (method === Constants.DB_TERMINATE)
				terminateOrders[orderHash] = orderQueueItem.liveOrder;
			else if (method === Constants.DB_ADD) addOrders[orderHash] = orderQueueItem.liveOrder;
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
		const terminateKey = this.getCacheMapField(pair, Constants.DB_TERMINATE, orderHash);
		const addKey = this.getCacheMapField(pair, Constants.DB_ADD, orderHash);
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
		Util.logDebug('persist request: ' + JSON.stringify(orderPersistRequest));
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
		if (method === Constants.DB_ADD && !token) {
			Util.logDebug(`invalid add request ${orderHash}, missing token`);
			return null;
		}

		let liveOrder = await this.getLiveOrderInPersistence(pair, orderHash);
		if (method === Constants.DB_ADD && liveOrder) {
			Util.logDebug(`order ${orderHash} already exist, ignore add request`);
			return null;
		} else if (method !== Constants.DB_ADD && !liveOrder) {
			Util.logDebug(`order ${orderHash} does not exist, ignore ${method} request`);
			return null;
		}

		const sequence = await redisUtil.increment(`${Constants.DB_SEQUENCE}|${pair}`);
		if (!Util.isNumber(sequence)) {
			Util.logDebug(`sequence ${sequence} is not a number ....`);
			return null;
		}

		if (method === Constants.DB_ADD) {
			liveOrder = OrderUtil.constructNewLiveOrder(
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
			liveOrder: liveOrder as ILiveOrder,
			processRetry: 0
		};
		orderQueueItem.liveOrder.currentSequence = sequence;
		if (method === Constants.DB_ADD)
			orderQueueItem.signedOrder = orderPersistRequest.signedOrder;
		else if (orderPersistRequest.status === Constants.DB_FILL) {
			orderQueueItem.liveOrder.fill = orderQueueItem.liveOrder.amount;
			orderQueueItem.liveOrder.matching = 0;
			orderQueueItem.liveOrder.balance = 0;
		} else if (fill) {
			// only from orderMatcher
			// matching will be a negative number to offset previous matching number
			const matchinAdjust = Math.min(matching || 0, -fill + orderQueueItem.liveOrder.fill);
			orderQueueItem.liveOrder.matching =
				Util.round(Math.max(orderQueueItem.liveOrder.matching + matchinAdjust, 0)) || 0;
			orderQueueItem.liveOrder.fill = Util.round(fill);
			orderQueueItem.liveOrder.balance =
				Util.round(
					Math.max(
						orderQueueItem.liveOrder.amount -
							orderQueueItem.liveOrder.fill -
							orderQueueItem.liveOrder.matching,
						0
					)
				) || 0;
		} else if (!fill && matching) {
			// only from orderMatcher
			orderQueueItem.liveOrder.matching =
				Util.round(
					Math.min(
						orderQueueItem.liveOrder.amount - orderQueueItem.liveOrder.fill,
						orderQueueItem.liveOrder.matching + matching
					)
				) || 0;
			orderQueueItem.liveOrder.balance =
				Util.round(
					Math.max(
						orderQueueItem.liveOrder.amount -
							orderQueueItem.liveOrder.fill -
							orderQueueItem.liveOrder.matching,
						0
					)
				) || 0;
		}

		if (transactionHash) orderQueueItem.transactionHash = transactionHash;

		const orderQueueItemString = JSON.stringify(orderQueueItem);
		Util.logDebug(`storing order queue item in redis ${orderHash}: ${orderQueueItemString}`);
		const key = this.getCacheMapField(pair, method, orderHash);
		// store order in hash map
		await redisUtil.hashSet(this.getOrderCacheMapKey(pair), key, orderQueueItemString);
		// push orderhash into queue
		redisUtil.push(this.getOrderQueueKey(), key);
		Util.logDebug(`done`);

		try {
			await redisUtil.publish(this.getOrderPubSubChannel(pair), orderQueueItemString);
		} catch (error) {
			Util.logError(error);
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
		Util.logDebug(`processing order: ${queueKey}`);
		if (!queueItemString) {
			Util.logDebug('empty queue item, ignore');
			return true;
		}

		const orderQueueItem: IOrderQueueItem = JSON.parse(queueItemString);
		try {
			Util.logDebug(`${method} order`);
			if (method === Constants.DB_ADD) {
				await dynamoUtil.addOrder(orderQueueItem.liveOrder, {
					pair: pair,
					orderHash: orderHash,
					signedOrder: orderQueueItem.signedOrder as IStringSignedOrder
				});
				Util.logDebug(`add live & raw order`);
			} else if (method === Constants.DB_TERMINATE) {
				await dynamoUtil.deleteOrder(pair, orderHash);
				Util.logDebug(`delete live & raw order`);
			} else {
				await dynamoUtil.updateLiveOrder(orderQueueItem.liveOrder);
				Util.logDebug(`added live order`);
			}
			redisUtil.hashDelete(this.getOrderCacheMapKey(pair), queueKey);
			Util.logDebug(`removed redis data`);
		} catch (err) {
			Util.logError(`error in processing for ${queueKey}`);
			Util.logError(err);
			if (orderQueueItem.processRetry <= 3) {
				orderQueueItem.processRetry += 1;
				await redisUtil.hashSet(this.getOrderCacheMapKey(pair), queueKey, JSON.stringify(orderQueueItem));
				redisUtil.putBack(this.getOrderQueueKey(), queueKey);
			}
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

	public async hashDeleteAll(option: IOption) {
		await redisUtil.hashDeleteAll(
			this.getOrderCacheMapKey(option.token + '|' + Constants.TOKEN_WETH)
		);
		Util.logDebug(`completed delete all cached orders for ${option.token}`);
	}
}
const orderPersistenceUtil = new OrderPersistenceUtil();
export default orderPersistenceUtil;
