import { SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import { IFeeSchedule, ILiveOrder, IStringSignedOrder, IToken, IUserOrder } from '../common/types';
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

	public getFillBeforeFee(
		signedOrder: IStringSignedOrder,
		filledTakerAmount: number,
		token: IToken,
		pair: string
	) {
		const isBid = Web3Util.getSideFromSignedOrder(signedOrder, token) === CST.DB_BID;
		const tokenAfterFee = Web3Util.fromWei(
			isBid ? signedOrder.takerAssetAmount : signedOrder.makerAssetAmount
		);
		const baseAfterFee = Web3Util.fromWei(
			isBid ? signedOrder.makerAssetAmount : signedOrder.takerAssetAmount
		);
		const tokenFillAfterFee = isBid
			? filledTakerAmount
			: (filledTakerAmount / baseAfterFee) * tokenAfterFee;
		const originalLiveOrder = this.constructNewLiveOrder(signedOrder, token, pair, '');
		return (tokenFillAfterFee / tokenAfterFee) * originalLiveOrder.amount;
	}

	public getAmountAfterFee(
		tokenAmountBeforeFee: number,
		priceBeforeFee: number,
		feeSchedule: IFeeSchedule,
		isBid: boolean
	) {
		let tokenAmountAfterFee = tokenAmountBeforeFee;
		const baseAmountBeforeFee = tokenAmountBeforeFee * priceBeforeFee;
		let baseAmountAfterFee = baseAmountBeforeFee;
		if (isBid)
			if (feeSchedule.asset)
				baseAmountAfterFee += Math.max(
					baseAmountBeforeFee * feeSchedule.rate,
					feeSchedule.minimum
				);
			else
				tokenAmountAfterFee -= Math.max(
					tokenAmountBeforeFee * feeSchedule.rate,
					feeSchedule.minimum
				);
		else if (feeSchedule.asset)
			baseAmountAfterFee -= Math.max(
				baseAmountBeforeFee * feeSchedule.rate,
				feeSchedule.minimum
			);
		else
			tokenAmountAfterFee += Math.max(
				tokenAmountBeforeFee * feeSchedule.rate,
				feeSchedule.minimum
			);

		return {
			takerAssetAmount: isBid ? tokenAmountAfterFee : baseAmountAfterFee,
			makerAssetAmount: isBid ? baseAmountAfterFee : tokenAmountAfterFee,
		}
	}

	public getPriceBeforeFee(
		tokenAmountAfterFee: number,
		baseAmountAfterFee: number,
		feeSchedule: IFeeSchedule,
		isBid: boolean
	) {
		let feeAmount = 0;
		let price = 0;
		let tokenAmountBeforeFee = tokenAmountAfterFee;
		let baseAmountBeforeFee = baseAmountAfterFee;
		if (isBid)
			if (feeSchedule.asset) {
				feeAmount = Math.max(
					(baseAmountAfterFee * feeSchedule.rate) / (1 + feeSchedule.rate),
					feeSchedule.minimum
				);
				baseAmountBeforeFee = baseAmountAfterFee - feeAmount;
			} else {
				feeAmount = Math.max(
					(tokenAmountAfterFee * feeSchedule.rate) / (1 - feeSchedule.rate),
					feeSchedule.minimum
				);
				tokenAmountBeforeFee = tokenAmountAfterFee + feeAmount;
			}
		else if (feeSchedule.asset) {
			feeAmount = Math.max(
				(baseAmountAfterFee * feeSchedule.rate) / (1 - feeSchedule.rate),
				feeSchedule.minimum
			);
			baseAmountBeforeFee = baseAmountAfterFee + feeAmount;
		} else {
			feeAmount = Math.max(
				(tokenAmountAfterFee * feeSchedule.rate) / (1 + feeSchedule.rate),
				feeSchedule.minimum
			);
			tokenAmountBeforeFee = tokenAmountAfterFee - feeAmount;
		}

		price = baseAmountBeforeFee / tokenAmountBeforeFee;

		util.logDebug(
			`isBid ${isBid} feeAsset ${
				feeSchedule.asset
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
		const feeSchedule = token.feeSchedules[code2];
		const priceBeforeFee = this.getPriceBeforeFee(
			tokenAmountAfterFee,
			baseAmountAfterFee,
			feeSchedule,
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
			feeAsset: feeSchedule.asset || code1,
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
