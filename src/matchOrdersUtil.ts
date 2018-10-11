import { SignedOrder } from '0x.js';
import assetsUtil from './common/assetsUtil';
import orderWatcherUtil from './common/orderWatcherUtil';
import firebaseUtil from './firebaseUtil';
import relayerUtil from './relayerUtil';
import { IDuoOrder } from './types';
import util from './util';

class MatchOrdersUtil {
	public matcherAccount = '0x91c987bf62d25945db517bdaa840a6c661374402';

	public async scanToMatchOrder(oldOrders: IDuoOrder[], newOrder: SignedOrder): Promise<void> {
		for (const order of oldOrders)
			{
				const leftOrder = orderWatcherUtil.parseToSignedOrder(order);
				if (leftOrder.takerAssetAmount === newOrder.makerAssetAmount) {
				const txHash = await assetsUtil.contractWrappers.exchange.matchOrdersAsync(
					leftOrder,
					newOrder,
					this.matcherAccount
				);
				console.log('matched two orders ', txHash);
				break;
			}}
	}

	public async matchOrder(newOrder: SignedOrder, marketId: string): Promise<void> {
		const baseToken = marketId.split('-')[0];
		const [bidOrders, askOrders] = relayerUtil.getOrderBook(
			await firebaseUtil.getOrders(marketId),
			marketId
		);
		const newOrderTaker = relayerUtil.assetDataToTokenName(newOrder.takerAssetData);
		const newOrderMaker = relayerUtil.assetDataToTokenName(newOrder.makerAssetData);

		if (newOrderTaker === baseToken) this.scanToMatchOrder(askOrders, newOrder);
		else if (newOrderMaker === baseToken) this.scanToMatchOrder(bidOrders, newOrder);
	}
}
const matchOrdersUtil = new MatchOrdersUtil();
export default matchOrdersUtil;
