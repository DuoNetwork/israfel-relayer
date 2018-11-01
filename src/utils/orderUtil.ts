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

class OrderUtil {
	public async addUserOrderToDB(
		liveOrder: ILiveOrder,
		type: string,
		status: string,
		updatedBy: string
	) {
		const userOrder = orderUtil.constructUserOrder(liveOrder, type, status, updatedBy);
		try {
			await dynamoUtil.addUserOrder(userOrder);
			util.logDebug(`added user order ${liveOrder.orderHash}|${type}|${status}|${updatedBy}`);
		} catch (error) {
			util.logError(error);
		}

		return userOrder;
	}

	public async getLiveOrderInPersistence(pair: string, orderHash: string) {
		const cancelQueueString = await redisUtil.get(
			`${CST.DB_ORDERS}|${CST.DB_CANCEL}|${orderHash}`
		);
		if (cancelQueueString) return null;

		const addQueueString = await redisUtil.get(`${CST.DB_ORDERS}|${CST.DB_ADD}|${orderHash}`);
		if (addQueueString) {
			const orderQueueItem: IOrderQueueItem = JSON.parse(addQueueString);
			return orderQueueItem.liveOrder;
		}

		const liveOrders = await dynamoUtil.getLiveOrders(pair, orderHash);
		if (liveOrders.length < 1) return null;

		return liveOrders[0];
	}

	public async persistOrder(orderQueueItem: IOrderQueueItem) {
		try {
			util.logDebug(
				`storing order queue item in redis ${orderQueueItem.liveOrder.orderHash}`
			);
			redisUtil.multi();
			// store order in hash map
			redisUtil.hashSet(
				CST.DB_ORDERS,
				orderQueueItem.liveOrder.orderHash,
				JSON.stringify(orderQueueItem)
			);
			// push orderhash into queue
			redisUtil.push(`${CST.DB_ORDERS}`, orderQueueItem.liveOrder.orderHash);
			await redisUtil.exec();
			util.logDebug(`done`);
		} catch (error) {
			util.logError(error);
			return null;
		}

		const method = orderQueueItem.method;

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
		const orderHash = await redisUtil.pop(CST.DB_ORDERS);
		if (!orderHash) return false;

		const queueItemString = await redisUtil.hashGet(CST.DB_ORDERS, orderHash);
		util.logDebug(`processing order: ${orderHash}`);
		// when order is already processed, the queue item in hash map is deleted and null
		// this could happen when an order is first added then canceled before it is saved to db
		// the order in hash map would have been updated to cancel
		// when the original request in queue is being processed, it will be treated as delete directly.
		if (!queueItemString) {
			util.logDebug('already processed, ignore');
			return true;
		}

		const orderQueueItem: IOrderQueueItem = JSON.parse(queueItemString);
		try {
			util.logDebug(`${orderQueueItem.method} order`);
			if (orderQueueItem.method === CST.DB_CANCEL) {
				await dynamoUtil.deleteRawOrder(orderHash);
				util.logDebug(`deleted raw order`);
				await dynamoUtil.deleteLiveOrder(orderQueueItem.liveOrder);
				util.logDebug(`deleted live order`);
			} else {
				await dynamoUtil.updateRawOrder({
					orderHash: orderHash,
					signedOrder: orderQueueItem.signedOrder as IStringSignedOrder
				});
				util.logDebug(`added raw order`);
				await dynamoUtil.updateLiveOrder(orderQueueItem.liveOrder);
				util.logDebug(`added live order`);
			}
			redisUtil.hashDelete(CST.DB_ORDERS, orderHash);
			util.logDebug(`removed redis data`);
		} catch (err) {
			util.logError(`error in processing ${orderQueueItem.method} for ${orderHash}`);
			util.logError(err);
			await redisUtil.hashSet(CST.DB_ORDERS, orderHash, queueItemString);
			redisUtil.putBack(CST.DB_ORDERS, orderHash);
			return false;
		}

		await this.addUserOrderToDB(
			orderQueueItem.liveOrder,
			orderQueueItem.method,
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
				option.type,
				await redisUtil.getQueueLength(`${CST.DB_ORDERS}|${option.type}`)
			);

			setInterval(
				async () =>
					dynamoUtil.updateStatus(
						option.type,
						await redisUtil.getQueueLength(`${CST.DB_ORDERS}|${option.type}`)
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
const orderUtil = new OrderUtil();
export default orderUtil;
