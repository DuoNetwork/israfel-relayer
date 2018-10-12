import { SignedOrder } from '0x.js';
import assetsUtil from './common/assetsUtil';
import orderWatcherUtil from './common/orderWatcherUtil';
import firebaseUtil from './firebaseUtil';
import relayerUtil from './relayerUtil';
import { IDuoOrder } from './types';

class MatchOrdersUtil {
	public matcherAccount = '0x91c987bf62d25945db517bdaa840a6c661374402';

	public async scanToMatchOrder(
		oldOrders: IDuoOrder[],
		newOrder: SignedOrder,
		side?: string
	): Promise<void> {
		for (const order of oldOrders) {
			if (side)
				if (
					order.takerAssetAmount === newOrder.makerAssetAmount.toString() &&
					order.price > Number(newOrder.takerAssetAmount.div(newOrder.makerAssetAmount))
				) {
					const leftOrder = orderWatcherUtil.parseToSignedOrder(order);
					const txHash = await assetsUtil.contractWrappers.exchange.matchOrdersAsync(
						leftOrder,
						newOrder,
						this.matcherAccount
					);
					console.log('matched two orders ', txHash);
					break;
				} else if (
					order.makerAssetAmount === newOrder.takerAssetAmount.toString() &&
					order.price > Number(newOrder.takerAssetAmount.div(newOrder.makerAssetAmount))
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
		const [bidOrders, askOrders] = relayerUtil.getOrderBook(
			await firebaseUtil.getOrders(marketId),
			marketId
		);
		const newOrderTaker = relayerUtil.assetDataToTokenName(newOrder.takerAssetData);
		const newOrderMaker = relayerUtil.assetDataToTokenName(newOrder.makerAssetData);

		if (newOrderTaker === baseToken) this.scanToMatchOrder(askOrders, newOrder, 'ask');
		else if (newOrderMaker === baseToken) this.scanToMatchOrder(bidOrders, newOrder);
	}
}
const matchOrdersUtil = new MatchOrdersUtil();
export default matchOrdersUtil;
