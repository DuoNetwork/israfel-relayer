import * as CST from './constants';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';
import { IOrderQueue } from './types';
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
		const res = await redisUtil.pop(CST.DB_ORDERS);

		if (res) {
			const orderQueue: IOrderQueue = JSON.parse(res);
			// const id = await identidyUtil.getCurrentId(orderQueue.pair);
			const id = orderQueue.id;

			if (
				!id ||
				!(
					(await dynamoUtil.addLiveOrder(
						orderQueue.order,
						orderQueue.orderHash,
						orderQueue.pair,
						orderQueue.side,
						id
					)) && (await dynamoUtil.addRawOrder(orderQueue.order, orderQueue.orderHash))
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
}
const orderUtil = new OrderUtil();
export default orderUtil;
