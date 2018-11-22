import { SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IMatchingOrderResult,
	IOrderBook,
	IOrderQueueItem,
	IRawOrder,
	IStringSignedOrder
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import Web3Util from '../utils/Web3Util';
import redisUtil from './redisUtil';
import util from './util';

export class OrderMatcherUtil {
	public web3Util: Web3Util | null = null;
	public live: boolean = false;
	constructor(web3Util: Web3Util, live: boolean) {
		this.web3Util = web3Util;
		this.live = live;
	}

	public async matchOrders(
		orderBook: IOrderBook,
		orderQueueItem: IOrderQueueItem
	): Promise<IMatchingOrderResult[] | null> {
		const isBid = orderQueueItem.liveOrder.side === CST.DB_BID;
		const price = orderQueueItem.liveOrder.price;
		const orderBookSide = isBid ? orderBook.asks : orderBook.bids;
		const orderLevel = orderBookSide[0];
		const pair = orderQueueItem.liveOrder.pair;

		if ((isBid && price < orderLevel.price) || (!isBid && price > orderLevel.price))
			return null;
		else {
			const leftRawOrder = (await dynamoUtil.getRawOrder(
				orderQueueItem.liveOrder.orderHash
			)) as IRawOrder;
			const leftOrder: SignedOrder = orderPersistenceUtil.parseSignedOrder(
				leftRawOrder.signedOrder as IStringSignedOrder
			);

			const rightRawOrder = (await dynamoUtil.getRawOrder(orderLevel.orderHash)) as IRawOrder;
			const rightOrder: SignedOrder = orderPersistenceUtil.parseSignedOrder(
				rightRawOrder.signedOrder as IStringSignedOrder
			);

			if (!this.web3Util) {
				util.logDebug('no web3Util initiated');
				return null;
			}

			try {
				await this.web3Util.contractWrappers.exchange.matchOrdersAsync(
					leftOrder,
					rightOrder,
					this.live ? CST.RELAYER_ADDR_MAIN : CST.RELAYER_ADDR_KOVAN
				);

				return [
					{
						orderHash: orderQueueItem.liveOrder.orderHash,
						sequence:  await redisUtil.increment(`${CST.DB_SEQUENCE}|${pair}`),
						newBalance: isBid
							? Math.min(
									orderQueueItem.liveOrder.balance,
									orderLevel.amount / orderLevel.price
							)
							: Math.min(
									orderQueueItem.liveOrder.balance,
									orderLevel.amount * orderLevel.price
							)
					},
					{
						orderHash: orderLevel.orderHash,
						sequence:  await redisUtil.increment(`${CST.DB_SEQUENCE}|${pair}`),
						newBalance: isBid
							? Math.min(orderQueueItem.liveOrder.balance * price, orderLevel.amount)
							: Math.min(
									orderQueueItem.liveOrder.balance / price,
									orderLevel.amount * orderLevel.price
							)
					}
				];
			} catch (err) {
				return null;
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
