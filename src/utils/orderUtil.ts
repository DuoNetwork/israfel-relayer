import { signatureUtils, SignedOrder } from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import * as CST from '../common/constants';
import { IOrderQueue } from '../common/types';
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

	public async addOrderToDB() {
		const res = await redisUtil.pop(CST.DB_ADD_ORDER_QUEUE);

		if (res) {
			const orderQueue: IOrderQueue = JSON.parse(res);
			// const id = await identidyUtil.getCurrentId(orderQueue.pair);
			const signedOrder: SignedOrder = orderQueue.order;
			const id = orderQueue.id;

			if (
				!id ||
				!(
					(await dynamoUtil.addLiveOrder({
						pair: orderQueue.pair,
						orderHash: orderQueue.orderHash,
						price: util.round(signedOrder.takerAssetAmount.div(signedOrder.makerAssetAmount).valueOf()),
						amount: signedOrder.takerAssetAmount.valueOf(),
						side: this.determineSide(signedOrder, orderQueue.pair),
						createdAt: 0,
						updatedAt: 0,
						initialSequence: Number(id),
						currentSequence: Number(id)

					})) && (await dynamoUtil.addRawOrder(orderQueue.order, orderQueue.orderHash))
				)
			) {
				redisUtil.putBack(res);
				return false;
			}

			redisUtil.publish(
				`${CST.ORDERBOOK_UPDATE}|${orderQueue.pair}`,
				JSON.stringify({
					id: id,
					pair: orderQueue.pair,
					price: util.round(
						orderQueue.order.makerAssetAmount
							.div(orderQueue.order.takerAssetAmount)
							.valueOf()
					),
					amount: orderQueue.order.makerAssetAmount.valueOf()
				})
			);
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
		// const ECSignature = signatureUtils.parseECSignature(signature);
		// console.log(signature);
		// const isValidSig = await signatureUtils.isValidECSignature(
		// 	orderHash,
		// 	ECSignature,
		// 	rest.makerAddress
		// );

		const isValidSig = await signatureUtils.isValidSignatureAsync(
			providerEngine,
			orderHash,
			signature,
			rest.makerAddress
		);
		console.log('schema is %s and signature is %s', isValidSchema, isValidSig);
		return isValidSchema && isValidSig;
	}

	// public async validateOrder(stringifiedSignedOrder: any): Promise<boolean> {
	// }
}
const orderUtil = new OrderUtil();
export default orderUtil;
