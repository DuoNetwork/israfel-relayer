import { BigNumber, SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOrderBook,
	IOrderBookLevel,
	IOrderBookLevelUpdate,
	IOrderMatchRequest,
	IStringSignedOrder
} from '../common/types';
import orderPersistenceUtil from './orderPersistenceUtil';
import orderUtil from './orderUtil';
import redisUtil from './redisUtil';
import util from './util';
import Web3Util from './Web3Util';

class OrderMatchingUtil {
	private getMatchQueueKey() {
		return `${CST.DB_MATCH}|${CST.DB_QUEUE}`;
	}

	private getMatchCacheMapKey() {
		return `${CST.DB_MATCH}|${CST.DB_CACHE}`;
	}

	public queueMatchRequest(orderMatchRequest: IOrderMatchRequest) {
		// push request into queue
		redisUtil.push(this.getMatchQueueKey(), JSON.stringify(orderMatchRequest));
	}

	public async persistPendingMatch(orderMatchRequest: IOrderMatchRequest) {
		if (!orderMatchRequest.transactionHash) return;

		return redisUtil.hashSet(
			this.getMatchCacheMapKey(),
			orderMatchRequest.transactionHash,
			JSON.stringify(orderMatchRequest)
		);
	}

	public async getAllPendingMatchRequests() {
		const allRequestStrings = await redisUtil.hashGetAll(this.getMatchCacheMapKey());
		const allRequests: { [txHash: string]: IOrderMatchRequest } = {};
		for (const txHash in allRequestStrings)
			allRequests[txHash] = JSON.parse(allRequestStrings[txHash]);

		return allRequests;
	}

	public findMatchingOrders(
		orderBook: IOrderBook,
		liveOrders: { [orderHash: string]: ILiveOrder },
		updatesRequired: boolean
	): {
		ordersToMatch: IOrderMatchRequest[];
		orderBookLevelUpdates: IOrderBookLevelUpdate[];
	} {
		const { bids, asks } = orderBook;
		const ordersToMatch: IOrderMatchRequest[] = [];
		const orderBookLevelUpdates: IOrderBookLevelUpdate[] = [];
		if (bids.length && asks.length) {
			const bestBid = bids.find(level => level.balance > 0);
			const bestAsk = asks.find(level => level.balance > 0);
			if (!bestBid || !bestAsk || bestAsk.price > bestBid.price)
				return {
					ordersToMatch,
					orderBookLevelUpdates
				};
			const bidsToMatch: IOrderBookLevel[] = [];
			const asksToMatch: IOrderBookLevel[] = [];
			// bids and asks are sorted so we can safely break
			for (const bid of bids) {
				if (bid.price < bestAsk.price) break;
				if (bid.balance > 0) bidsToMatch.push(bid);
			}
			for (const ask of asks) {
				if (ask.price > bestBid.price) break;
				if (ask.balance > 0) asksToMatch.push(ask);
			}

			let bidIdx = 0;
			let askIdx = 0;
			while (bidIdx < bidsToMatch.length && askIdx < asksToMatch.length) {
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
				const matchingAmount = Math.min(bid.balance, ask.balance);
				if (bid.balance < ask.balance) bidIdx++;
				else if (bid.balance > ask.balance) askIdx++;
				else {
					bidIdx++;
					askIdx++;
				}
				bid.balance -= matchingAmount;
				ask.balance -= matchingAmount;
				bidLiveOrder.balance -= matchingAmount;
				bidLiveOrder.matching += matchingAmount;
				askLiveOrder.balance -= matchingAmount;
				askLiveOrder.matching += matchingAmount;
				ordersToMatch.push({
					pair: bidLiveOrder.pair,
					leftOrderHash: bidLiveOrder.orderHash,
					rightOrderHash: askLiveOrder.orderHash,
					amount: matchingAmount
				});
				if (updatesRequired) {
					orderBookLevelUpdates.push({
						price: bid.price,
						change: -matchingAmount,
						count: bid.balance > 0 ? 0 : -1,
						side: bidLiveOrder.side
					});
					orderBookLevelUpdates.push({
						price: ask.price,
						change: -matchingAmount,
						count: ask.balance > 0 ? 0 : -1,
						side: askLiveOrder.side
					});
				}
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
		ordersToMatch: IOrderMatchRequest[],
		feeOnToken: boolean
	) {
		const totalMatchingAmount: { [orderHash: string]: number } = {};
		const validOrdersToMatch: string[][] = [];
		const signedOrders: { [orderHash: string]: SignedOrder } = {};
		const missingSignedOrders: { [orderHash: string]: boolean } = {};
		const matchingStatus: { [orderHash: string]: boolean } = {};

		for (const orderToMatch of ordersToMatch) {
			const { leftOrderHash, rightOrderHash, amount } = orderToMatch;
			if (missingSignedOrders[leftOrderHash] || missingSignedOrders[rightOrderHash]) {
				util.logDebug('ignore match with missing signed order');
				continue;
			}
			if (!signedOrders[leftOrderHash]) {
				const leftRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
					pair,
					leftOrderHash
				);
				if (!leftRawOrder) {
					util.logError(`raw order of ${leftOrderHash} does not exist`);
					missingSignedOrders[leftOrderHash] = true;
					continue;
				}
				signedOrders[leftOrderHash] = orderUtil.parseSignedOrder(
					leftRawOrder.signedOrder as IStringSignedOrder
				);
			}
			if (!signedOrders[rightOrderHash]) {
				const rightRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
					pair,
					rightOrderHash
				);

				if (!rightRawOrder) {
					util.logError(`raw order of ${rightOrderHash} does not exist`);
					missingSignedOrders[rightOrderHash] = true;
					continue;
				}

				signedOrders[rightOrderHash] = orderUtil.parseSignedOrder(
					rightRawOrder.signedOrder as IStringSignedOrder
				);
			}
			totalMatchingAmount[leftOrderHash] = (totalMatchingAmount[leftOrderHash] || 0) + amount;
			totalMatchingAmount[rightOrderHash] =
				(totalMatchingAmount[rightOrderHash] || 0) + amount;
			validOrdersToMatch.push([leftOrderHash, rightOrderHash]);
		}

		for (const orderHash in totalMatchingAmount)
			await orderPersistenceUtil.persistOrder({
				method: CST.DB_UPDATE,
				pair: pair,
				orderHash: orderHash,
				matching: totalMatchingAmount[orderHash],
				requestor: CST.DB_ORDER_MATCHER,
				status: CST.DB_MATCHING
			});

		if (validOrdersToMatch.length > 0) {
			let currentNonce = await web3Util.getTransactionCount();
			const curretnGasPrice = Math.max(await web3Util.getGasPrice(), 5000000000);

			for (const orders of validOrdersToMatch) {
				const leftOrderHash = orders[0];
				const rightOrderHash = orders[1];
				try {
					const txHash = await web3Util.matchOrders(
						signedOrders[feeOnToken ? rightOrderHash : leftOrderHash],
						signedOrders[feeOnToken ? leftOrderHash : rightOrderHash],
						{
							gasPrice: new BigNumber(curretnGasPrice),
							gasLimit: 300000,
							nonce: currentNonce,
							shouldValidate: true
						}
					);

					util.logDebug(`matching result for bidOrder ${
						feeOnToken ? leftOrderHash : rightOrderHash
					}
					and askOrder ${feeOnToken ? rightOrderHash : leftOrderHash} + txHash ${txHash}`);
					matchingStatus[leftOrderHash] = true;
					matchingStatus[rightOrderHash] = true;
					currentNonce++;
				} catch (err) {
					util.logDebug(
						`matching error for bidOrder ${feeOnToken ? leftOrderHash : rightOrderHash}
						and askOrder ${feeOnToken ? rightOrderHash : leftOrderHash}
						err is ${JSON.stringify(err)} with order details ${JSON.stringify(orders)}`
					);
					matchingStatus[leftOrderHash] = false || !!matchingStatus[leftOrderHash];
					matchingStatus[rightOrderHash] = false || !!matchingStatus[rightOrderHash];
				}
			}
		}

		for (const orderHash in matchingStatus)
			if (!matchingStatus[orderHash])
				await orderPersistenceUtil.persistOrder({
					method: CST.DB_TERMINATE,
					pair: pair,
					orderHash: orderHash,
					requestor: CST.DB_ORDER_MATCHER,
					status: CST.DB_MATCHING
				});
	}
}

const orderMatchingUtil = new OrderMatchingUtil();
export default orderMatchingUtil;
