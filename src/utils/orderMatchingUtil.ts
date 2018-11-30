import {BigNumber, SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import {
	IMatchingCandidate,
	IMatchState,
	IRawOrder,
	ISignedOrdersToMatch,
	IStringSignedOrder
} from '../common/types';
import orderPersistenceUtil from './orderPersistenceUtil';
import orderUtil from './orderUtil';
import util from './util';
import Web3Util from './Web3Util';

class OrderMatchingUtil {
	public async matchOrders(web3Util: Web3Util, ordersToMatch: IMatchingCandidate[]) {
		const balanceAftMatch: IMatchState = {};
		const signedOrdersToMatch: ISignedOrdersToMatch[] = [];

		for (const orderToMatch of ordersToMatch) {
			if (!balanceAftMatch[orderToMatch.left.orderHash])
				balanceAftMatch[orderToMatch.left.orderHash] = {
					balance: orderToMatch.left.balance,
					pair: orderToMatch.pair
				};
			else if (
				balanceAftMatch[orderToMatch.left.orderHash].balance > orderToMatch.left.balance
			)
				balanceAftMatch[orderToMatch.left.orderHash].balance = orderToMatch.left.balance;

			if (!balanceAftMatch[orderToMatch.right.orderHash])
				balanceAftMatch[orderToMatch.right.orderHash] = {
					balance: orderToMatch.right.balance,
					pair: orderToMatch.pair
				};
			else if (
				balanceAftMatch[orderToMatch.right.orderHash].balance > orderToMatch.right.balance
			)
				balanceAftMatch[orderToMatch.right.orderHash].balance = orderToMatch.right.balance;

			const leftRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
				orderToMatch.left.orderHash
			);
			const rightRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
				orderToMatch.right.orderHash
			);

			if (!leftRawOrder) {
				util.logError(
					`raw order of ${orderToMatch.left.orderHash}	rightLiveOrder.orderHash
						} does not exist`
				);
				balanceAftMatch[orderToMatch.left.orderHash].balance = 0;
			}
			if (!rightRawOrder) {
				util.logError(
					`raw order of ${orderToMatch.right.orderHash}	rightLiveOrder.orderHash
						} does not exist`
				);
				balanceAftMatch[orderToMatch.right.orderHash].balance = 0;
			}

			if (leftRawOrder && rightRawOrder) {
				const leftOrder: SignedOrder = orderUtil.parseSignedOrder(
					(leftRawOrder as IRawOrder).signedOrder as IStringSignedOrder
				);
				const rightOrder: SignedOrder = orderUtil.parseSignedOrder(
					(rightRawOrder as IRawOrder).signedOrder as IStringSignedOrder
				);
				signedOrdersToMatch.push({
					left: leftOrder,
					right: rightOrder
				});
			}
		}

		for (const orderHash of Object.keys(balanceAftMatch)) {
			const persistRequestLeft = {
				method: CST.DB_UPDATE,
				pair: balanceAftMatch[orderHash].pair,
				orderHash: orderHash,
				balance: balanceAftMatch[orderHash].balance,
				requestor: CST.DB_ORDER_MATCHER,
				status: balanceAftMatch[orderHash].balance > 0 ? CST.DB_PMATCHING : CST.DB_MATCHING
			};
			await orderPersistenceUtil.persistOrder(persistRequestLeft);
		}

		if (web3Util && signedOrdersToMatch.length > 0) {
			let currentNonce = await web3Util.getTransactionCount();
			const curretnGasPrice = await web3Util.getGasPrice();
			const promiseList = signedOrdersToMatch.map(orders =>
				web3Util.matchOrders(orders.left, orders.right, {
					gasPrice: new BigNumber(curretnGasPrice),
					gasLimit: 300000,
					nonce: currentNonce++,
					shouldValidate: true
				})
			);
			const resMatches = await Promise.all(promiseList);
			for (const res of resMatches) util.logDebug('matching result' + res);
		}
	}
}

const orderMatchingUtil = new OrderMatchingUtil();
export default orderMatchingUtil;
