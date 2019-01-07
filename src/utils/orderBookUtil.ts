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
	public getOrderBookSnapshotMid(orderBook: IOrderBookSnapshot) {
		const { bids, asks } = orderBook;
		if (!bids.length && !asks.length) return 0;
		else if (!bids.length) return Number.NEGATIVE_INFINITY;
		else if (!asks.length) return Number.POSITIVE_INFINITY;
		return (bids[0].price + asks[0].price) / 2;
	}

	public getOrderBookSnapshotSpread(orderBook: IOrderBookSnapshot) {
		const { bids, asks } = orderBook;
		if (!bids.length || !asks.length) return Number.POSITIVE_INFINITY;
		return asks[0].price - bids[0].price;
	}

	public sortOrderBookLevels(levels: IOrderBookLevel[], isBid: boolean) {
		if (isBid)
			levels.sort(
				(a, b) =>
					-a.price + b.price ||
					-a.balance + b.balance ||
					a.initialSequence - b.initialSequence
			);
		else
			levels.sort(
				(a, b) =>
					a.price - b.price ||
					-a.balance + b.balance ||
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
				balance: liveOrder.balance,
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
		const existingOrder = (isBid ? orderBook.bids : orderBook.asks).find(
			l => l.orderHash === newLevel.orderHash
		);
		if (isTerminate) {
			if (!existingOrder) return 0;

			if (isBid)
				orderBook.bids = orderBook.bids.filter(l => l.orderHash !== newLevel.orderHash);
			else orderBook.asks = orderBook.asks.filter(l => l.orderHash !== newLevel.orderHash);

			return existingOrder.balance > 0 ? -1 : 0;
		} else if (existingOrder) {
			existingOrder.balance = newLevel.balance;
			if (isBid) this.sortOrderBookLevels(orderBook.bids, true);
			else this.sortOrderBookLevels(orderBook.asks, false);
			return existingOrder.balance > 0 ? 0 : -1;
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
		const updates = levelUpdate.updates;
		for (const update of updates) {
			const isBid = update.side === CST.DB_BID;
			const existingLevel = (isBid ? orderBookSnapshot.bids : orderBookSnapshot.asks).find(
				l => l.price === update.price
			);
			if (existingLevel) {
				existingLevel.balance += update.change;
				existingLevel.count += update.count;
				if (!existingLevel.balance || !existingLevel.count)
					if (isBid)
						orderBookSnapshot.bids = orderBookSnapshot.bids.filter(
							l => l.price !== update.price
						);
					else
						orderBookSnapshot.asks = orderBookSnapshot.asks.filter(
							l => l.price !== update.price
						);
			} else if (update.count > 0) {
				const newLevel: IOrderBookSnapshotLevel = {
					price: update.price,
					balance: update.change,
					count: update.count
				};
				if (isBid) {
					orderBookSnapshot.bids.push(newLevel);
					orderBookSnapshot.bids.sort((a, b) => -a.price + b.price);
				} else {
					orderBookSnapshot.asks.push(newLevel);
					orderBookSnapshot.asks.sort((a, b) => a.price - b.price);
				}
			} else
				util.logDebug('trying to remove non existing order book snapshot level, ignore ');
		}
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
			balance: 0,
			count: 0
		};
		for (let i = 0; i < orderBookLevels.length; i++) {
			const level = orderBookLevels[i];
			if (level.balance > 0)
				if (level.price !== currLevel.price) {
					if (i && currLevel.count) side.push(currLevel);
					currLevel = {
						price: level.price,
						balance: level.balance,
						count: 1
					};
				} else {
					currLevel.count++;
					currLevel.balance += level.balance;
				}
		}
		if (currLevel.count) side.push(currLevel);
		return side;
	}
}
const orderBookUtil = new OrderBookUtil();
export default orderBookUtil;
