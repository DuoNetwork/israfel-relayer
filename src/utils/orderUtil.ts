import { SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	INewOrderQueueItem,
	IOption,
	IStringSignedOrder,
	IUserOrder
} from '../common/types';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';
import util from './util';
import web3Util from './Web3Util';

class OrderUtil {
	public async handleUserOrder(
		liveOrder: ILiveOrder,
		type: string,
		status: string,
		updatedBy: string
	) {
		const userOrder = orderUtil.constructUserOrder(liveOrder, type, status, updatedBy);
		try {
			await dynamoUtil.addUserOrder(userOrder);
		} catch (error) {
			util.logError(error);
		}

		return userOrder;
	}

	public async getLiveOrderInPersistence(pair: string, orderHash: string) {
		const redisLiveOrderString = await redisUtil.get(
			`${CST.DB_ORDERS}|${CST.DB_ADD}|${orderHash}`
		);
		if (redisLiveOrderString) {
			const orderQueueItem: INewOrderQueueItem = JSON.parse(redisLiveOrderString);
			return orderQueueItem.liveOrder;
		}

		const liveOrders = await dynamoUtil.getLiveOrders(pair, orderHash);
		if (liveOrders.length < 1) return null;

		return liveOrders[0];
	}

	public async addOrderToPersistence(orderQueueItem: INewOrderQueueItem) {
		try {
			const item = JSON.stringify(orderQueueItem);
			redisUtil.push(`${CST.DB_ORDERS}|${CST.DB_ADD}`, item);
			redisUtil.set(
				`${CST.DB_ORDERS}|${CST.DB_ADD}|${orderQueueItem.liveOrder.orderHash}`,
				item
			);
		} catch (error) {
			util.logError(error);
			return null;
		}

		return this.handleUserOrder(
			orderQueueItem.liveOrder,
			CST.DB_ADD,
			CST.DB_CONFIRMED,
			CST.DB_RELAYER
		);
	}

	public async cancelOrderInPersistence(liveOrder: ILiveOrder) {
		try {
			const item = JSON.stringify(liveOrder);
			redisUtil.push(`${CST.DB_ORDERS}|${CST.DB_CANCEL}`, item);
			redisUtil.set(`${CST.DB_ORDERS}|${CST.DB_ADD}|${liveOrder.orderHash}`, item);
		} catch (error) {
			util.logError(error);
			return null;
		}

		return this.handleUserOrder(liveOrder, CST.DB_CANCEL, CST.DB_CONFIRMED, CST.DB_RELAYER);
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
			account: isBid ? signedOrder.makerAddress : signedOrder.takerAddress,
			pair: pair,
			orderHash: orderHash,
			price: web3Util.getPriceFromSignedOrder(signedOrder, side),
			amount: Number(isBid ? signedOrder.makerAssetAmount : signedOrder.takerAssetAmount),
			side: side,
			initialSequence: 0,
			currentSequence: 0
		};
	}

	public async addOrderToDB() {
		const res = await redisUtil.pop(`${CST.DB_ORDERS}|${CST.DB_ADD}`);

		if (res) {
			const orderQueueItem: INewOrderQueueItem = JSON.parse(res);
			try {
				await dynamoUtil.addRawOrder({
					orderHash: orderQueueItem.liveOrder.orderHash,
					signedOrder: orderQueueItem.signedOrder
				});
				await dynamoUtil.addLiveOrder(orderQueueItem.liveOrder);
				await dynamoUtil.addUserOrder(
					this.constructUserOrder(
						orderQueueItem.liveOrder,
						CST.DB_ADD,
						CST.DB_CONFIRMED,
						CST.DB_ORDER_PROCESSOR
					)
				);
			} catch (err) {
				redisUtil.putBack(`${CST.DB_ORDERS}|${CST.DB_ADD}`, res);
				return false;
			}

			return true;
		}
		return false;
	}

	public async cancelOrderInDB() {
		const res = await redisUtil.pop(`${CST.DB_ORDERS}|${CST.DB_CANCEL}`);
		if (res) {
			const liveOrder: ILiveOrder = JSON.parse(res);
			// attention: needs to ensure atomicity of insertion
			try {
				await dynamoUtil.deleteRawOrderSignature(liveOrder.orderHash);
				await dynamoUtil.deleteLiveOrder(liveOrder);
				await dynamoUtil.addUserOrder(
					this.constructUserOrder(
						liveOrder,
						CST.DB_CANCEL,
						CST.DB_CONFIRMED,
						CST.DB_ORDER_PROCESSOR
					)
				);
			} catch (err) {
				redisUtil.putBack(`${CST.DB_ORDERS}|${CST.DB_CANCEL}`, res);
				return false;
			}

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
				default:
					throw new Error('Invalid type');
					break;
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
