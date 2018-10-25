import { signatureUtils, SignedOrder } from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import * as CST from '../common/constants';
import {
	ICancelOrderQueueItem,
	ILiveOrder,
	INewOrderQueueItem,
	IOption,
	IUserOrder
} from '../common/types';
import { providerEngine } from '../providerEngine';
import assetsUtil from './assetsUtil';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';
import util from './util';

class OrderUtil {
	public getUserOrder(type: string, account: string, liveOrder: ILiveOrder): IUserOrder {
		return {
			account: account,
			pair: liveOrder.pair,
			type: type,
			status: CST.DB_CONFIRMED,
			orderHash: liveOrder.orderHash,
			price: liveOrder.price,
			amount: liveOrder.amount,
			side: liveOrder.side,
			sequence: liveOrder.currentSequence,
			updatedBy: CST.DB_ORDER_PROCESSOR
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
						CST.DB_ADD,
						orderQueueItem.rawOrder.signedOrder.makerAddress,
						orderQueueItem.liveOrder
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
						CST.DB_CANCEL,
						orderQueueItem.account,
						orderQueueItem.liveOrder
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

	public getSideFromSignedOrder(order: SignedOrder, pair: string): string {
		return assetsUtil.assetDataToTokenName(order.takerAssetData) === pair.split('-')[0]
			? CST.DB_BID
			: CST.DB_ASK;
	}

	public parseSignedOrder(order: any): SignedOrder {
		return {
			signature: order.signature,
			senderAddress: order.senderAddress,
			makerAddress: order.makerAddress,
			takerAddress: order.takerAddress,
			makerFee: util.stringToBN(order.makerFee),
			takerFee: util.stringToBN(order.takerFee),
			makerAssetAmount: util.stringToBN(order.makerAssetAmount),
			takerAssetAmount: util.stringToBN(order.takerAssetAmount),
			makerAssetData: order.makerAssetData,
			takerAssetData: order.takerAssetData,
			salt: util.stringToBN(order.salt),
			exchangeAddress: order.exchangeAddress,
			feeRecipientAddress: order.feeRecipientAddress,
			expirationTimeSeconds: util.stringToBN(order.expirationTimeSeconds)
		};
	}

	public async validateOrder(signedOrder: SignedOrder, orderHash: string): Promise<boolean> {
		const { orderSchema } = schemas;
		const { signature, ...rest } = signedOrder;
		const validator = new SchemaValidator();
		const isValidSchema = validator.validate(rest, orderSchema).valid;

		const isValidSig = await signatureUtils.isValidSignatureAsync(
			providerEngine,
			orderHash,
			signature,
			rest.makerAddress
		);
		util.logDebug(`schema is ${isValidSchema} and signature is ${isValidSig}`);
		return isValidSchema && isValidSig;
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
