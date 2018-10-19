import { SignedOrder } from '0x.js';
import assetsUtil from './common/assetsUtil';
import * as CST from './constants';
import dynamoUtil from './dynamoUtil';
import { ILiveOrders } from './types';
import util from './util';
import relayerUtil from './relayerUtil';

class MatchOrdersUtil {
	public matcherAccount = assetsUtil.taker;

	public async scanToMatchOrder(
		oldOrders: ILiveOrders[],
		newOrder: SignedOrder,
		side: string
	): Promise<void> {
		console.log(newOrder.takerAssetAmount, '### new order taker amount');
		for (const order of oldOrders)
			if (side === CST.ORDER_BUY) {
				if (
					util.stringToBN(order.amount.toString()) === newOrder.makerAssetAmount &&
					newOrder.takerAssetAmount.div(newOrder.makerAssetAmount).lessThan(order.price)
				) {
					console.log('one order amount is ', order.amount);
					const leftOrder = await dynamoUtil.getRawOrder(order.orderHash);
					console.log('>>>>>>>>>>>>>>>>>>>>> start matching orders ');
					const txHash = await assetsUtil.contractWrappers.exchange.matchOrdersAsync(
						leftOrder,
						newOrder,
						this.matcherAccount
					);
					console.log('matched txhash is ', txHash);
					console.log('matched old order ', order.orderHash);
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
			relayerUtil.sortByPrice(liveOrders.filter(order => order.side === CST.DB_BUY), 1),
			relayerUtil.sortByPrice(liveOrders.filter(order => order.side === CST.DB_SELL), 1)
		];
		console.log('look for match');
		this.scanToMatchOrder(side === CST.ORDER_BUY ? askOrders : bidOrders, newOrder, side);
		console.log('finish matching');
	}
}
const matchOrdersUtil = new MatchOrdersUtil();
export default matchOrdersUtil;
