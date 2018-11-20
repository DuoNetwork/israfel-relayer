import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOrderBook,
	IOrderBookLevel,
	IOrderBookSnapshot,
	IOrderBookSnapshotLevel,
	IOrderBookSnapshotUpdate
} from '../common/types';
import redisUtil from './redisUtil';
import util from './util';

class OrderBookUtil {
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

	public sortOrderBookLevels(levels: IOrderBookLevel[], isBid: boolean) {
		if (isBid)
			levels.sort(
				(a, b) =>
					-a.price + b.price ||
					-a.amount + b.amount ||
					a.initialSequence - b.initialSequence
			);
		else
			levels.sort(
				(a, b) =>
					a.price - b.price ||
					-a.amount + b.amount ||
					a.initialSequence - b.initialSequence
			);
	}

	public constructOrderBook(liveOrders: { [orderHash: string]: ILiveOrder }): IOrderBook {
		const bids: IOrderBookLevel[] = [];
		const asks: IOrderBookLevel[] = [];
		for (const orderHash in liveOrders) {
			const liveOrder = liveOrders[orderHash];
			const level: IOrderBookLevel = {
				orderHash: orderHash,
				price: liveOrder.price,
				amount: liveOrder.amount,
				initialSequence: liveOrder.initialSequence
			};
			if (liveOrder.side === CST.DB_BID) bids.push(level);
			else asks.push(level);
		}

		this.sortOrderBookLevels(bids, true);
		this.sortOrderBookLevels(asks, false);
		return {
			bids: bids,
			asks: asks
		};
	}

	public updateOrderBook(
		orderBook: IOrderBook,
		newLevel: IOrderBookLevel,
		isBid: boolean,
		isTerminate: boolean
	) {
		if (isTerminate) {
			if (isBid)
				orderBook.bids = orderBook.bids.filter(l => l.orderHash !== newLevel.orderHash);
			else orderBook.asks = orderBook.asks.filter(l => l.orderHash !== newLevel.orderHash);
			return;
		}

		const existingOrder = (isBid ? orderBook.bids : orderBook.asks).find(
			l => l.orderHash === newLevel.orderHash
		);
		if (existingOrder) existingOrder.amount = newLevel.amount;
		else if (isBid) {
			orderBook.bids.push(newLevel);
			this.sortOrderBookLevels(orderBook.bids, true);
		} else {
			orderBook.asks.push(newLevel);
			this.sortOrderBookLevels(orderBook.asks, false);
		}
	}

	public updateOrderBookSnapshot(
		orderBookSnapshot: IOrderBookSnapshot,
		levelUpdate: IOrderBookSnapshotUpdate
	) {
		orderBookSnapshot.version = levelUpdate.version;
		const isBid = levelUpdate.side === CST.DB_BID;
		const existingLevel = (isBid ? orderBookSnapshot.bids : orderBookSnapshot.asks).find(
			l => l.price === levelUpdate.price
		);
		if (existingLevel) {
			existingLevel.amount += levelUpdate.amount;
			existingLevel.count += levelUpdate.count;
			if (!existingLevel.amount || !existingLevel.count)
				if (isBid)
					orderBookSnapshot.bids = orderBookSnapshot.bids.filter(
						l => l.price !== levelUpdate.price
					);
				else
					orderBookSnapshot.asks = orderBookSnapshot.asks.filter(
						l => l.price !== levelUpdate.price
					);
		} else if (levelUpdate.count > 0) {
			const newLevel: IOrderBookSnapshotLevel = {
				price: levelUpdate.price,
				amount: levelUpdate.amount,
				count: levelUpdate.count
			};
			if (isBid) {
				orderBookSnapshot.bids.push(newLevel);
				orderBookSnapshot.bids.sort((a, b) => -a.price + b.price);
			} else {
				orderBookSnapshot.asks.push(newLevel);
				orderBookSnapshot.asks.sort((a, b) => a.price - b.price);
			}
		} else util.logDebug('trying to remove non existing order book snapshot level, ignore ');
	}

	public renderOrderBookSnapshot(orderBook: IOrderBook): IOrderBookSnapshot {
		return {
			version: util.getUTCNowTimestamp(),
			bids: this.renderOrderBookSnapshotSide(orderBook.bids),
			asks: this.renderOrderBookSnapshotSide(orderBook.asks)
		};
	}

	public renderOrderBookSnapshotSide(
		orderBookLevels: IOrderBookLevel[]
	): IOrderBookSnapshotLevel[] {
		const side: IOrderBookSnapshotLevel[] = [];
		let currLevel: IOrderBookSnapshotLevel = {
			price: 0,
			amount: 0,
			count: 0
		};
		for (let i = 0; i < orderBookLevels.length; i++) {
			const level = orderBookLevels[i];
			if (level.price !== currLevel.price) {
				if (i) side.push(currLevel);
				currLevel = {
					price: level.price,
					amount: level.amount,
					count: 1
				};
			} else {
				currLevel.count++;
				currLevel.amount += level.amount;
			}
		}
		side.push(currLevel);

		return side;
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
const orderBookUtil = new OrderBookUtil();
export default orderBookUtil;
