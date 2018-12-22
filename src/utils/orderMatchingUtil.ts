import { BigNumber } from '0x.js';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOption,
	IOrderBook,
	IOrderBookLevel,
	IOrderBookLevelUpdate,
	IOrderMatchRequest,
	IStringSignedOrder
} from '../common/types';
import dynamoUtil from './dynamoUtil';
import orderPersistenceUtil from './orderPersistenceUtil';
import orderUtil from './orderUtil';
import redisUtil from './redisUtil';
import util from './util';
import Web3Util from './Web3Util';

class OrderMatchingUtil {
	public availableAddrs: string[] = [];
	public currentAddrIdx: number = 0;

	private getMatchQueueKey() {
		return `${CST.DB_MATCH}|${CST.DB_QUEUE}`;
	}

	public queueMatchRequest(orderMatchRequest: IOrderMatchRequest) {
		// push request into queue
		redisUtil.push(this.getMatchQueueKey(), JSON.stringify(orderMatchRequest));
	}

	public findMatchingOrders(
		orderBook: IOrderBook,
		liveOrders: { [orderHash: string]: ILiveOrder },
		feeOnToken: boolean,
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
					feeOnToken: feeOnToken,
					bid: {
						orderHash: bidLiveOrder.orderHash,
						orderAmount: bidLiveOrder.amount,
						matchingAmount: bidMatchingAmount
					},
					ask: {
						orderHash: askLiveOrder.orderHash,
						orderAmount: askLiveOrder.amount,
						matchingAmount: askMatchingAmount
					}
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

	public async processMatchQueue(web3Util: Web3Util) {
		const reqString = await redisUtil.pop(this.getMatchQueueKey());
		if (!reqString) return false;
		const matchRequest: IOrderMatchRequest = JSON.parse(reqString);
		const { pair, feeOnToken, bid, ask } = matchRequest;

		try {
			const bidRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
				pair,
				bid.orderHash
			);

			if (!bidRawOrder) {
				util.logError(`raw order of ${bidRawOrder} does not exist, ignore match request`);
				return true;
			}

			const askRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
				pair,
				ask.orderHash
			);

			if (!askRawOrder) {
				util.logError(
					`raw order of ${askRawOrder} does not exist, ignore match request`
				);
				return true;
			}

			const bidOrder = orderUtil.parseSignedOrder(
				bidRawOrder.signedOrder as IStringSignedOrder
			);

			const askOrder = orderUtil.parseSignedOrder(
				askRawOrder.signedOrder as IStringSignedOrder
			);

			const currentAddr = this.getCurrentAddress();
			util.logDebug('using sender address ' + currentAddr);
			const currentNonce = await web3Util.getTransactionCount(currentAddr);
			const curretnGasPrice = Math.max(await web3Util.getGasPrice(), 5000000000);
			let txHash = '';

			try {
				txHash = await web3Util.matchOrders(
					feeOnToken ? askOrder : bidOrder,
					feeOnToken ? bidOrder : askOrder,
					currentAddr,
					{
						gasPrice: new BigNumber(curretnGasPrice),
						gasLimit: 300000,
						nonce: currentNonce,
						shouldValidate: true
					}
				);
			} catch (matchError) {
				util.logDebug(JSON.stringify(matchError));
				util.logError('error in sending match tx for ' + reqString);
				await orderPersistenceUtil.persistOrder({
					method: CST.DB_TERMINATE,
					pair: pair,
					orderHash: bid.orderHash,
					requestor: CST.DB_ORDER_MATCHER,
					status: CST.DB_MATCHING
				});
				await orderPersistenceUtil.persistOrder({
					method: CST.DB_TERMINATE,
					pair: pair,
					orderHash: ask.orderHash,
					requestor: CST.DB_ORDER_MATCHER,
					status: CST.DB_MATCHING
				});

				return true;
			}

			util.logDebug(txHash + ' sent for ' + reqString + ', sending order update');
			await orderPersistenceUtil.persistOrder({
				method: CST.DB_UPDATE,
				pair: pair,
				orderHash: bid.orderHash,
				matching: bid.matchingAmount,
				requestor: CST.DB_ORDER_MATCHER,
				status: CST.DB_MATCHING,
				transactionHash: txHash
			});
			await orderPersistenceUtil.persistOrder({
				method: CST.DB_UPDATE,
				pair: pair,
				orderHash: ask.orderHash,
				matching: ask.matchingAmount,
				requestor: CST.DB_ORDER_MATCHER,
				status: CST.DB_MATCHING,
				transactionHash: txHash
			});

			web3Util
				.awaitTransactionSuccessAsync(txHash)
				.then(async receipt => {
					util.logDebug(
						`matchOrder successfully mined: txHash: ${receipt.blockHash}, sender: ${
							receipt.from
						}`
					);

					const bidFilledTakerAmt = await web3Util.getFilledTakerAssetAmount(
						bid.orderHash
					);

					const bidFilledAmt = Number(
						bidFilledTakerAmt
							.div(bidOrder.takerAssetAmount)
							.mul(new BigNumber(bid.orderAmount))
							.valueOf()
					);

					// update order status
					util.logDebug(
						`update bidOrder orderHash: ${bid.orderHash}, fill amount: ${bidFilledAmt}`
					);
					await orderPersistenceUtil.persistOrder({
						method: bidFilledAmt >= bid.orderAmount ? CST.DB_TERMINATE : CST.DB_UPDATE,
						pair: pair,
						orderHash: bid.orderHash,
						fill: bidFilledAmt,
						requestor: CST.DB_ORDER_MATCHER,
						status: bidFilledAmt >= bid.orderAmount ? CST.DB_FILL : CST.DB_PFILL,
						transactionHash: receipt.blockHash
					});

					const askFilledTakerAmt = await web3Util.getFilledTakerAssetAmount(
						ask.orderHash
					);

					const askFilledAmt = Number(
						askFilledTakerAmt
							.div(askOrder.takerAssetAmount)
							.mul(new BigNumber(ask.orderAmount))
							.valueOf()
					);

					util.logDebug(
						`update askOrder orderHash: ${ask.orderHash}, fill amount: ${askFilledAmt}`
					);
					await orderPersistenceUtil.persistOrder({
						method:
							askFilledAmt >= ask.orderAmount ? CST.DB_TERMINATE : CST.DB_UPDATE,
						pair: pair,
						orderHash: ask.orderHash,
						fill: askFilledAmt,
						requestor: CST.DB_ORDER_MATCHER,
						status: askFilledAmt >= ask.orderAmount ? CST.DB_FILL : CST.DB_PFILL,
						transactionHash: receipt.blockHash
					});
				})
				.catch(async txError => {
					util.logError(
						txHash + ' reverted ' + txError + ', move matching amount back to balance'
					);
					await orderPersistenceUtil.persistOrder({
						method: CST.DB_UPDATE,
						pair: pair,
						orderHash: bid.orderHash,
						matching: -bid.matchingAmount,
						requestor: CST.DB_ORDER_MATCHER,
						status: CST.DB_MATCHING,
						transactionHash: txHash
					});
					await orderPersistenceUtil.persistOrder({
						method: CST.DB_UPDATE,
						pair: pair,
						orderHash: ask.orderHash,
						matching: -ask.matchingAmount,
						requestor: CST.DB_ORDER_MATCHER,
						status: CST.DB_MATCHING,
						transactionHash: txHash
					});
				});

			return true;
		} catch (err) {
			util.logError(`error in processing for ${reqString}`);
			util.logError(err);
			redisUtil.putBack(this.getMatchQueueKey(), reqString);
			return false;
		}
	}

	public getCurrentAddress() {
		const currentAddr = this.availableAddrs[this.currentAddrIdx];
		this.currentAddrIdx = (this.currentAddrIdx + 1) % this.availableAddrs.length;
		return currentAddr;
	}

	public async startProcessing(option: IOption) {
		const mnemonic = require('../keys/mnemomic.json');
		const web3Util = new Web3Util(null, option.env === CST.DB_LIVE, mnemonic.mnemomic, false);
		this.availableAddrs = await web3Util.getAvailableAddresses();
		web3Util.setTokens(await dynamoUtil.scanTokens());

		if (option.server) {
			dynamoUtil.updateStatus(
				CST.DB_ORDER_MATCHER,
				await redisUtil.getQueueLength(this.getMatchQueueKey())
			);

			setInterval(
				async () =>
					dynamoUtil.updateStatus(
						CST.DB_ORDER_MATCHER,
						await redisUtil.getQueueLength(this.getMatchQueueKey())
					),
				15000
			);
		}

		const loop = () =>
			this.processMatchQueue(web3Util).then(result => {
				setTimeout(() => loop(), result ? 0 : 500);
			});
		loop();
	}
}

const orderMatchingUtil = new OrderMatchingUtil();
export default orderMatchingUtil;
