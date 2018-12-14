import { BigNumber, SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IMatchingCandidate,
	IOrderBook,
	IOrderBookLevel,
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
		updatesRequired: boolean
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
					leftOrder: bidLiveOrder,
					rightOrder: askLiveOrder,
					matchingAmount: matchingAmount
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
		ordersToMatch: IMatchingCandidate[]
	) {
		const totalMatchingAmount: { [orderHash: string]: number } = {};
		const validOrdersToMatch: ILiveOrder[][] = [];
		const signedOrders: { [orderHash: string]: SignedOrder } = {};
		const missingSignedOrders: { [orderHash: string]: boolean } = {};
		const matchingStatus: { [orderHash: string]: boolean } = {};

		for (const orderToMatch of ordersToMatch) {
			const { leftOrder, rightOrder, matchingAmount } = orderToMatch;
			if (
				missingSignedOrders[leftOrder.orderHash] ||
				missingSignedOrders[rightOrder.orderHash]
			) {
				util.logDebug('ignore match with missing signed order');
				continue;
			}
			if (!signedOrders[leftOrder.orderHash]) {
				const leftRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
					pair,
					leftOrder.orderHash
				);
				if (!leftRawOrder) {
					util.logError(`raw order of ${leftOrder.orderHash} does not exist`);
					missingSignedOrders[leftOrder.orderHash] = true;
					continue;
				}
				signedOrders[leftOrder.orderHash] = orderUtil.parseSignedOrder(
					leftRawOrder.signedOrder as IStringSignedOrder
				);
			}
			if (!signedOrders[rightOrder.orderHash]) {
				const rightRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
					pair,
					rightOrder.orderHash
				);

				if (!rightRawOrder) {
					util.logError(`raw order of ${rightOrder.orderHash} does not exist`);
					missingSignedOrders[rightOrder.orderHash] = true;
					continue;
				}

				signedOrders[rightOrder.orderHash] = orderUtil.parseSignedOrder(
					rightRawOrder.signedOrder as IStringSignedOrder
				);
			}
			totalMatchingAmount[leftOrder.orderHash] =
				(totalMatchingAmount[leftOrder.orderHash] || 0) + matchingAmount;
			totalMatchingAmount[rightOrder.orderHash] =
				(totalMatchingAmount[rightOrder.orderHash] || 0) + matchingAmount;
			validOrdersToMatch.push([leftOrder, rightOrder]);
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
			const curretnGasPrice = await web3Util.getGasPrice();
			await Promise.all(
				validOrdersToMatch.map(orders => {
					const leftOrderHash = orders[0].orderHash;
					const rightOrderHash = orders[1].orderHash;
					return web3Util
						.matchOrders(signedOrders[rightOrderHash], signedOrders[leftOrderHash], {
							gasPrice: new BigNumber(curretnGasPrice),
							gasLimit: 300000,
							nonce: currentNonce++,
							shouldValidate: true
						})
						.then(res => {
							util.logDebug('matching result' + res);
							matchingStatus[leftOrderHash] = true;
							matchingStatus[rightOrderHash] = true;
						})
						.catch(error => {
							util.logDebug(
								'matching error ' +
									JSON.stringify(error) +
									' for ' +
									JSON.stringify(orders)
							);
							matchingStatus[leftOrderHash] =
								false || !!orders[0].fill || !!matchingStatus[leftOrderHash];
							matchingStatus[rightOrderHash] =
								false || !!orders[1].fill || !!matchingStatus[rightOrderHash];
						});
				})
			);
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
