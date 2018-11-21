import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOrderBook,
	IOrderBookLevel,
	IOrderBookSnapshot,
	IOrderBookSnapshotLevel,
	IOrderBookSnapshotUpdate
} from '../common/types';
import util from './util';

class OrderBookUtil {
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
	): number {
		if (isTerminate) {
			if (isBid)
				orderBook.bids = orderBook.bids.filter(l => l.orderHash !== newLevel.orderHash);
			else orderBook.asks = orderBook.asks.filter(l => l.orderHash !== newLevel.orderHash);
			return -1;
		}

		const existingOrder = (isBid ? orderBook.bids : orderBook.asks).find(
			l => l.orderHash === newLevel.orderHash
		);
		if (existingOrder) {
			existingOrder.amount = newLevel.amount;
			return 0;
		} else if (isBid) {
			orderBook.bids.push(newLevel);
			this.sortOrderBookLevels(orderBook.bids, true);
			return 1;
		} else {
			orderBook.asks.push(newLevel);
			this.sortOrderBookLevels(orderBook.asks, false);
			return 1;
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

	public renderOrderBookSnapshot(pair: string, orderBook: IOrderBook): IOrderBookSnapshot {
		return {
			pair: pair,
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
		if (currLevel.count) side.push(currLevel);

		return side;
	}
}
const orderBookUtil = new OrderBookUtil();
export default orderBookUtil;
