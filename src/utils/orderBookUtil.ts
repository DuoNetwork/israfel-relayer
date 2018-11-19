import * as CST from '../common/constants';
import { ILiveOrder, IOrderBookSnapshot, IOrderBookUpdateWS } from '../common/types';
import util from './util';

class OrderBookUtil {
	public sortByPriceTime(liveOrders: ILiveOrder[], isDescending: boolean): ILiveOrder[] {
		liveOrders.sort((a, b) => {
			if (isDescending) return b.price - a.price || (a.updatedAt || 0) - (b.updatedAt || 0);
			else return a.price - b.price || (a.updatedAt || 0) - (b.updatedAt || 0);
		});
		return liveOrders;
	}

	public aggrOrderBook(rawLiveOrders: { [orderHash: string]: ILiveOrder }): IOrderBookSnapshot {
		return {
			sequence: Math.max(
				...Object.keys(rawLiveOrders).map(hash => rawLiveOrders[hash].initialSequence)
			),
			bids: this.aggrByPrice(
				this.sortByPriceTime(
					Object.keys(rawLiveOrders)
						.filter(hash => rawLiveOrders[hash][CST.DB_SIDE] === CST.DB_BID)
						.reduce((array: ILiveOrder[], key: string) => {
							array.push(rawLiveOrders[key]);
							return array;
						}, []),
					true
				).map(bid => this.parseOrderBookUpdate(bid))
			),
			asks: this.aggrByPrice(
				this.sortByPriceTime(
					Object.keys(rawLiveOrders)
						.filter(hash => rawLiveOrders[hash][CST.DB_SIDE] === CST.DB_ASK)
						.reduce((array: ILiveOrder[], key: string) => {
							array.push(rawLiveOrders[key]);
							return array;
						}, []),
					false
				).map(ask => this.parseOrderBookUpdate(ask))
			)
		};
	}

	public aggrByPrice(orderInfo: IOrderBookUpdateWS[]) {
		return orderInfo.reduce((past: IOrderBookUpdateWS[], current) => {
			const same = past.find(r => r && r.price === current.price);
			if (same) same.amount = Number(same.amount) + Number(current.amount);
			else past.push(current);
			return past;
		}, []);
	}

	public parseOrderBookUpdate(order: ILiveOrder): IOrderBookUpdateWS {
		return {
			amount: order.amount,
			price: order.price
		};
	}

	public applyChangeOrderBook(
		orderBook: IOrderBookSnapshot | null,
		sequence: number,
		bidChanges: IOrderBookUpdateWS[],
		askChanges: IOrderBookUpdateWS[]
	): IOrderBookSnapshot {
		if (!orderBook)
			return {
				sequence: sequence,
				bids: this.aggrByPrice(
					bidChanges.sort((a, b) => {
						return Number(b.price) - Number(a.price);
					})
				),
				asks: this.aggrByPrice(
					askChanges.sort((a, b) => {
						return Number(b.price) - Number(a.price);
					})
				)
			};
		if (sequence <= orderBook.sequence) {
			util.logDebug('update sequence should be larger than curent snapshot sequence');
			return orderBook;
		}

		const newBids = [...orderBook.bids, ...bidChanges].sort((a, b) => {
			return Number(b.price) - Number(a.price);
		});
		const newAsks = [...orderBook.asks, ...askChanges].sort((a, b) => {
			return Number(a.price) - Number(b.price);
		});
		return {
			sequence: sequence,
			bids: this.aggrByPrice(newBids),
			asks: this.aggrByPrice(newAsks)
		};
	}
}
const orderbookUtil = new OrderBookUtil();
export default orderbookUtil;
