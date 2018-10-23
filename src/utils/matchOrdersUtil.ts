import { SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import { ILiveOrder } from '../common/types';
import assetsUtil from './assetsUtil';
import dynamoUtil from './dynamoUtil';
import orderbookUtil from './orderBookUtil';

class MatchOrdersUtil {
	public async scanToMatchOrder(
		oldOrders: ILiveOrder[],
		newOrder: SignedOrder,
		side: string
	): Promise<void> {
		for (const order of oldOrders)
			if (side === CST.DB_LO_BID)
				if (
					newOrder.takerAssetAmount.div(newOrder.makerAssetAmount).lessThan(order.price)
				) {
					console.log('### there is profit!');
					const askToMatch = await dynamoUtil.getRawOrder(order.orderHash);
					console.log('#### look for askToMatch!', askToMatch);
					if (askToMatch.takerAssetAmount.equals(newOrder.makerAssetAmount)) {
						console.log('>>>>>>>>>>>>>>>>>>>>> start matching orders ');
						const txHash = await assetsUtil.contractWrappers.exchange.matchOrdersAsync(
							askToMatch,
							newOrder,
							assetsUtil.taker
						);
						console.log('matched txhash is ', txHash);
						console.log('matched old order ', order.orderHash);
						break;
					} else if (askToMatch.makerAssetAmount.equals(newOrder.takerAssetAmount)) {
						const txHash = await assetsUtil.contractWrappers.exchange.matchOrdersAsync(
							newOrder,
							askToMatch,
							assetsUtil.taker
						);
						console.log('matched txhash is ', txHash);
						console.log('matched old order ', order.orderHash);
						break;
					}
				}
	}

	public async matchOrder(newOrder: SignedOrder, pair: string, side: string): Promise<void> {
		await assetsUtil.init();

		const liveOrders = await dynamoUtil.getLiveOrders(pair);
		const [bidOrders, askOrders] = [
			orderbookUtil.sortByPriceTime(
				liveOrders.filter(order => order.side === CST.DB_LO_BID),
				true
			),
			orderbookUtil.sortByPriceTime(
				liveOrders.filter(order => order.side === CST.DB_LO_ASK),
				false
			)
		];
		console.log(
			'matcher ZRX balance BEFORE match',
			await assetsUtil.contractWrappers.erc20Token.getBalanceAsync(
				assetsUtil.getTokenAddressFromName(CST.TOKEN_ZRX),
				assetsUtil.taker
			)
		);
		this.scanToMatchOrder(side === CST.DB_LO_BID ? askOrders : bidOrders, newOrder, side);
		console.log(
			'matcher ZRX balance AFTER match',
			await assetsUtil.contractWrappers.erc20Token.getBalanceAsync(
				assetsUtil.getTokenAddressFromName(CST.TOKEN_ZRX),
				assetsUtil.taker
			)
		);
	}
}
const matchOrdersUtil = new MatchOrdersUtil();
export default matchOrdersUtil;