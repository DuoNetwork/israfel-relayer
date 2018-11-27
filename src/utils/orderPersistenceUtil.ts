import { SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOption,
	IOrderPersistRequest,
	IOrderQueueItem,
	IStringSignedOrder,
	IToken,
	IUserOrder
} from '../common/types';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';
import util from './util';
import Web3Util from './Web3Util';

class OrderPersistenceUtil {
	public subscribeOrderUpdate(
		pair: string,
		handleOrderUpdate: (channel: string, orderQueueItem: IOrderQueueItem) => any
	) {
		redisUtil.onOrderUpdate(handleOrderUpdate);
		redisUtil.subscribe(`${CST.DB_ORDERS}|${CST.DB_PUBSUB}|${pair}`);
	}

	public unsubscribeOrderUpdate(pair: string) {
		redisUtil.unsubscribe(`${CST.DB_ORDERS}|${CST.DB_PUBSUB}|${pair}`);
	}

	public async addUserOrderToDB(
		liveOrder: ILiveOrder,
		type: string,
		status: string,
		updatedBy: string,
		processed: boolean
	) {
		const userOrder = this.constructUserOrder(liveOrder, type, status, updatedBy, processed);
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

	public async getRawOrderInPersistence(orderHash: string) {
		const redisStringOrder = await redisUtil.hashGet(
			`${CST.DB_ORDERS}|${CST.DB_CACHE}`,
			`${CST.DB_ADD}|${orderHash}`
		);
		if (redisStringOrder) {
			const redisRawOrder: IOrderQueueItem = JSON.parse(redisStringOrder);
			return {
				orderHash: orderHash,
				signedOrder: redisRawOrder.signedOrder as IStringSignedOrder
			};
		}

		const dynamoRawOrder = await dynamoUtil.getRawOrder(orderHash);
		return dynamoRawOrder;
	}

	public async persistOrder(orderPersistRequest: IOrderPersistRequest) {
		const {
			pair,
			orderHash,
			method,
			balance,
			token,
			fill,
			status,
			requestor
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
		if (method === CST.DB_ADD) {
			liveOrder = this.constructNewLiveOrder(
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
			orderQueueItem.liveOrder.balance = 0;
		} else {
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

		try {
			redisUtil.publish(
				`${CST.DB_ORDERS}|${CST.DB_PUBSUB}|${pair}`,
				JSON.stringify(orderQueueItem)
			);
		} catch (error) {
			util.logError(error);
		}

		return this.addUserOrderToDB(orderQueueItem.liveOrder, method, status, requestor, false);
	}

	public constructUserOrder(
		liveOrder: ILiveOrder,
		type: string,
		status: string,
		updatedBy: string,
		processed: boolean
	): IUserOrder {
		return {
			...liveOrder,
			type: type,
			status: status,
			updatedBy: updatedBy,
			processed: processed
		};
	}

	public constructNewLiveOrder(
		signedOrder: IStringSignedOrder,
		token: IToken,
		pair: string,
		orderHash: string
	): ILiveOrder {
		const [code1, code2] = pair.split('|');
		const side = Web3Util.getSideFromSignedOrder(signedOrder, token);
		const isBid = side === CST.DB_BID;
		const totalTokenAmount = Web3Util.fromWei(
			isBid ? signedOrder.takerAssetAmount : signedOrder.makerAssetAmount
		);
		const totalBaseAmount = Web3Util.fromWei(
			isBid ? signedOrder.makerAssetAmount : signedOrder.takerAssetAmount
		);
		let amountNetOfFee = totalTokenAmount;
		const fee = token.fee[code2];
		let feeAmount = 0;
		let feeAsset = code1;
		if (isBid) {
			if (fee.asset === code2) {
				feeAsset = code2;
				feeAmount = Math.max((totalBaseAmount * fee.rate) / (1 + fee.rate), fee.minimum);
			} else {
				feeAmount = Math.max((totalTokenAmount * fee.rate) / (1 - fee.rate), fee.minimum);
				amountNetOfFee = totalTokenAmount + feeAmount;
			}
			util.logDebug(
				`bid feeAsset ${feeAsset} fee ${feeAmount} amountNetOfFee ${amountNetOfFee}`
			);
		} else {
			if (fee.asset === code2) {
				feeAsset = code2;
				feeAmount = Math.max((totalBaseAmount * fee.rate) / (1 - fee.rate), fee.minimum);
			} else {
				feeAmount = Math.max((totalTokenAmount * fee.rate) / (1 + fee.rate), fee.minimum);
				amountNetOfFee = totalTokenAmount - feeAmount;
			}
			util.logDebug(
				`ask feeAsset ${feeAsset} fee ${feeAmount} amountNetOfFee ${amountNetOfFee}`
			);
		}

		return {
			account: signedOrder.makerAddress,
			pair: pair,
			orderHash: orderHash,
			price: Web3Util.getPriceFromSignedOrder(signedOrder, side),
			amount: amountNetOfFee,
			balance: amountNetOfFee,
			fill: 0,
			side: side,
			expiry: Number(signedOrder.expirationTimeSeconds) * 1000,
			fee: feeAmount,
			feeAsset: feeAsset,
			initialSequence: 0,
			currentSequence: 0,
			createdAt: util.getUTCNowTimestamp()
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
			orderQueueItem.status,
			orderQueueItem.requestor,
			true
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
