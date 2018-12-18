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
				orderMatchRequests.push({
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
			orderMatchRequests,
			orderBookLevelUpdates
		};
	}

	public async processMatchQueue(web3Util: Web3Util) {
		const reqString = await redisUtil.pop(this.getMatchQueueKey());
		if (!reqString) return false;
		const matchRequest: IOrderMatchRequest = JSON.parse(reqString);
		const { pair, leftOrderHash, rightOrderHash, amount } = matchRequest;
		try {
			let feeOnToken = true;
			const [code1, code2] = pair.split('|');
			const token = web3Util.tokens.find(t => t.code === code1);
			if (token && token.feeSchedules[code2] && token.feeSchedules[code2].asset)
				feeOnToken = false;
			const leftRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
				pair,
				leftOrderHash
			);

			if (!leftRawOrder) {
				util.logError(`raw order of ${leftOrderHash} does not exist, ignore match request`);
				return true;
			}

			const rightRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
				pair,
				rightOrderHash
			);
			if (!rightRawOrder) {
				util.logError(
					`raw order of ${rightOrderHash} does not exist, ignore match request`
				);
				return true;
			}

			const leftOrder = orderUtil.parseSignedOrder(
				leftRawOrder.signedOrder as IStringSignedOrder
			);
			const rightOrder = orderUtil.parseSignedOrder(
				rightRawOrder.signedOrder as IStringSignedOrder
			);

			const currentAddr =  this.getCurrentAddress();
			util.logDebug('using sender address ' + currentAddr);
			const currentNonce = await web3Util.getTransactionCount(currentAddr);
			const curretnGasPrice = Math.max(await web3Util.getGasPrice(), 5000000000);
			let txHash = '';

			try {
				txHash = await web3Util.matchOrders(
					feeOnToken ? rightOrder : leftOrder,
					feeOnToken ? leftOrder : rightOrder,
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
					orderHash: leftOrderHash,
					requestor: CST.DB_ORDER_MATCHER,
					status: CST.DB_MATCHING
				});
				await orderPersistenceUtil.persistOrder({
					method: CST.DB_TERMINATE,
					pair: pair,
					orderHash: rightOrderHash,
					requestor: CST.DB_ORDER_MATCHER,
					status: CST.DB_MATCHING
				});

				return true;
			}

			util.logDebug(txHash + ' sent for ' + reqString + ', sending order update');
			await orderPersistenceUtil.persistOrder({
				method: CST.DB_UPDATE,
				pair: pair,
				orderHash: leftOrderHash,
				matching: amount,
				requestor: CST.DB_ORDER_MATCHER,
				status: CST.DB_MATCHING,
				transactionHash: txHash
			});
			await orderPersistenceUtil.persistOrder({
				method: CST.DB_UPDATE,
				pair: pair,
				orderHash: rightOrderHash,
				matching: amount,
				requestor: CST.DB_ORDER_MATCHER,
				status: CST.DB_MATCHING,
				transactionHash: txHash
			});

			web3Util
				.awaitTransactionSuccessAsync(txHash)
				.then(receipt =>
					util.logDebug('matchOrder successfully mined ' + JSON.stringify(receipt.blockHash))
				)
				.catch(async txError => {
					util.logError(
						txHash + ' reverted ' + txError + ', move matching amount back to balance'
					);
					await orderPersistenceUtil.persistOrder({
						method: CST.DB_UPDATE,
						pair: pair,
						orderHash: leftOrderHash,
						matching: -amount,
						requestor: CST.DB_ORDER_MATCHER,
						status: CST.DB_MATCHING,
						transactionHash: txHash
					});
					await orderPersistenceUtil.persistOrder({
						method: CST.DB_UPDATE,
						pair: pair,
						orderHash: rightOrderHash,
						matching: -amount,
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
		const web3Util = new Web3Util(null, option.live, mnemonic.mnemomic, false);
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
