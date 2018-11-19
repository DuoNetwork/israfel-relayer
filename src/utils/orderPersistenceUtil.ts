import { SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOption,
	IOrderPersistRequest,
	IOrderQueueItem,
	IStringSignedOrder,
	IUserOrder
} from '../common/types';
import dynamoUtil from './dynamoUtil';
import orderbookUtil from './orderBookUtil';
import redisUtil from './redisUtil';
import util from './util';
import Web3Util from './Web3Util';

class OrderPersistenceUtil {
	public async addUserOrderToDB(
		liveOrder: ILiveOrder,
		type: string,
		status: string,
		updatedBy: string
	) {
		const userOrder = this.constructUserOrder(liveOrder, type, status, updatedBy);
		try {
			await dynamoUtil.addUserOrder(userOrder);
			util.logDebug(`added user order ${liveOrder.orderHash}|${type}|${status}|${updatedBy}`);
		} catch (error) {
			util.logError(error);
		}

		return userOrder;
	}

	public async getLiveOrderInPersistence(pair: string, orderHash: string) {
		const queueStrings = await redisUtil.hashMultiGet(
			`${CST.DB_ORDERS}|${CST.DB_CACHE}`,
			`${CST.DB_TERMINATE}|${orderHash}`,
			`${CST.DB_UPDATE}|${orderHash}`,
			`${CST.DB_ADD}|${orderHash}`
		);
		if (queueStrings[`${CST.DB_TERMINATE}|${orderHash}`]) return null;

		const updateQueueString = queueStrings[`${CST.DB_UPDATE}|${orderHash}`];
		if (updateQueueString) {
			const orderQueueItem: IOrderQueueItem = JSON.parse(updateQueueString);
			return orderQueueItem.liveOrder;
		}

		const addQueueString = queueStrings[`${CST.DB_ADD}|${orderHash}`];
		if (addQueueString) {
			const orderQueueItem: IOrderQueueItem = JSON.parse(addQueueString);
			return orderQueueItem.liveOrder;
		}

		const liveOrders = await dynamoUtil.getLiveOrders(pair, orderHash);
		if (liveOrders.length < 1) return null;

		return liveOrders[0];
	}

	public async getAllLiveOrdersInPersistence(pair: string) {
		const redisOrders = await redisUtil.hashGetAll(`${CST.DB_ORDERS}|${CST.DB_CACHE}`);
		const dynamoOrders = await dynamoUtil.getLiveOrders(pair);

		const addOrders: { [orderHash: string]: ILiveOrder } = {};
		const updateOrders: { [orderHash: string]: ILiveOrder } = {};
		const terminateOrders: { [orderHash: string]: ILiveOrder } = {};
		for (const key in redisOrders) {
			const [method, orderHash] = key.split('|');
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

	public async persistOrder(orderPersistRequest: IOrderPersistRequest, publish: boolean) {
		const { pair, orderHash, method, balance, side, fill } = orderPersistRequest;
		if (method === CST.DB_ADD && !side) {
			util.logDebug(`invalid add request ${orderHash}, missing side`);
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
		if (method === CST.DB_ADD) {
			liveOrder = this.constructNewLiveOrder(
				orderPersistRequest.signedOrder as IStringSignedOrder,
				pair,
				side || '',
				orderHash
			);
			liveOrder.initialSequence = sequence;
		}
		const orderQueueItem: IOrderQueueItem = {
			method: method,
			liveOrder: liveOrder as ILiveOrder
		};
		orderQueueItem.liveOrder.currentSequence = sequence;
		if (method === CST.DB_ADD) orderQueueItem.signedOrder = orderPersistRequest.signedOrder;
		else {
			if (fill) orderQueueItem.liveOrder.fill = fill;
			if (balance !== -1) orderQueueItem.liveOrder.balance = balance;
		}

		util.logDebug(`storing order queue item in redis ${orderHash}`);
		await redisUtil.multi();
		const key = `${method}|${orderHash}`;
		// store order in hash map
		redisUtil.hashSet(`${CST.DB_ORDERS}|${CST.DB_CACHE}`, key, JSON.stringify(orderQueueItem));
		// push orderhash into queue
		redisUtil.push(`${CST.DB_ORDERS}|${CST.DB_QUEUE}`, key);
		await redisUtil.exec();
		util.logDebug(`done`);

		orderbookUtil.publishOrderBookUpdate({
			method: method,
			pair: pair,
			sequence: sequence,
			liveOrder: orderQueueItem.liveOrder,
			balance
		});

		if (publish)
			try {
				redisUtil.publish(
					`${CST.DB_ORDERS}|${CST.DB_PUBSUB}|${pair}`,
					JSON.stringify(orderPersistRequest)
				);
			} catch (error) {
				util.logError(error);
			}

		return this.addUserOrderToDB(
			orderQueueItem.liveOrder,
			method,
			CST.DB_CONFIRMED,
			method === CST.DB_UPDATE ? CST.DB_ORDER_WATCHER : CST.DB_RELAYER
		);
	}

	public constructUserOrder(
		liveOrder: ILiveOrder,
		type: string,
		status: string,
		updatedBy: string
	): IUserOrder {
		return {
			...liveOrder,
			type: type,
			status: status,
			updatedBy: updatedBy
		};
	}

	public constructNewLiveOrder(
		signedOrder: IStringSignedOrder,
		pair: string,
		side: string,
		orderHash: string
	): ILiveOrder {
		const isBid = side === CST.DB_BID;
		const amount = Web3Util.fromWei(
			isBid ? signedOrder.takerAssetAmount : signedOrder.makerAssetAmount
		);
		return {
			account: signedOrder.makerAddress,
			pair: pair,
			orderHash: orderHash,
			price: Web3Util.getPriceFromSignedOrder(signedOrder, side),
			amount: amount,
			balance: amount,
			fill: 0,
			side: side,
			initialSequence: 0,
			currentSequence: 0
		};
	}

	public async processOrderQueue() {
		const queueKey = await redisUtil.pop(`${CST.DB_ORDERS}|${CST.DB_QUEUE}`);
		if (!queueKey) return false;

		const queueItemString = await redisUtil.hashGet(
			`${CST.DB_ORDERS}|${CST.DB_CACHE}`,
			queueKey
		);
		util.logDebug(`processing order: ${queueKey}`);
		if (!queueItemString) {
			util.logDebug('empty queue item, ignore');
			return true;
		}
		const [method, orderHash] = queueKey.split('|');
		const orderQueueItem: IOrderQueueItem = JSON.parse(queueItemString);
		try {
			util.logDebug(`${method} order`);
			if (method === CST.DB_ADD) {
				await dynamoUtil.addRawOrder({
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
			redisUtil.hashDelete(`${CST.DB_ORDERS}|${CST.DB_CACHE}`, queueKey);
			util.logDebug(`removed redis data`);
		} catch (err) {
			util.logError(`error in processing for ${queueKey}`);
			util.logError(err);
			await redisUtil.multi();
			redisUtil.hashSet(`${CST.DB_ORDERS}|${CST.DB_CACHE}`, queueKey, queueItemString);
			redisUtil.putBack(`${CST.DB_ORDERS}|${CST.DB_QUEUE}`, queueKey);
			await redisUtil.exec();
			return false;
		}

		await this.addUserOrderToDB(
			orderQueueItem.liveOrder,
			method,
			CST.DB_CONFIRMED,
			CST.DB_ORDER_PROCESSOR
		);

		return true;
	}

	public parseSignedOrder(order: IStringSignedOrder): SignedOrder {
		const {
			makerFee,
			takerFee,
			makerAssetAmount,
			takerAssetAmount,
			salt,
			expirationTimeSeconds,
			...rest
		} = order;
		return {
			...rest,
			makerFee: Web3Util.stringToBN(makerFee),
			takerFee: Web3Util.stringToBN(takerFee),
			makerAssetAmount: Web3Util.stringToBN(makerAssetAmount),
			takerAssetAmount: Web3Util.stringToBN(takerAssetAmount),
			salt: Web3Util.stringToBN(salt),
			expirationTimeSeconds: Web3Util.stringToBN(expirationTimeSeconds)
		};
	}

	public async startProcessing(option: IOption) {
		if (option.server) {
			dynamoUtil.updateStatus(
				CST.DB_ORDERS,
				await redisUtil.getQueueLength(`${CST.DB_ORDERS}|${CST.DB_QUEUE}`)
			);

			setInterval(
				async () =>
					dynamoUtil.updateStatus(
						CST.DB_ORDERS,
						await redisUtil.getQueueLength(`${CST.DB_ORDERS}|${CST.DB_QUEUE}`)
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
