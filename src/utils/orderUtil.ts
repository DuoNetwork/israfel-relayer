import { SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import {
	ICancelOrderQueueItem,
	ILiveOrder,
	INewOrderQueueItem,
	IOption,
	IStringSignedOrder,
	IUserOrder
} from '../common/types';
import assetUtil from './assetUtil';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';
import util from './util';
import { stringToBN } from './web3Util';

class OrderUtil {
	public getUserOrder(
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

	public getNewLiveOrder(
		signedOrder: IStringSignedOrder,
		pair: string,
		orderHash: string
	): ILiveOrder {
		const side = assetUtil.getSideFromSignedOrder(signedOrder, pair);
		const isBid = side === CST.DB_BID;
		return {
			account: isBid ? signedOrder.makerAddress : signedOrder.takerAddress,
			pair: pair,
			orderHash: orderHash,
			price: util.round(
				stringToBN(isBid ? signedOrder.makerAssetAmount : signedOrder.takerAssetAmount)
					.div(isBid ? signedOrder.takerAssetAmount : signedOrder.makerAssetAmount)
					.valueOf()
			),
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
				await dynamoUtil.addRawOrder(orderQueueItem.rawOrder);
				await dynamoUtil.addLiveOrder(orderQueueItem.liveOrder);
				await dynamoUtil.addUserOrder(
					this.getUserOrder(
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
			const orderQueueItem: ICancelOrderQueueItem = JSON.parse(res);
			// attention: needs to ensure atomicity of insertion
			try {
				await dynamoUtil.deleteRawOrderSignature(orderQueueItem.liveOrder.orderHash);
				await dynamoUtil.deleteLiveOrder(orderQueueItem.liveOrder);
				await dynamoUtil.addUserOrder(
					this.getUserOrder(
						orderQueueItem.liveOrder,
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
			makerFee: stringToBN(order.makerFee),
			takerFee: stringToBN(order.takerFee),
			makerAssetAmount: stringToBN(order.makerAssetAmount),
			takerAssetAmount: stringToBN(order.takerAssetAmount),
			makerAssetData: order.makerAssetData,
			takerAssetData: order.takerAssetData,
			salt: stringToBN(order.salt),
			exchangeAddress: order.exchangeAddress,
			feeRecipientAddress: order.feeRecipientAddress,
			expirationTimeSeconds: stringToBN(order.expirationTimeSeconds)
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
