import { BigNumber, SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IMatchingCandidate,
	IOrderBook,
	IOrderBookLevelUpdate,
	IStringSignedOrder
} from '../common/types';
import orderPersistenceUtil from './orderPersistenceUtil';
import orderUtil from './orderUtil';
import util from './util';
import Web3Util from './Web3Util';

class OrderMatchingUtil {
	public findMatchingOrders(
		orderBook: IOrderBook,
		liveOrders: { [orderHash: string]: ILiveOrder },
		updatesRequired: boolean = false
	): {
		ordersToMatch: IMatchingCandidate[];
		orderBookLevelUpdates: IOrderBookLevelUpdate[];
	} {
		const { bids, asks } = orderBook;
		const ordersToMatch: IMatchingCandidate[] = [];
		const orderBookLevelUpdates: IOrderBookLevelUpdate[] = [];
		if (bids.length && asks.length) {
			const bestBid = bids.find(level => level.balance > 0);
			const bestAsk = asks.find(level => level.balance > 0);
			if (!bestBid || !bestAsk || bestAsk.price > bestBid.price)
				return {
					ordersToMatch,
					orderBookLevelUpdates
				};

			const bidsToMatch = bids.filter(b => b.price >= bestAsk.price && b.balance > 0);
			const asksToMatch = asks.filter(a => a.price <= bestBid.price && a.balance > 0);

			let done = false;
			let bidIdx = 0;
			let askIdx = 0;
			while (!done) {
				const bid = bidsToMatch[bidIdx];
				const ask = asksToMatch[askIdx];
				const bidLiveOrder = liveOrders[bid.orderHash];
				if (!bidLiveOrder) {
					util.logDebug('missing live order for ' + bid.orderHash);
					bidIdx++;
					continue;
				}
				const askLiveOrder = liveOrders[ask.orderHash];
				if (!askLiveOrder) {
					util.logDebug('missing live order for ' + ask.orderHash);
					askIdx++;
					continue;
				}
				const matchBalance = Math.min(bid.balance, ask.balance);
				ordersToMatch.push({
					left: {
						orderHash: bid.orderHash,
						balance: bid.balance
					},
					right: {
						orderHash: ask.orderHash,
						balance: ask.balance
					}
				});
				if (bid.balance < ask.balance) bidIdx++;
				else if (bid.balance > ask.balance) askIdx++;
				else {
					bidIdx++;
					askIdx++;
				}

				bid.balance -= matchBalance;
				ask.balance -= matchBalance;
				bidLiveOrder.balance -= matchBalance;
				askLiveOrder.balance -= matchBalance;
				if (updatesRequired) {
					orderBookLevelUpdates.push({
						price: bid.price,
						change: -matchBalance,
						count: bid.balance > 0 ? 0 : -1,
						side: bidLiveOrder.side
					});
					orderBookLevelUpdates.push({
						price: ask.price,
						change: -matchBalance,
						count: ask.balance > 0 ? 0 : -1,
						side: askLiveOrder.side
					});
				}

				if (bidIdx >= bidsToMatch.length || askIdx >= asksToMatch.length) done = true;
			}
		}

		return {
			ordersToMatch,
			orderBookLevelUpdates
		};
	}

	public async matchOrders(
		web3Util: Web3Util,
		pair: string,
		ordersToMatch: IMatchingCandidate[]
	) {
		const balanceAftMatch: { [orderHash: string]: number } = {};
		const orderHashesToMatch: string[][] = [];
		const signedOrders: { [orderHash: string]: SignedOrder } = {};

		for (const orderToMatch of ordersToMatch) {
			const leftOrderHash = orderToMatch.left.orderHash;
			if (!signedOrders[leftOrderHash]) {
				const leftRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
					leftOrderHash
				);
				if (!leftRawOrder) {
					util.logError(`raw order of ${leftOrderHash} does not exist`);
					balanceAftMatch[leftOrderHash] = 0;
					continue;
				}
				signedOrders[leftOrderHash] = orderUtil.parseSignedOrder(
					leftRawOrder.signedOrder as IStringSignedOrder
				);
			}
			const rightOrderHash = orderToMatch.right.orderHash;
			if (!signedOrders[rightOrderHash]) {
				const rightRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
					rightOrderHash
				);

				if (!rightRawOrder) {
					util.logError(`raw order of ${rightOrderHash} does not exist`);
					balanceAftMatch[rightOrderHash] = 0;
					continue;
				}

				signedOrders[rightOrderHash] = orderUtil.parseSignedOrder(
					rightRawOrder.signedOrder as IStringSignedOrder
				);
			}

			balanceAftMatch[leftOrderHash] = Math.min(
				balanceAftMatch[leftOrderHash] || orderToMatch.left.balance,
				orderToMatch.left.balance
			);
			balanceAftMatch[rightOrderHash] = Math.min(
				balanceAftMatch[rightOrderHash] || orderToMatch.right.balance,
				orderToMatch.right.balance
			);
			orderHashesToMatch.push([leftOrderHash, rightOrderHash]);
		}

		for (const orderHash in balanceAftMatch) {
			const persistRequest = {
				method: CST.DB_UPDATE,
				pair: pair,
				orderHash: orderHash,
				balance: balanceAftMatch[orderHash],
				requestor: CST.DB_ORDER_MATCHER,
				status: CST.DB_MATCHING
			};
			await orderPersistenceUtil.persistOrder(persistRequest);
		}

		if (orderHashesToMatch.length > 0) {
			let currentNonce = await web3Util.getTransactionCount();
			const curretnGasPrice = await web3Util.getGasPrice();
			await Promise.all(
				orderHashesToMatch.map(orders =>
					web3Util
						.matchOrders(signedOrders[orders[0]], signedOrders[orders[1]], {
							gasPrice: new BigNumber(curretnGasPrice),
							gasLimit: 300000,
							nonce: currentNonce++,
							shouldValidate: true
						})
						.then(res => util.logDebug('matching result' + res))
						.catch(error => util.logDebug('matching error ' + JSON.stringify(error)))
				)
			);
		}
	}
}

const orderMatchingUtil = new OrderMatchingUtil();
export default orderMatchingUtil;
