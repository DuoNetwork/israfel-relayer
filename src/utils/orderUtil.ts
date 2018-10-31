import { SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	INewOrderQueueItem,
	IOption,
	IStringSignedOrder,
	IUpdateOrderQueueItem,
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
			const orderQueueItem: INewOrderQueueItem = JSON.parse(addQueueString);
			return orderQueueItem.liveOrder;
		}

		const liveOrders = await dynamoUtil.getLiveOrders(pair, orderHash);
		if (liveOrders.length < 1) return null;

		return liveOrders[0];
	}

	public async addOrderToPersistence(orderQueueItem: INewOrderQueueItem) {
		try {
			util.logDebug(`storing add order in redis ${orderQueueItem.liveOrder.orderHash}`);
			redisUtil.multi();
			redisUtil.set(
				`${CST.DB_ORDERS}|${CST.DB_ADD}|${orderQueueItem.liveOrder.orderHash}`,
				JSON.stringify(orderQueueItem)
			);
			redisUtil.push(`${CST.DB_ORDERS}|${CST.DB_ADD}`, orderQueueItem.liveOrder.orderHash);
			await redisUtil.exec();
			util.logDebug(`done`);
		} catch (error) {
			util.logError(error);
			return null;
		}

		return this.addUserOrderToDB(
			orderQueueItem.liveOrder,
			CST.DB_ADD,
			CST.DB_CONFIRMED,
			CST.DB_RELAYER
		);
	}

	public async cancelOrderInPersistence(liveOrder: ILiveOrder) {
		try {
			util.logDebug(`storing cancel order in redis ${liveOrder.orderHash}`);
			redisUtil.multi();
			redisUtil.set(`${CST.DB_ORDERS}|${CST.DB_ADD}|${liveOrder.orderHash}`, '');
			redisUtil.set(
				`${CST.DB_ORDERS}|${CST.DB_CANCEL}|${liveOrder.orderHash}`,
				liveOrder.orderHash
			);
			redisUtil.push(`${CST.DB_ORDERS}|${CST.DB_CANCEL}`, JSON.stringify(liveOrder));
			await redisUtil.exec();
			util.logDebug(`done`);
		} catch (error) {
			util.logError(error);
			return null;
		}

		return this.addUserOrderToDB(liveOrder, CST.DB_CANCEL, CST.DB_CONFIRMED, CST.DB_RELAYER);
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

	public async addOrderToDB() {
		const orderHash = await redisUtil.pop(`${CST.DB_ORDERS}|${CST.DB_ADD}`);

		if (orderHash) {
			util.logDebug(`processing add order: ${orderHash}`);
			const orderInRedis = await redisUtil.get(`${CST.DB_ORDERS}|${CST.DB_ADD}|${orderHash}`);

			if (orderInRedis) {
				util.logDebug('found order in redis');
				const orderQueueItem: INewOrderQueueItem = JSON.parse(orderInRedis);
				try {
					await dynamoUtil.addRawOrder({
						orderHash: orderQueueItem.liveOrder.orderHash,
						signedOrder: orderQueueItem.signedOrder
					});
					util.logDebug(`added raw order`);
					await dynamoUtil.addLiveOrder(orderQueueItem.liveOrder);
					util.logDebug(`added live order`);
					await redisUtil.set(`${CST.DB_ORDERS}|${CST.DB_ADD}|${orderHash}`, '');
					util.logDebug(`removed redis data`);
				} catch (err) {
					util.logError(`error in addOrderToDB for ${orderHash}`);
					util.logError(err);
					await redisUtil.set(
						`${CST.DB_ORDERS}|${CST.DB_ADD}|${orderHash}`,
						orderInRedis
					);
					redisUtil.putBack(`${CST.DB_ORDERS}|${CST.DB_ADD}`, orderHash);
					return false;
				}

				await this.addUserOrderToDB(
					orderQueueItem.liveOrder,
					CST.DB_ADD,
					CST.DB_CONFIRMED,
					CST.DB_ORDER_PROCESSOR
				);

				return true;
			} else return true;
		}
		return false;
	}

	public async updateOrderInDB() {
		const rawUpdateQueueItem = await redisUtil.pop(`${CST.DB_ORDERS}|${CST.DB_UPDATE}`);
		if (rawUpdateQueueItem) {
			const updateQueueItem: IUpdateOrderQueueItem = JSON.parse(rawUpdateQueueItem);
			const liveOrder: ILiveOrder = updateQueueItem.liveOrder;
			util.logDebug(`processing update order: ${liveOrder.orderHash}`);

			if (await redisUtil.get(`${CST.DB_ORDERS}|${CST.DB_CANCEL}|${liveOrder.orderHash}`)) {
				util.logDebug(`order in cancel queue, do not update ${liveOrder.orderHash}`);
				return false;
			}

			try {
				await dynamoUtil.updateLiveOrder(liveOrder);
				util.logDebug(`updated order ${liveOrder.orderHash}`);
			} catch (err) {
				util.logError(`error in updateOrderInDB for ${liveOrder.orderHash}`);
				util.logError(err);

				redisUtil.putBack(`${CST.DB_ORDERS}|${CST.DB_UPDATE}`, rawUpdateQueueItem);
				return false;
			}

			await this.addUserOrderToDB(
				liveOrder,
				CST.DB_UPDATE,
				CST.DB_CONFIRMED,
				CST.DB_ORDER_PROCESSOR
			);

			return true;
		}
		return false;
	}

	public async cancelOrderInDB() {
		const res = await redisUtil.pop(`${CST.DB_ORDERS}|${CST.DB_CANCEL}`);
		if (res) {
			const liveOrder: ILiveOrder = JSON.parse(res);
			util.logDebug(`processing cancel order: ${liveOrder.orderHash}`);
			try {
				await dynamoUtil.deleteRawOrderSignature(liveOrder.orderHash);
				util.logDebug(`deleted signature`);
				await dynamoUtil.deleteLiveOrder(liveOrder);
				util.logDebug(`deleted live order`);
				await redisUtil.set(`${CST.DB_ORDERS}|${CST.DB_CANCEL}|${liveOrder.orderHash}`, '');
				util.logDebug(`removed redis data`);
			} catch (err) {
				util.logError(`error in cancelOrderInDB for ${liveOrder.orderHash}`);
				util.logError(err);
				await redisUtil.set(
					`${CST.DB_ORDERS}|${CST.DB_CANCEL}|${liveOrder.orderHash}`,
					liveOrder.orderHash
				);
				redisUtil.putBack(`${CST.DB_ORDERS}|${CST.DB_CANCEL}`, res);

				return false;
			}

			await this.addUserOrderToDB(
				liveOrder,
				CST.DB_CANCEL,
				CST.DB_CONFIRMED,
				CST.DB_ORDER_PROCESSOR
			);

			return true;
		}
		return false;
	}

	public parseSignedOrder(order: IStringSignedOrder): SignedOrder {
		return {
			signature: order.signature,
			senderAddress: order.senderAddress,
			makerAddress: order.makerAddress,
			takerAddress: order.takerAddress,
			makerFee: web3Util.stringToBN(order.makerFee),
			takerFee: web3Util.stringToBN(order.takerFee),
			makerAssetAmount: web3Util.stringToBN(order.makerAssetAmount),
			takerAssetAmount: web3Util.stringToBN(order.takerAssetAmount),
			makerAssetData: order.makerAssetData,
			takerAssetData: order.takerAssetData,
			salt: web3Util.stringToBN(order.salt),
			exchangeAddress: order.exchangeAddress,
			feeRecipientAddress: order.feeRecipientAddress,
			expirationTimeSeconds: web3Util.stringToBN(order.expirationTimeSeconds)
		};
	}

	public async startProcessing(option: IOption) {
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

		const loop = () => {
			let promise: Promise<boolean>;
			switch (option.type) {
				case CST.DB_ADD:
					promise = this.addOrderToDB();
					break;
				case CST.DB_CANCEL:
					promise = this.cancelOrderInDB();
					break;
				case CST.DB_UPDATE:
					promise = this.updateOrderInDB();
					break;
				default:
					throw new Error('Invalid type');
			}
			promise.then(result => {
				setTimeout(() => loop(), result ? 0 : 500);
			});
		};

		loop();
	}
}
const orderUtil = new OrderUtil();
export default orderUtil;
