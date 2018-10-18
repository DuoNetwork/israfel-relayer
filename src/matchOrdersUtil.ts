import { SignedOrder } from '0x.js';
import assetsUtil from './common/assetsUtil';
import orderWatcherUtil from './common/orderWatcherUtil';
import * as CST from './constants';
import dynamoUtil from './dynamoUtil';
import { ILiveOrders } from './types';

class MatchOrdersUtil {
	public matcherAccount = '0x91c987bf62d25945db517bdaa840a6c661374402';

	public async scanToMatchOrder(
		oldOrders: ILiveOrders[],
		newOrder: SignedOrder,
		isAsk?: boolean
	): Promise<void> {
		for (const order of oldOrders)
			if (isAsk) {
				console.log(newOrder.takerAssetAmount, '### new order taker amount');
				if (
					order.amount === Number(newOrder.makerAssetAmount) &&
					newOrder.takerAssetAmount.div(newOrder.makerAssetAmount).lessThan(order.price)
				) {
					const leftOrder = orderWatcherUtil.parseToSignedOrder(order);
					console.log('>>>>>>>>>>>>>>>>>>>>> start matching orders ');
					console.log(leftOrder);
					console.log(newOrder);
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
					const rightOrder = orderWatcherUtil.parseToSignedOrder(order);
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

	public async matchOrder(newOrder: SignedOrder, marketId: string): Promise<void> {
		const baseToken = marketId.split('-')[0];
		const liveOrders = await dynamoUtil.getLiveOrders(marketId);
		const [bidOrders, askOrders] = [
			liveOrders.filter(order => order.side === CST.DB_BUY),
			liveOrders.filter(order => order.side === CST.DB_SELL)
		];
		const newOrderTaker = assetsUtil.assetDataToTokenName(newOrder.takerAssetData);
		const newOrderMaker = assetsUtil.assetDataToTokenName(newOrder.makerAssetData);

		console.log('look for match');
		if (newOrderTaker === baseToken) this.scanToMatchOrder(askOrders, newOrder, true);
		else if (newOrderMaker === baseToken) this.scanToMatchOrder(bidOrders, newOrder);
	}
}
const matchOrdersUtil = new MatchOrdersUtil();
export default matchOrdersUtil;
