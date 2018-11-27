import { SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IStringSignedOrder,
	IToken,
	IUserOrder
} from '../common/types';
import util from './util';
import Web3Util from './Web3Util';

class OrderUtil {
	public constructUserOrder(
		liveOrder: ILiveOrder,
		type: string,
		status: string,
		updatedBy: string,
		processed: boolean
	): IUserOrder {
		return {
			...liveOrder,
			type: type,
			status: status,
			updatedBy: updatedBy,
			processed: processed
		};
	}

	public constructNewLiveOrder(
		signedOrder: IStringSignedOrder,
		token: IToken,
		pair: string,
		orderHash: string
	): ILiveOrder {
		const [code1, code2] = pair.split('|');
		const side = Web3Util.getSideFromSignedOrder(signedOrder, token);
		const isBid = side === CST.DB_BID;
		const totalTokenAmount = Web3Util.fromWei(
			isBid ? signedOrder.takerAssetAmount : signedOrder.makerAssetAmount
		);
		const totalBaseAmount = Web3Util.fromWei(
			isBid ? signedOrder.makerAssetAmount : signedOrder.takerAssetAmount
		);
		let amountNetOfFee = totalTokenAmount;
		const fee = token.fee[code2];
		let feeAmount = 0;
		let feeAsset = code1;
		let price = 0;
		if (isBid) {
			if (fee.asset === code2) {
				feeAsset = code2;
				feeAmount = Math.max((totalBaseAmount * fee.rate) / (1 + fee.rate), fee.minimum);
				price = totalTokenAmount / (totalBaseAmount - feeAmount);
			} else {
				feeAmount = Math.max((totalTokenAmount * fee.rate) / (1 - fee.rate), fee.minimum);
				amountNetOfFee = totalTokenAmount + feeAmount;
				price = amountNetOfFee / totalBaseAmount;
			}
			util.logDebug(
				`bid feeAsset ${feeAsset} fee ${feeAmount} amountNetOfFee ${amountNetOfFee} price ${price}`
			);
		} else {
			if (fee.asset === code2) {
				feeAsset = code2;
				feeAmount = Math.max((totalBaseAmount * fee.rate) / (1 - fee.rate), fee.minimum);
				price = totalTokenAmount / (totalBaseAmount - feeAmount);
			} else {
				feeAmount = Math.max((totalTokenAmount * fee.rate) / (1 + fee.rate), fee.minimum);
				amountNetOfFee = totalTokenAmount - feeAmount;
				price = amountNetOfFee / totalBaseAmount;
			}
			util.logDebug(
				`ask feeAsset ${feeAsset} fee ${feeAmount} amountNetOfFee ${amountNetOfFee} price ${price}`
			);
		}

		return {
			account: signedOrder.makerAddress,
			pair: pair,
			orderHash: orderHash,
			price: price,
			amount: amountNetOfFee,
			balance: amountNetOfFee,
			fill: 0,
			side: side,
			expiry: Number(signedOrder.expirationTimeSeconds) * 1000,
			fee: feeAmount,
			feeAsset: feeAsset,
			initialSequence: 0,
			currentSequence: 0,
			createdAt: util.getUTCNowTimestamp()
		};
	}

	public parseSignedOrder(order: IStringSignedOrder): SignedOrder {
		const {
			makerFee,
			takerFee,
			makerAssetAmount,
			takerAssetAmount,
			salt,
			expirationTimeSeconds,
			...rest
		} = order;
		return {
			...rest,
			makerFee: Web3Util.stringToBN(makerFee),
			takerFee: Web3Util.stringToBN(takerFee),
			makerAssetAmount: Web3Util.stringToBN(makerAssetAmount),
			takerAssetAmount: Web3Util.stringToBN(takerAssetAmount),
			salt: Web3Util.stringToBN(salt),
			expirationTimeSeconds: Web3Util.stringToBN(expirationTimeSeconds)
		};
	}
}
const orderUtil = new OrderUtil();
export default orderUtil;
