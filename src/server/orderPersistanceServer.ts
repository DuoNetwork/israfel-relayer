import { Constants } from '../../../israfel-common/src';
import { IOption } from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import redisUtil from '../utils/redisUtil';

class OrderPersistanceServer {
	public async startServer(option: IOption) {
		if (option.server) {
			dynamoUtil.updateStatus(
				Constants.DB_ORDERS,
				await redisUtil.getQueueLength(orderPersistenceUtil.getOrderQueueKey())
			);

			global.setInterval(
				async () =>
					dynamoUtil.updateStatus(
						Constants.DB_ORDERS,
						await redisUtil.getQueueLength(orderPersistenceUtil.getOrderQueueKey())
					),
				15000
			);
		}

		const loop = () =>
			orderPersistenceUtil.processOrderQueue().then(result => {
				global.setTimeout(() => loop(), result ? 0 : 500);
			});
		loop();
	}
}

const orderPersistanceServer = new OrderPersistanceServer();
export default orderPersistanceServer;
