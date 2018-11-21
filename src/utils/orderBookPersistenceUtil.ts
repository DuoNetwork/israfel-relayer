import * as CST from '../common/constants';
import {
	IOrderBookSnapshot,
	IOrderBookSnapshotUpdate
} from '../common/types';
import redisUtil from './redisUtil';
import util from './util';

class OrderBookPersistenceUtil {
	public subscribeOrderBookUpdate(
		pair: string,
		handleOrderBookUpdate: (
			channel: string,
			orderBookSnapshotUpdate: IOrderBookSnapshotUpdate
		) => any
	) {
		redisUtil.onOrderBookUpdate(handleOrderBookUpdate);
		redisUtil.subscribe(`${CST.DB_ORDER_BOOKS}|${CST.DB_UPDATE}|${pair}`);
	}

	public unsubscribeOrderBookUpdate(pair: string) {
		redisUtil.unsubscribe(`${CST.DB_ORDER_BOOKS}|${CST.DB_UPDATE}|${pair}`);
	}

	public async publishOrderBookUpdate(
		pair: string,
		orderBookSnapshot: IOrderBookSnapshot,
		orderBookSnapshotUpdate?: IOrderBookSnapshotUpdate
	): Promise<boolean> {
		try {
			await redisUtil.set(
				`${CST.DB_ORDER_BOOKS}|${CST.DB_SNAPSHOT}|${pair}`,
				JSON.stringify(orderBookSnapshot)
			);
			if (orderBookSnapshotUpdate)
				await redisUtil.publish(
					`${CST.DB_ORDER_BOOKS}|${CST.DB_UPDATE}|${pair}`,
					JSON.stringify(orderBookSnapshotUpdate)
				);
			return true;
		} catch (err) {
			util.logError(err);
			return false;
		}
	}

	public async getOrderBookSnapshot(pair: string) {
		const snapshotString = await redisUtil.get(
			`${CST.DB_ORDER_BOOKS}|${CST.DB_SNAPSHOT}|${pair}`
		);
		if (!snapshotString) return null;
		else return JSON.parse(snapshotString) as IOrderBookSnapshot;
	}
}
const orderBookPersistenceUtil = new OrderBookPersistenceUtil();
export default orderBookPersistenceUtil;
