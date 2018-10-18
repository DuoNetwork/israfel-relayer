import { SignedOrder } from '0x.js';
import assetsUtil from './common/assetsUtil';
import * as CST from './constants';
import dynamoUtil from './dynamoUtil';
import { ILiveOrders } from './types';

class MatchOrdersUtil {
	public matcherAccount = assetsUtil.taker;

	public async scanToMatchOrder(
		oldOrders: ILiveOrders[],
		newOrder: SignedOrder,
		side: string
	): Promise<void> {
		for (const order of oldOrders)
			if (side === CST.ORDER_BUY) {
				console.log(newOrder.takerAssetAmount, '### new order taker amount');
				if (
					order.amount === Number(newOrder.makerAssetAmount) &&
					newOrder.takerAssetAmount.div(newOrder.makerAssetAmount).lessThan(order.price)
				) {
					const leftOrder = await dynamoUtil.getRawOrder(order.orderHash);
					console.log('>>>>>>>>>>>>>>>>>>>>> start matching orders ');
					const txHash = await assetsUtil.contractWrappers.exchange.matchOrdersAsync(
						leftOrder,
						newOrder,
						this.matcherAccount
					);
					console.log('matched two orders ', txHash);
					break;
				} else if (
					order.amount === Number(newOrder.takerAssetAmount) &&
					newOrder.takerAssetAmount.div(newOrder.makerAssetAmount).lessThan(order.price)
				) {
					const rightOrder = await dynamoUtil.getRawOrder(order.orderHash);
					const txHash = await assetsUtil.contractWrappers.exchange.matchOrdersAsync(
						newOrder,
						rightOrder,
						this.matcherAccount
					);
					console.log('matched two orders ', txHash);
					break;
				}
			}
	}

	public async matchOrder(newOrder: SignedOrder, marketId: string, side: string): Promise<void> {
		const liveOrders = await dynamoUtil.getLiveOrders(marketId);
		const [bidOrders, askOrders] = [
			liveOrders.filter(order => order.side === CST.DB_BUY),
			liveOrders.filter(order => order.side === CST.DB_SELL)
		];
		console.log('look for match');
		this.scanToMatchOrder(side === CST.ORDER_BUY ? askOrders : bidOrders, newOrder, side);
	}
}
const matchOrdersUtil = new MatchOrdersUtil();
export default matchOrdersUtil;
