import { SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOption,
	IOrderQueueItem,
	IStringSignedOrder,
	IUserOrder
} from '../common/types';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';
import util from './util';
import web3Util from './Web3Util';

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
		const terminateQueueString = await redisUtil.hashGet(
			`${CST.DB_ORDERS}|${CST.DB_CACHE}`,
			`${CST.DB_TERMINATE}|${orderHash}`
		);
		if (terminateQueueString) return null;

		const updateQueueString = await redisUtil.hashGet(
			`${CST.DB_ORDERS}|${CST.DB_CACHE}`,
			`${CST.DB_UPDATE}|${orderHash}`
		);
		if (updateQueueString) {
			const orderQueueItem: IOrderQueueItem = JSON.parse(updateQueueString);
			return orderQueueItem.liveOrder;
		}

		const addQueueString = await redisUtil.hashGet(
			`${CST.DB_ORDERS}|${CST.DB_CACHE}`,
			`${CST.DB_ADD}|${orderHash}`
		);
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

	public async persistOrder(method: string, orderQueueItem: IOrderQueueItem) {
		const liveOrder = await this.getLiveOrderInPersistence(
			orderQueueItem.liveOrder.pair,
			orderQueueItem.liveOrder.orderHash
		);
		if (method === CST.DB_ADD && liveOrder) {
			util.logDebug(
				`order ${orderQueueItem.liveOrder.orderHash} already exist, ignore add request`
			);
			return null;
		} else if (method !== CST.DB_ADD && !liveOrder) {
			util.logDebug(
				`order ${
					orderQueueItem.liveOrder.orderHash
				} does not exist, ignore ${method} request`
			);
			return null;
		}

		util.logDebug(`storing order queue item in redis ${orderQueueItem.liveOrder.orderHash}`);
		await redisUtil.multi();
		const key = `${method}|${orderQueueItem.liveOrder.orderHash}`;
		// store order in hash map
		redisUtil.hashSet(`${CST.DB_ORDERS}|${CST.DB_CACHE}`, key, JSON.stringify(orderQueueItem));
		// push orderhash into queue
		redisUtil.push(`${CST.DB_ORDERS}|${CST.DB_QUEUE}`, key);
		await redisUtil.exec();
		util.logDebug(`done`);

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
		orderHash: string
	): ILiveOrder {
		const side = web3Util.getSideFromSignedOrder(signedOrder, pair);
		const isBid = side === CST.DB_BID;
		return {
			account: signedOrder.makerAddress,
			pair: pair,
			orderHash: orderHash,
			price: web3Util.getPriceFromSignedOrder(signedOrder, side),
			amount: web3Util.fromWei(
				isBid ? signedOrder.makerAssetAmount : signedOrder.takerAssetAmount
			),
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
			await redisUtil.hashSet(`${CST.DB_ORDERS}|${CST.DB_CACHE}`, queueKey, queueItemString);
			redisUtil.putBack(`${CST.DB_ORDERS}|${CST.DB_QUEUE}`, queueKey);
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
			makerFee: web3Util.stringToBN(makerFee),
			takerFee: web3Util.stringToBN(takerFee),
			makerAssetAmount: web3Util.stringToBN(makerAssetAmount),
			takerAssetAmount: web3Util.stringToBN(takerAssetAmount),
			salt: web3Util.stringToBN(salt),
			expirationTimeSeconds: web3Util.stringToBN(expirationTimeSeconds)
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
