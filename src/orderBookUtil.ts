import moment from 'moment';
import assetsUtil from './common/assetsUtil';
import * as CST from './constants';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';
import { IDuoOrder, ILiveOrders, IOption, IOrderBookSnapshot, IOrderBookUpdateWS } from './types';
// import util from './util';

class OrderBookUtil {
	public orderBook: { [key: string]: IOrderBookSnapshot } = {};

	public async init(tool: string, option: IOption) {
		const config = require('./keys/' + (option.live ? 'live' : 'dev') + '/dynamo.json');
		dynamoUtil.init(config, option.live, tool);
	}

	public async calculateOrderBookSnapshot() {
		for (const marketId of CST.TRADING_PAIRS) {
			const liveOrders: ILiveOrders[] = await dynamoUtil.getLiveOrders(marketId);
			this.orderBook[marketId] = this.aggrOrderBook(liveOrders);
			console.log('### current orerbook ', this.orderBook[marketId]);
		}
	}

	public sortByPriceTime(liveOrders: ILiveOrders[], isDescending: boolean): ILiveOrders[] {
		liveOrders.sort((a, b) => {
			if (isDescending) return b.price - a.price || a.updatedAt - b.updatedAt;
			else return a.price - b.price || a.updatedAt - b.updatedAt;
		});
		return liveOrders;
	}

	public aggrOrderBook(rawLiveOrders: ILiveOrders[]): IOrderBookSnapshot {
		// const rawOrderBook = this.getOrderBook(rawOrders, marketId);

		return {
			timestamp: moment.utc().valueOf(),
			bids: this.aggrByPrice(
				this.sortByPriceTime(
					rawLiveOrders.filter(order => order[CST.DB_SIDE] === CST.DB_BUY),
					true
				).map(bid => this.parseOrderBookUpdate(bid))
			),
			asks: this.aggrByPrice(
				this.sortByPriceTime(
					rawLiveOrders.filter(order => order[CST.DB_SIDE] === CST.DB_SELL),
					false
				).map(ask => this.parseOrderBookUpdate(ask))
			)
		};
	}

	public aggrByPrice(orderInfo: IOrderBookUpdateWS[]) {
		return orderInfo.reduce((past: IOrderBookUpdateWS[], current) => {
			const same = past.find(r => r && r.price === current.price);
			if (same) same.amount = (Number(same.amount) + Number(current.amount)).toString();
			else past.push(current);
			return past;
		}, []);
	}

	public parseOrderBookUpdate(order: ILiveOrders): IOrderBookUpdateWS {
		return {
			amount: order.amount.toString(),
			price: order.price.toString()
		};
	}

	public applyChangeOrderBook(
		marketId: string,
		timestamp: number,
		bidChanges: IOrderBookUpdateWS[],
		askChanges: IOrderBookUpdateWS[]
	) {
		const newBids = [...this.orderBook[marketId].bids, ...bidChanges].sort((a, b) => {
			return Number(b.price) - Number(a.price);
		});
		const newAsks = [...this.orderBook[marketId].asks, ...askChanges].sort((a, b) => {
			return Number(a.price) - Number(b.price);
		});
		this.orderBook[marketId] = {
			timestamp: timestamp,
			bids: this.aggrByPrice(newBids),
			asks: this.aggrByPrice(newAsks)
		};
	}

	public getOrderBook(orders: IDuoOrder[], marketId: string): IDuoOrder[][] {
		const baseToken = marketId.split('-')[0];
		const bidOrders = orders.filter(order => {
			const takerTokenName = order.takerAssetData
				? assetsUtil.assetDataToTokenName(order.takerAssetData)
				: null;
			return takerTokenName === baseToken;
		});

		const askOrders = orders.filter(order => {
			const makerTokenName = order.makerAssetData
				? assetsUtil.assetDataToTokenName(order.makerAssetData)
				: null;
			return makerTokenName === baseToken;
		});

		return [bidOrders, askOrders];
	}

	public scheduleSumamrizer() {
		setInterval(async () => {
			await this.calculateOrderBookSnapshot();
			for (const marketId in this.orderBook)
				redisUtil.publish(
					`${CST.ORDERBOOK_SNAPSHOT}|${marketId}`,
					JSON.stringify(this.orderBook[marketId])
				);
		}, 30000);
	}
}
const orderbookUtil = new OrderBookUtil();
export default orderbookUtil;
