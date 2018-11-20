import * as CST from '../common/constants';
import { ILiveOrder, IOrderBook, IOrderBookLevel, IOrderBookSnapshot } from '../common/types';
import util from './util';

class OrderBookUtil {
	public sortOrderBookLevels(levels: IOrderBookLevel[], isBid: boolean) {
		if (isBid)
			levels.sort(
				(a, b) => -a.price + b.price || -a.amount + b.amount || -a.sequence + b.sequence
			);
		else
			levels.sort(
				(a, b) => a.price - b.price || -a.amount + b.amount || -a.sequence + b.sequence
			);
	}
	public constructOrderBook(liveOrders: { [orderHash: string]: ILiveOrder }): IOrderBook {
		const bids: IOrderBookLevel[] = [];
		const asks: IOrderBookLevel[] = [];
		let sequence = 0;
		for (const orderHash in liveOrders) {
			const liveOrder = liveOrders[orderHash];
			const level: IOrderBookLevel = {
				orderHash: orderHash,
				price: liveOrder.price,
				amount: liveOrder.amount,
				sequence: liveOrder.currentSequence
			};
			sequence = Math.max(sequence, liveOrder.currentSequence);
			if (liveOrder.side === CST.DB_BID) bids.push(level);
			else asks.push(level);
		}

		this.sortOrderBookLevels(bids, true);
		this.sortOrderBookLevels(bids, false);
		return {
			sequence: sequence,
			bids: bids,
			asks: asks
		};
	}

	public updateOrderBook(
		orderBook: IOrderBook,
		newLevel: IOrderBookLevel,
		isBid: boolean,
		isTerminte: boolean
	) {
		if (isTerminte) {
			if (isBid)
				orderBook.bids = orderBook.bids.filter(l => l.orderHash !== newLevel.orderHash);
			else orderBook.asks = orderBook.asks.filter(l => l.orderHash !== newLevel.orderHash);
			return;
		}

		const existingOrder = (isBid ? orderBook.bids : orderBook.asks).find(
			l => l.orderHash === newLevel.orderHash
		);
		if (existingOrder) {
			existingOrder.amount = newLevel.amount;
			existingOrder.sequence = newLevel.sequence;
		} else if (isBid) {
			orderBook.bids.push(newLevel);
			this.sortOrderBookLevels(orderBook.bids, true);
		} else {
			orderBook.asks.push(newLevel);
			this.sortOrderBookLevels(orderBook.asks, false);
		}
	}
}
const orderBookUtil = new OrderBookUtil();
export default orderBookUtil;
