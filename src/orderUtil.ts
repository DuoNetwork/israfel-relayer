import * as CST from './constants';
import dynamoUtil from './dynamoUtil';
import identidyUtil from './identityUtil';
import redisUtil from './redisUtil';
import { IOrderQueue } from './types';

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

			const id = await identidyUtil.getCurrentId(orderQueue.pair);

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
			)
				redisUtil.putBack(res);
			return true;
		} else return false;
	}
}
const orderUtil = new OrderUtil();
export default orderUtil;
