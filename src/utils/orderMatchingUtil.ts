import { BigNumber, SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import { IMatchingCandidate, IStringSignedOrder } from '../common/types';
import orderPersistenceUtil from './orderPersistenceUtil';
import orderUtil from './orderUtil';
import util from './util';
import Web3Util from './Web3Util';

class OrderMatchingUtil {
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

		await Promise.all(
			Object.keys(balanceAftMatch).map(orderHash => {
				const persistRequest = {
					method: CST.DB_UPDATE,
					pair: pair,
					orderHash: orderHash,
					balance: balanceAftMatch[orderHash],
					requestor: CST.DB_ORDER_MATCHER,
					status: CST.DB_MATCHING
				};
				return orderPersistenceUtil.persistOrder(persistRequest);
			})
		);

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
						.catch(error => util.logDebug('matching error ' + error))
				)
			);
		}
	}
}

const orderMatchingUtil = new OrderMatchingUtil();
export default orderMatchingUtil;
