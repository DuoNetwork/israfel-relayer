import { signatureUtils, SignedOrder } from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import * as CST from '../common/constants';
import { IAddOrderQueue, ICancelOrderQueue, ILiveOrder } from '../common/types';
import { providerEngine } from '../providerEngine';
import assetsUtil from './assetsUtil';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';
import util from './util';

class OrderUtil {
	public startAddOrders() {
		const tradeLoop = () =>
			this.addOrderToDB().then(result => {
				setTimeout(() => tradeLoop(), result ? 0 : 100);
			});

		tradeLoop();
	}

	public startCancelOrders() {
		const tradeLoop = () =>
			this.cancelOrder().then(result => {
				setTimeout(() => tradeLoop(), result ? 0 : 100);
			});

		tradeLoop();
	}

	public async addOrderToDB() {
		const res = await redisUtil.pop(CST.DB_ADD_ORDER_QUEUE);

		if (res) {
			const orderQueue: IAddOrderQueue = JSON.parse(res);
			const signedOrder: SignedOrder = orderQueue.order;

			const id = orderQueue.id;
			// attention: needs to ensure atomicity of insertion
			try {
				await dynamoUtil.addLiveOrder({
					pair: orderQueue.pair,
					orderHash: orderQueue.orderHash,
					price: util.round(
						signedOrder.takerAssetAmount.div(signedOrder.makerAssetAmount).valueOf()
					),
					amount: Number(signedOrder.takerAssetAmount.valueOf()),
					side: this.determineSide(signedOrder, orderQueue.pair),
					createdAt: 0,
					updatedAt: 0,
					initialSequence: Number(id),
					currentSequence: Number(id)
				});

				await dynamoUtil.addRawOrder({
					orderHash: orderQueue.orderHash,
					signedOrder: signedOrder
				});
			} catch (err) {
				redisUtil.putBack(CST.DB_ADD_ORDER_QUEUE, res);
				return false;
			}

			return true;
		}
		return false;
	}

	public async cancelOrder() {
		const res = await redisUtil.pop(CST.DB_CANCEL_ORDER_QUEUE);
		if (res) {
			const orderQueue: ICancelOrderQueue = JSON.parse(res);
			const liveOrder: ILiveOrder = orderQueue.liveOrder;
			// attention: needs to ensure atomicity of insertion
			try {
				await dynamoUtil.deleteLiveOrder(liveOrder);
				await dynamoUtil.deleteRawOrderSignature(liveOrder.orderHash);
			} catch (err) {
				redisUtil.putBack(CST.DB_CANCEL_ORDER_QUEUE, res);
				return false;
			}

			return true;
		}
		return false;
	}

	public determineSide(order: SignedOrder, pair: string): string {
		const baseToken = pair.split('-')[0];
		return assetsUtil.assetDataToTokenName(order.takerAssetData) === baseToken
			? CST.DB_BID
			: CST.DB_ASK;
	}

	public toSignedOrder(order: any): SignedOrder {
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
	public async validateNewOrder(signedOrder: SignedOrder, orderHash: string): Promise<boolean> {
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
		console.log('schema is %s and signature is %s', isValidSchema, isValidSig);
		return isValidSchema && isValidSig;
	}
}
const orderUtil = new OrderUtil();
export default orderUtil;
