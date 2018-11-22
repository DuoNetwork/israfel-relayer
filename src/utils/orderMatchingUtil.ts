import { SignedOrder } from '0x.js';
import moment from 'moment';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IMatchingOrderResult,
	IOrderBook,
	IRawOrder,
	IStringSignedOrder
} from '../common/types';
import dynamoUtil from './dynamoUtil';
import orderPersistenceUtil from './orderPersistenceUtil';
import redisUtil from './redisUtil';
import util from './util';
import Web3Util from './Web3Util';

class OrderMatchingUtil {
	public async matchOrders(
		web3Util: Web3Util,
		orderBook: IOrderBook,
		liveOrder: ILiveOrder
	): Promise<IMatchingOrderResult[]> {
		const isBid = liveOrder.side === CST.DB_BID;
		const price = liveOrder.price;
		const orderBookSide = isBid ? orderBook.asks : orderBook.bids;
		const orderLevel = orderBookSide[0];
		const pair = liveOrder.pair;

		if ((isBid && price < orderLevel.price) || (!isBid && price > orderLevel.price)) return [];
		else {
			const leftRawOrder = (await dynamoUtil.getRawOrder(liveOrder.orderHash)) as IRawOrder;
			const leftOrder: SignedOrder = orderPersistenceUtil.parseSignedOrder(
				leftRawOrder.signedOrder as IStringSignedOrder
			);

			const rightRawOrder = (await dynamoUtil.getRawOrder(orderLevel.orderHash)) as IRawOrder;
			const rightOrder: SignedOrder = orderPersistenceUtil.parseSignedOrder(
				rightRawOrder.signedOrder as IStringSignedOrder
			);

			if (rightOrder.expirationTimeSeconds.toNumber() - moment().valueOf() / 1000 < 3 * 60) {
				util.logDebug(
					`the order ${
						orderLevel.orderHash
					} is expiring in 3 minutes, removing this order`
				);
				return [
					{
						orderHash: liveOrder.orderHash,
						sequence: await redisUtil.increment(`${CST.DB_SEQUENCE}|${pair}`),
						newBalance: liveOrder.balance
					},
					{
						orderHash: orderLevel.orderHash,
						sequence: await redisUtil.increment(`${CST.DB_SEQUENCE}|${pair}`),
						newBalance: 0
					}
				];
			}

			try {
				await web3Util.contractWrappers.exchange.matchOrdersAsync(
					leftOrder,
					rightOrder,
					web3Util.relayerAddress
				);

				return [
					{
						orderHash: liveOrder.orderHash,
						sequence: await redisUtil.increment(`${CST.DB_SEQUENCE}|${pair}`),
						newBalance: isBid
							? Math.min(liveOrder.balance, orderLevel.amount / orderLevel.price)
							: Math.min(liveOrder.balance, orderLevel.amount * orderLevel.price)
					},
					{
						orderHash: orderLevel.orderHash,
						sequence: await redisUtil.increment(`${CST.DB_SEQUENCE}|${pair}`),
						newBalance: isBid
							? Math.min(liveOrder.balance * price, orderLevel.amount)
							: Math.min(
									liveOrder.balance / price,
									orderLevel.amount * orderLevel.price
							)
					}
				];
			} catch (err) {
				return [];
				//TODO: handle fail
			}
		}
	}

	public async batchAddUserOrders(liveOrders: ILiveOrder[]) {
		for (const liveOrder of liveOrders)
			await orderPersistenceUtil.addUserOrderToDB(
				liveOrder,
				CST.DB_UPDATE,
				CST.DB_MATCHING,
				CST.DB_ORDER_MATCHER,
				true
			);
	}
}

const orderMatchingUtil = new OrderMatchingUtil();
export default orderMatchingUtil;
