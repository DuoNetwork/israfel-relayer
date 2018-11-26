import { assetDataUtils, SignedOrder } from '0x.js';
import moment from 'moment';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IMatchingOrderInput,
	IMatchingOrderResult,
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
		leftLiveOrder: ILiveOrder,
		rightLiveOrder: ILiveOrder
	): Promise<IMatchingOrderResult | null> {
		const price = leftLiveOrder.price;
		const pair = rightLiveOrder.pair;
		const isLeftOrderBid = leftLiveOrder.side === CST.DB_BID;
		util.logInfo(
			`start matching order ${leftLiveOrder.orderHash} with ${rightLiveOrder.orderHash}`
		);

		const obj: IMatchingOrderResult = {
			left: {
				orderHash: leftLiveOrder.orderHash,
				newBalance: leftLiveOrder.balance,
				sequence: await redisUtil.increment(`${CST.DB_SEQUENCE}|${pair}`)
			},
			right: {
				orderHash: rightLiveOrder.orderHash,
				newBalance: rightLiveOrder.balance,
				sequence: await redisUtil.increment(`${CST.DB_SEQUENCE}|${pair}`)
			}
		};

		if (rightLiveOrder.expiry - moment().valueOf() < 3 * 60 * 1000) {
			util.logDebug(
				`the order ${
					rightLiveOrder.orderHash
				} is expiring in 3 minutes, removing this order`
			);
			obj.right.newBalance = 0;
			return obj;
		}

		if (leftLiveOrder.expiry - moment().valueOf() < 3 * 60 * 1000) {
			util.logDebug(
				`the order ${leftLiveOrder.orderHash} is expiring in 3 minutes, removing this order`
			);
			obj.left.newBalance = 0;
			return obj;
		}

		if (
			(isLeftOrderBid && price < rightLiveOrder.price) ||
			(!isLeftOrderBid && price > rightLiveOrder.price)
		)
			return null;
		else {
			const leftRawOrder = (await dynamoUtil.getRawOrder(
				leftLiveOrder.orderHash
			)) as IRawOrder;
			const leftOrder: SignedOrder = orderPersistenceUtil.parseSignedOrder(
				leftRawOrder.signedOrder as IStringSignedOrder
			);

			const rightRawOrder = (await dynamoUtil.getRawOrder(
				rightLiveOrder.orderHash
			)) as IRawOrder;
			const rightOrder: SignedOrder = orderPersistenceUtil.parseSignedOrder(
				rightRawOrder.signedOrder as IStringSignedOrder
			);

			const orderInput = {
				left: {
					liveOrder: leftLiveOrder,
					signedOrder: leftOrder
				},
				right: {
					liveOrder: rightLiveOrder,
					signedOrder: rightOrder
				}
			};
			let balances = await this.checkBalance(web3Util, orderInput, isLeftOrderBid);
			if (balances[0] === 0) {
				util.logDebug(`leftOrder ${leftLiveOrder.orderHash} balance is 0`);
				obj.left.newBalance = 0;
				return obj;
			}

			if (balances[1] === 0) {
				util.logDebug(`leftOrder ${rightLiveOrder.orderHash} balance is 0`);
				obj.right.newBalance = 0;
				return obj;
			}

			try {
				await web3Util.contractWrappers.exchange.matchOrdersAsync(
					leftOrder,
					rightOrder,
					web3Util.relayerAddress
				);

				obj.left.newBalance = isLeftOrderBid
					? Math.min(leftLiveOrder.balance, rightLiveOrder.balance / rightLiveOrder.price)
					: Math.min(
							leftLiveOrder.balance,
							rightLiveOrder.balance * rightLiveOrder.price
					);

				obj.right.newBalance = isLeftOrderBid
					? Math.min(leftLiveOrder.balance * price, rightLiveOrder.balance)
					: Math.min(
							leftLiveOrder.balance / price,
							rightLiveOrder.balance * rightLiveOrder.price
					);

				return obj;
			} catch (err) {
				util.logError(err);
				util.logDebug('error in matching transaction');
				balances = await this.checkBalance(web3Util, orderInput, isLeftOrderBid);
				obj.left.newBalance = balances[0];
				obj.right.newBalance = balances[1];
				return obj;
			}
		}
	}

	public async checkBalance(
		web3Util: Web3Util,
		orderInput: IMatchingOrderInput,
		isLeftOrderBid: boolean
	): Promise<number[]> {
		//check balance and allowance
		const leftOrder = orderInput.left.signedOrder;
		const leftLiveOrder = orderInput.left.liveOrder;
		const rightOrder = orderInput.right.signedOrder;
		const rightLiveOrder = orderInput.right.liveOrder;
		const leftTokenAddr = (await assetDataUtils.decodeAssetDataOrThrow(
			leftOrder.makerAssetData
		)).tokenAddress;
		const leftMakerBalance = Web3Util.fromWei(
			await web3Util.contractWrappers.erc20Token.getBalanceAsync(
				leftTokenAddr,
				leftOrder.makerAddress
			)
		);
		const leftMakerAllowance = Web3Util.fromWei(
			await web3Util.contractWrappers.erc20Token.getProxyAllowanceAsync(
				leftTokenAddr,
				leftOrder.makerAddress
			)
		);

		leftLiveOrder.balance = isLeftOrderBid
			? Math.min(leftMakerBalance, leftMakerAllowance) / leftLiveOrder.price
			: Math.min(leftMakerBalance, leftMakerAllowance) * leftLiveOrder.price;

		const rightTokenAddr = (await assetDataUtils.decodeAssetDataOrThrow(
			rightOrder.makerAssetData
		)).tokenAddress;
		const rightMakerBalance = Web3Util.fromWei(
			await web3Util.contractWrappers.erc20Token.getBalanceAsync(
				rightTokenAddr,
				leftOrder.makerAddress
			)
		);
		const rightMakerAllowance = Web3Util.fromWei(
			await web3Util.contractWrappers.erc20Token.getProxyAllowanceAsync(
				rightTokenAddr,
				leftOrder.makerAddress
			)
		);

		rightLiveOrder.balance = isLeftOrderBid
			? Math.min(rightMakerBalance, rightMakerAllowance) * rightLiveOrder.price
			: Math.min(rightMakerBalance, rightMakerAllowance) / rightLiveOrder.price;

		return [leftLiveOrder.balance, rightLiveOrder.balance];
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
