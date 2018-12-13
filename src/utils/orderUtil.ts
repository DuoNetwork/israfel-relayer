import { BigNumber, SignedOrder } from '0x.js';
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
			makerAssetAmount: isBid ? baseAmountAfterFee : tokenAmountAfterFee
		};
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
			matching: 0,
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

	public async validateOrder(
		web3Util: Web3Util,
		pair: string,
		token: IToken,
		stringSignedOrder: IStringSignedOrder
	) {
		const code2 = pair.split('|')[1];
		const deadline = util.getUTCNowTimestamp() + 180000;
		if (token.maturity && token.maturity <= deadline) return CST.WS_MATURED_TOKEN;
		const signedOrder = orderUtil.parseSignedOrder(stringSignedOrder);
		if (Number(signedOrder.expirationTimeSeconds) * 1000 <= deadline) return CST.WS_INVALID_EXP;
		const orderHash = await web3Util.validateOrder(signedOrder);
		if (!orderHash) return CST.WS_INVALID_ORDER;
		const liveOrder = this.constructNewLiveOrder(stringSignedOrder, token, pair, orderHash);
		if (
			Number(new BigNumber(liveOrder.amount).mod(new BigNumber(token.denomination)).valueOf())
		)
			return CST.WS_INVALID_AMT;
		if (
			Number(
				new BigNumber(liveOrder.price).mod(new BigNumber(token.precisions[code2])).valueOf()
			)
		)
			return CST.WS_INVALID_PX;

		return orderHash;
	}
}
const orderUtil = new OrderUtil();
export default orderUtil;
