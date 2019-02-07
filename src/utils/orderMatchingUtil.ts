import { BigNumber, SignedOrder } from '0x.js';
import moment from 'moment';
import {
	Constants,
	ILiveOrder,
	IOrderBook,
	IOrderBookLevel,
	IOrderBookLevelUpdate,
	IStringSignedOrder,
	OrderUtil,
	Util,
	Web3Util
} from '../../../israfel-common/src';
import { IOrderMatchRequest } from '../common/types';
import orderPersistenceUtil from './orderPersistenceUtil';
import redisUtil from './redisUtil';
import tradePriceUtil from './tradePriceUtil';
class OrderMatchingUtil {
	public getMatchQueueKey() {
		return `${Constants.DB_MATCH}|${Constants.DB_QUEUE}`;
	}

	public queueMatchRequest(orderMatchRequest: IOrderMatchRequest) {
		// push request into queue
		redisUtil.push(this.getMatchQueueKey(), JSON.stringify(orderMatchRequest));
	}

	public findMatchingOrders(
		orderBook: IOrderBook,
		liveOrders: { [orderHash: string]: ILiveOrder },
		updatesRequired: boolean
	): {
		orderMatchRequests: IOrderMatchRequest[];
		orderBookLevelUpdates: IOrderBookLevelUpdate[];
	} {
		const { bids, asks } = orderBook;
		const orderMatchRequests: IOrderMatchRequest[] = [];
		const orderBookLevelUpdates: IOrderBookLevelUpdate[] = [];
		if (bids.length && asks.length) {
			const bestBid = bids.find(level => level.balance > 0);
			const bestAsk = asks.find(level => level.balance > 0);
			if (!bestBid || !bestAsk || bestAsk.price > bestBid.price)
				return {
					orderMatchRequests,
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
					Util.logDebug('missing live order for ' + bid.orderHash);
					bidIdx++;
					continue;
				}
				const askLiveOrder = liveOrders[ask.orderHash];

				if (!askLiveOrder) {
					Util.logDebug('missing live order for ' + ask.orderHash);
					askIdx++;
					continue;
				}
				const feeOnToken = bidLiveOrder.pair.startsWith(bidLiveOrder.feeAsset);
				const bidFillableBalance = feeOnToken ? bid.balance * bid.price : bid.balance;
				const askFillableBalance = feeOnToken ? ask.balance * ask.price : ask.balance;
				const matchingAmount = Math.min(bidFillableBalance, askFillableBalance);
				const bidMatchingAmount = feeOnToken ? matchingAmount / bid.price : matchingAmount;
				const askMatchingAmount = feeOnToken ? matchingAmount / ask.price : matchingAmount;
				if (bidFillableBalance < askFillableBalance) bidIdx++;
				else if (bidFillableBalance > askFillableBalance) askIdx++;
				else {
					bidIdx++;
					askIdx++;
				}
				bid.balance -= bidMatchingAmount;
				ask.balance -= askMatchingAmount;
				bidLiveOrder.balance -= bidMatchingAmount;
				bidLiveOrder.matching += bidMatchingAmount;
				askLiveOrder.balance -= askMatchingAmount;
				askLiveOrder.matching += askMatchingAmount;
				orderMatchRequests.push({
					pair: bidLiveOrder.pair,
					feeAsset: bidLiveOrder.feeAsset,
					bid: {
						orderHash: bidLiveOrder.orderHash,
						orderAmount: bidLiveOrder.amount,
						matchingAmount: bidMatchingAmount,
						price: bidLiveOrder.price,
						fee: (bidLiveOrder.fee * bidMatchingAmount) / bidLiveOrder.amount
					},
					ask: {
						orderHash: askLiveOrder.orderHash,
						orderAmount: askLiveOrder.amount,
						matchingAmount: askMatchingAmount,
						price: askLiveOrder.price,
						fee: (askLiveOrder.fee * askMatchingAmount) / askLiveOrder.amount
					},
					takerSide:
						bidLiveOrder.initialSequence > askLiveOrder.initialSequence
							? Constants.DB_BID
							: Constants.DB_ASK
				});
				if (updatesRequired) {
					orderBookLevelUpdates.push({
						price: bid.price,
						change: -bidMatchingAmount,
						count: bid.balance > 0 ? 0 : -1,
						side: bidLiveOrder.side
					});
					orderBookLevelUpdates.push({
						price: ask.price,
						change: -askMatchingAmount,
						count: ask.balance > 0 ? 0 : -1,
						side: askLiveOrder.side
					});
				}
			}
		}

		return {
			orderMatchRequests,
			orderBookLevelUpdates
		};
	}

	public async processMatchSuccess(
		web3Util: Web3Util,
		txHash: string,
		matchTimeStamp: number,
		matchRequest: IOrderMatchRequest,
		bidOrder: SignedOrder,
		askOrder: SignedOrder
	) {
		const { pair, bid, ask, takerSide } = matchRequest;
		const bidFilledTakerAmt = await web3Util.getFilledTakerAssetAmount(bid.orderHash);

		const bidFilledAmt = Number(
			bidFilledTakerAmt
				.div(bidOrder.takerAssetAmount)
				.mul(new BigNumber(bid.orderAmount))
				.valueOf()
		);

		// update order status
		Util.logDebug(`update bidOrder orderHash: ${bid.orderHash}, fill amount: ${bidFilledAmt}`);
		await orderPersistenceUtil.persistOrder({
			method: bidFilledAmt >= bid.orderAmount ? Constants.DB_TERMINATE : Constants.DB_UPDATE,
			pair: pair,
			orderHash: bid.orderHash,
			fill: bidFilledAmt,
			matching: -bid.matchingAmount,
			requestor: Constants.DB_ORDER_MATCHER,
			status: bidFilledAmt >= bid.orderAmount ? Constants.DB_FILL : Constants.DB_PFILL,
			transactionHash: txHash
		});

		const askFilledTakerAmt = await web3Util.getFilledTakerAssetAmount(ask.orderHash);

		const askFilledAmt = Number(
			askFilledTakerAmt
				.div(askOrder.takerAssetAmount)
				.mul(new BigNumber(ask.orderAmount))
				.valueOf()
		);

		Util.logDebug(`update askOrder orderHash: ${ask.orderHash}, fill amount: ${askFilledAmt}`);
		await orderPersistenceUtil.persistOrder({
			method: askFilledAmt >= ask.orderAmount ? Constants.DB_TERMINATE : Constants.DB_UPDATE,
			pair: pair,
			orderHash: ask.orderHash,
			fill: askFilledAmt,
			matching: -ask.matchingAmount,
			requestor: Constants.DB_ORDER_MATCHER,
			status: askFilledAmt >= ask.orderAmount ? Constants.DB_FILL : Constants.DB_PFILL,
			transactionHash: txHash
		});

		await tradePriceUtil.persistTrade(
			txHash,
			matchTimeStamp,
			matchRequest,
			(takerSide === Constants.DB_BID ? bidOrder : askOrder).makerAddress
		);
	}

	public async processMatchQueue(web3Util: Web3Util, currentAddr: string) {
		const reqString = await redisUtil.pop(this.getMatchQueueKey());
		if (!reqString) return false;
		const matchRequest: IOrderMatchRequest = JSON.parse(reqString);
		const { pair, feeAsset, bid, ask } = matchRequest;

		try {
			const bidRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
				pair,
				bid.orderHash
			);

			if (!bidRawOrder) {
				Util.logError(`raw order of ${bid.orderHash} does not exist, ignore match request`);
				return true;
			}

			const bidOrder = OrderUtil.parseSignedOrder(
				bidRawOrder.signedOrder as IStringSignedOrder
			);

			if (OrderUtil.isExpired(Number(bidOrder.expirationTimeSeconds.valueOf()) * 1000)) {
				Util.logError(`${bid.orderHash} already expired`);
				await orderPersistenceUtil.persistOrder({
					method: Constants.DB_TERMINATE,
					status: Constants.DB_TERMINATE,
					requestor: Constants.DB_ORDER_MATCHER,
					pair: pair,
					orderHash: bid.orderHash
				});
				return true;
			}

			const askRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
				pair,
				ask.orderHash
			);

			if (!askRawOrder) {
				Util.logError(`raw order of ${ask.orderHash} does not exist, ignore match request`);
				return true;
			}

			const askOrder = OrderUtil.parseSignedOrder(
				askRawOrder.signedOrder as IStringSignedOrder
			);

			if (OrderUtil.isExpired(Number(askOrder.expirationTimeSeconds.valueOf()) * 1000)) {
				Util.logError(`${ask.orderHash} already expired`);
				await orderPersistenceUtil.persistOrder({
					method: Constants.DB_TERMINATE,
					status: Constants.DB_TERMINATE,
					requestor: Constants.DB_ORDER_MATCHER,
					pair: pair,
					orderHash: ask.orderHash
				});
				return true;
			}

			Util.logDebug('using sender address ' + currentAddr);
			const currentNonce = await web3Util.getTransactionCount(currentAddr);
			const curretnGasPrice = Math.max(await web3Util.getGasPrice(), 5000000000);
			let txHash = '';
			let matchTimeStamp = 0;

			const feeOnToken = pair.startsWith(feeAsset);
			try {
				txHash = await web3Util.matchOrders(
					feeOnToken ? askOrder : bidOrder,
					feeOnToken ? bidOrder : askOrder,
					currentAddr,
					{
						gasPrice: new BigNumber(curretnGasPrice),
						gasLimit: 300000,
						nonce: currentNonce,
						shouldValidate: false
					}
				);
				matchTimeStamp = Number(moment.utc().valueOf());
			} catch (matchError) {
				Util.logDebug(JSON.stringify(matchError));
				Util.logError('error in sending match tx for ' + reqString);
				await orderPersistenceUtil.persistOrder({
					method: Constants.DB_TERMINATE,
					pair: pair,
					orderHash: bid.orderHash,
					requestor: Constants.DB_ORDER_MATCHER,
					status: Constants.DB_MATCHING
				});
				await orderPersistenceUtil.persistOrder({
					method: Constants.DB_TERMINATE,
					pair: pair,
					orderHash: ask.orderHash,
					requestor: Constants.DB_ORDER_MATCHER,
					status: Constants.DB_MATCHING
				});

				return true;
			}

			Util.logDebug(txHash + ' sent for ' + reqString + ', sending order update');
			await orderPersistenceUtil.persistOrder({
				method: Constants.DB_UPDATE,
				pair: pair,
				orderHash: bid.orderHash,
				matching: bid.matchingAmount,
				requestor: Constants.DB_ORDER_MATCHER,
				status: Constants.DB_MATCHING,
				transactionHash: txHash
			});
			await orderPersistenceUtil.persistOrder({
				method: Constants.DB_UPDATE,
				pair: pair,
				orderHash: ask.orderHash,
				matching: ask.matchingAmount,
				requestor: Constants.DB_ORDER_MATCHER,
				status: Constants.DB_MATCHING,
				transactionHash: txHash
			});

			web3Util
				.awaitTransactionSuccessAsync(txHash)
				.then(receipt => {
					Util.logDebug(
						`matchOrder successfully mined: txHash: ${
							receipt.transactionHash
						}, sender: ${receipt.from}`
					);
					return this.processMatchSuccess(
						web3Util,
						receipt.transactionHash,
						matchTimeStamp,
						matchRequest,
						bidOrder,
						askOrder
					);
				})
				.catch(async txError => {
					Util.logError(
						txHash + ' reverted ' + txError + ', move matching amount back to balance'
					);
					await orderPersistenceUtil.persistOrder({
						method: Constants.DB_UPDATE,
						pair: pair,
						orderHash: bid.orderHash,
						matching: -bid.matchingAmount,
						requestor: Constants.DB_ORDER_MATCHER,
						status: Constants.DB_MATCHING,
						transactionHash: txHash
					});
					await orderPersistenceUtil.persistOrder({
						method: Constants.DB_UPDATE,
						pair: pair,
						orderHash: ask.orderHash,
						matching: -ask.matchingAmount,
						requestor: Constants.DB_ORDER_MATCHER,
						status: Constants.DB_MATCHING,
						transactionHash: txHash
					});
				});

			return true;
		} catch (err) {
			Util.logError(`error in processing for ${reqString}`);
			Util.logError(err);
			redisUtil.putBack(this.getMatchQueueKey(), reqString);
			return false;
		}
	}
}

const orderMatchingUtil = new OrderMatchingUtil();
export default orderMatchingUtil;
