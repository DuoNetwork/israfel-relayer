import { assetDataUtils, SignedOrder } from '0x.js';
import moment from 'moment';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IMatchingOrderInput,
	IMatchingOrderResult,
	IStringSignedOrder
} from '../common/types';
import orderPersistenceUtil from './orderPersistenceUtil';
import orderUtil from './orderUtil';
// import redisUtil from './redisUtil';
import util from './util';
import Web3Util from './Web3Util';

class OrderMatchingUtil {
	public async matchOrders(
		web3Util: Web3Util,
		leftLiveOrder: ILiveOrder,
		rightLiveOrder: ILiveOrder
	): Promise<IMatchingOrderResult> {
		// const price = leftLiveOrder.price;
		// const pair = rightLiveOrder.pair;
		const isLeftOrderBid = leftLiveOrder.side === CST.DB_BID;
		util.logInfo(
			`start matching order ${leftLiveOrder.orderHash} with ${rightLiveOrder.orderHash}`
		);

		const obj: IMatchingOrderResult = {
			left: {
				orderHash: leftLiveOrder.orderHash,
				method: CST.DB_UPDATE,
				newBalance: leftLiveOrder.balance
			},
			right: {
				orderHash: rightLiveOrder.orderHash,
				method: CST.DB_UPDATE,
				newBalance: rightLiveOrder.balance
			}
		};

		if (rightLiveOrder.expiry - moment().valueOf() < 3 * 60 * 1000) {
			util.logDebug(
				`the order ${
					rightLiveOrder.orderHash
				} is expiring in 3 minutes, removing this order`
			);
			obj.right.newBalance = 0;
			obj.right.method = CST.DB_TERMINATE;
			return obj;
		}

		if (leftLiveOrder.expiry - moment().valueOf() < 3 * 60 * 1000) {
			util.logDebug(
				`the order ${leftLiveOrder.orderHash} is expiring in 3 minutes, removing this order`
			);
			obj.left.newBalance = 0;
			obj.left.method = CST.DB_TERMINATE;
			return obj;
		}

		const leftRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
			leftLiveOrder.orderHash
		);

		const rightRawOrder = await orderPersistenceUtil.getRawOrderInPersistence(
			rightLiveOrder.orderHash
		);

		if (!leftRawOrder || !rightRawOrder) {
			if (!leftRawOrder) {
				util.logError(
					`raw order of ${leftLiveOrder.orderHash}	rightLiveOrder.orderHash
						} does not exist`
				);
				obj.left.newBalance = 0;
				obj.left.method = CST.DB_TERMINATE;
			}
			if (!rightRawOrder) {
				util.logError(
					`raw order of ${rightLiveOrder.orderHash}	rightLiveOrder.orderHash
						} does not exist`
				);
				obj.right.newBalance = 0;
				obj.right.method = CST.DB_TERMINATE;
			}
			return obj;
		}
		const leftOrder: SignedOrder = orderUtil.parseSignedOrder(
			leftRawOrder.signedOrder as IStringSignedOrder
		);

		const rightOrder: SignedOrder = orderUtil.parseSignedOrder(
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

			obj.left.newBalance =
				leftLiveOrder.balance - Math.min(leftLiveOrder.balance, rightLiveOrder.balance);

			obj.right.newBalance =
				rightLiveOrder.balance - Math.min(leftLiveOrder.balance, rightLiveOrder.balance);
			return obj;
		} catch (err) {
			util.logError(JSON.stringify(err));
			util.logDebug('error in matching transaction');
			balances = await this.checkBalance(web3Util, orderInput, isLeftOrderBid);
			obj.left.newBalance = balances[0];
			obj.right.newBalance = balances[1];
			return obj;
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
			? Math.min(
					leftMakerBalance / leftLiveOrder.price,
					leftMakerAllowance / leftLiveOrder.price,
					leftLiveOrder.balance
			)
			: Math.min(leftMakerBalance, leftMakerAllowance, leftLiveOrder.balance);

		const rightTokenAddr = (await assetDataUtils.decodeAssetDataOrThrow(
			rightOrder.makerAssetData
		)).tokenAddress;
		const rightMakerBalance = Web3Util.fromWei(
			await web3Util.contractWrappers.erc20Token.getBalanceAsync(
				rightTokenAddr,
				rightOrder.makerAddress
			)
		);
		const rightMakerAllowance = Web3Util.fromWei(
			await web3Util.contractWrappers.erc20Token.getProxyAllowanceAsync(
				rightTokenAddr,
				rightOrder.makerAddress
			)
		);

		rightLiveOrder.balance = isLeftOrderBid
			? Math.min(rightMakerBalance, rightMakerAllowance, rightLiveOrder.balance)
			: Math.min(
					rightMakerBalance / rightLiveOrder.price,
					rightMakerAllowance / rightLiveOrder.price,
					rightLiveOrder.balance
			);

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
