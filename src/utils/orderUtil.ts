import { SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import { IFee, ILiveOrder, IStringSignedOrder, IToken, IUserOrder } from '../common/types';
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

	public getPriceBeforeFee(
		tokenAmountAfterFee: number,
		baseAmountAfterFee: number,
		fee: IFee,
		isBid: boolean
	) {
		let feeAmount = 0;
		let price = 0;
		let tokenAmountBeforeFee = tokenAmountAfterFee;
		let baseAmountBeforeFee = baseAmountAfterFee;
		if (isBid) {
			if (fee.asset) {
				feeAmount = Math.max((baseAmountAfterFee * fee.rate) / (1 + fee.rate), fee.minimum);
				baseAmountBeforeFee = baseAmountAfterFee - feeAmount;
			} else {
				feeAmount = Math.max(
					(tokenAmountAfterFee * fee.rate) / (1 - fee.rate),
					fee.minimum
				);
				tokenAmountBeforeFee = tokenAmountAfterFee + feeAmount;
			}
			price = tokenAmountBeforeFee / baseAmountBeforeFee;
		} else {
			if (fee.asset) {
				feeAmount = Math.max((baseAmountAfterFee * fee.rate) / (1 - fee.rate), fee.minimum);
				baseAmountBeforeFee = baseAmountAfterFee + feeAmount;
			} else {
				feeAmount = Math.max(
					(tokenAmountAfterFee * fee.rate) / (1 + fee.rate),
					fee.minimum
				);
				tokenAmountBeforeFee = tokenAmountAfterFee - feeAmount;
			}
			price = tokenAmountBeforeFee / baseAmountBeforeFee;
		}

		util.logDebug(
			`isBid ${isBid} feeAsset ${
				fee.asset
			} fee ${feeAmount} tokenAmountBeforeFee ${tokenAmountBeforeFee} baseAmountBeforeFee ${baseAmountBeforeFee} price ${price}`
		);

		return {
			price: price,
			amount: tokenAmountBeforeFee,
			feeAmount: feeAmount
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
		const tokenAmountAfterFee = Web3Util.fromWei(
			isBid ? signedOrder.takerAssetAmount : signedOrder.makerAssetAmount
		);
		const baseAmountAfterFee = Web3Util.fromWei(
			isBid ? signedOrder.makerAssetAmount : signedOrder.takerAssetAmount
		);
		const fee = token.fee[code2];
		const priceBeforeFee = this.getPriceBeforeFee(
			tokenAmountAfterFee,
			baseAmountAfterFee,
			fee,
			isBid
		);

		return {
			account: signedOrder.makerAddress,
			pair: pair,
			orderHash: orderHash,
			price: priceBeforeFee.price,
			amount: priceBeforeFee.amount,
			balance: priceBeforeFee.amount,
			fill: 0,
			side: side,
			expiry: Number(signedOrder.expirationTimeSeconds) * 1000,
			fee: priceBeforeFee.feeAmount,
			feeAsset: fee.asset || code1,
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
