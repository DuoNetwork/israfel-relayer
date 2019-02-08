import { Constants, ITrade } from '@finbook/israfel-common';
import { IOrderMatchRequest } from '../common/types';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';

class TradePriceUtil {
	private getTradePubSubChannel(pair: string) {
		return `${Constants.DB_TRADES}|${Constants.DB_PUBSUB}|${pair}`;
	}

	public subscribeTradeUpdate(
		pair: string,
		handleTradeUpdate: (channel: string, trade: ITrade) => any
	) {
		redisUtil.onTradeUpdate(handleTradeUpdate);
		redisUtil.subscribe(this.getTradePubSubChannel(pair));
	}

	public unsubscribeTradeUpdate(pair: string) {
		redisUtil.unsubscribe(this.getTradePubSubChannel(pair));
	}

	public async persistTrade(
		txHash: string,
		matchTimeStamp: number,
		matchRequest: IOrderMatchRequest,
		takerAddress: string
	) {
		const { pair, bid, ask, takerSide } = matchRequest;
		const takerIsBid = takerSide === Constants.DB_BID;
		const takerOrder = takerIsBid ? bid : ask;
		const makerOrder = takerIsBid ? ask : bid;
		const trade = {
			pair: pair,
			transactionHash: txHash,
			feeAsset: matchRequest.feeAsset,
			taker: {
				orderHash: takerOrder.orderHash,
				address: takerAddress,
				side: takerSide,
				price: takerOrder.price,
				amount: takerOrder.matchingAmount,
				fee: takerOrder.fee
			},
			maker: {
				orderHash: makerOrder.orderHash,
				price: makerOrder.price,
				amount: makerOrder.matchingAmount,
				fee: makerOrder.fee
			},
			timestamp: matchTimeStamp
		};
		await dynamoUtil.addTrade(trade);
		await redisUtil.publish(this.getTradePubSubChannel(pair), JSON.stringify(trade));
	}
}

const tradePriceUtil = new TradePriceUtil();
export default tradePriceUtil;
