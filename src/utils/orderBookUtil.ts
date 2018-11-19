import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOrderBookSnapshot,
	IOrderBookUpdate,
	IOrderBookUpdateItem,
	IOrderBookUpdateWS
} from '../common/types';
import orderPersistenceUtil from './orderPersistenceUtil';
import redisUtil from './redisUtil';

class OrderBookUtil {
	public orderBook: { [key: string]: IOrderBookSnapshot } = {};
	public async calculateOrderBookSnapshot() {
		for (const pair of CST.TRADING_PAIRS) {
			const liveOrders: {
				[orderHash: string]: ILiveOrder;
			} = await orderPersistenceUtil.getAllLiveOrdersInPersistence(pair);
			this.orderBook[pair] = this.aggrOrderBook(liveOrders);
			console.log('### current orerbook ', this.orderBook[pair]);
		}
	}

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
		pair: string,
		sequence: number,
		bidChanges: IOrderBookUpdateWS[],
		askChanges: IOrderBookUpdateWS[]
	) {
		const newBids = [...this.orderBook[pair].bids, ...bidChanges].sort((a, b) => {
			return Number(b.price) - Number(a.price);
		});
		const newAsks = [...this.orderBook[pair].asks, ...askChanges].sort((a, b) => {
			return Number(a.price) - Number(b.price);
		});
		this.orderBook[pair] = {
			sequence: sequence,
			bids: this.aggrByPrice(newBids),
			asks: this.aggrByPrice(newAsks)
		};
	}

	public publishOrderBookUpdate(updateItem: IOrderBookUpdateItem) {
		const { price, pair, balance } = updateItem.liveOrder;
		let updateAmt = 0;
		switch (updateItem.method) {
			case CST.DB_ADD:
				updateAmt = balance;
				break;
			case CST.DB_TERMINATE:
				updateAmt = -balance;
				break;
			case CST.DB_UPDATE:
				updateAmt = updateItem.balance - balance;
				break;
		}

		const orderBookUpdate: IOrderBookUpdate = {
			price: price,
			pair: pair,
			amount: updateAmt,
			sequence: updateItem.sequence
		};

		redisUtil.publish(`${CST.ORDERBOOK_UPDATE}|${pair}`, JSON.stringify(orderBookUpdate));
	}

	public scheduleSumamrizer() {
		setInterval(async () => {
			await this.calculateOrderBookSnapshot();
			for (const pair in this.orderBook)
				redisUtil.publish(
					`${CST.ORDERBOOK_SNAPSHOT}|${pair}`,
					JSON.stringify(this.orderBook[pair])
				);
		}, 30000);
	}
}
const orderbookUtil = new OrderBookUtil();
export default orderbookUtil;
