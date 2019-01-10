import * as CST from '../common/constants';
import { IOrderBookSnapshot, IOrderBookSnapshotUpdate } from '../common/types';
import redisUtil from './redisUtil';
import util from './util';

class OrderBookPersistenceUtil {
	private getOrderBookSnapshotKey(pair: string) {
		return `${CST.DB_ORDER_BOOKS}|${CST.DB_SNAPSHOT}|${pair}`;
	}

	private getOrderBookPubSubChannel(pair: string) {
		return `${CST.DB_ORDER_BOOKS}|${CST.DB_UPDATE}|${pair}`;
	}

	public subscribeOrderBookUpdate(
		pair: string,
		handleOrderBookUpdate: (
			channel: string,
			orderBookSnapshotUpdate: IOrderBookSnapshotUpdate
		) => any
	) {
		redisUtil.onOrderBookUpdate(handleOrderBookUpdate);
		redisUtil.subscribe(this.getOrderBookPubSubChannel(pair));
	}

	public unsubscribeOrderBookUpdate(pair: string) {
		redisUtil.unsubscribe(this.getOrderBookPubSubChannel(pair));
	}

	public async publishOrderBookUpdate(
		pair: string,
		orderBookSnapshot: IOrderBookSnapshot,
		orderBookSnapshotUpdate?: IOrderBookSnapshotUpdate
	): Promise<boolean> {
		try {
			await redisUtil.set(
				this.getOrderBookSnapshotKey(pair),
				JSON.stringify(orderBookSnapshot)
			);
			if (orderBookSnapshotUpdate)
				await redisUtil.publish(
					this.getOrderBookPubSubChannel(pair),
					JSON.stringify(orderBookSnapshotUpdate)
				);
			return true;
		} catch (err) {
			util.logError(err);
			return false;
		}
	}

	public async getOrderBookSnapshot(pair: string) {
		const snapshotString = await redisUtil.get(this.getOrderBookSnapshotKey(pair));
		if (!snapshotString) return null;
		else return JSON.parse(snapshotString) as IOrderBookSnapshot;
	}
}
const orderBookPersistenceUtil = new OrderBookPersistenceUtil();
export default orderBookPersistenceUtil;
