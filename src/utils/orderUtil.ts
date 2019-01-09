import { BigNumber, SignedOrder } from '0x.js';
import * as CST from '../common/constants';
import { IFeeSchedule, ILiveOrder, IStringSignedOrder, IToken, IUserOrder } from '../common/types';
import util from './util';
import Web3Util from './Web3Util';

class OrderUtil {
	public isExpired(expiryInMs: number) {
		return expiryInMs - CST.EXPIRY_MARGIN_MS <= util.getUTCNowTimestamp();
	}

	public constructUserOrder(
		liveOrder: ILiveOrder,
		type: string,
		status: string,
		updatedBy: string,
		processed: boolean,
		txHash?: string
	): IUserOrder {
		return {
			...liveOrder,
			type: type,
			status: status,
			updatedBy: updatedBy,
			processed: processed,
			transactionHash: txHash
		};
	}

	public getAmountAfterFee(
		tokenAmountBeforeFeeNum: number,
		priceBeforeFeeNum: number,
		feeSchedule: IFeeSchedule,
		isBid: boolean
	) {
		const tokenAmountBeforeFee = new BigNumber(util.round(tokenAmountBeforeFeeNum));
		let tokenAmountAfterFee = new BigNumber(tokenAmountBeforeFee);
		const baseAmountBeforeFee = tokenAmountAfterFee.mul(
			new BigNumber(util.round(priceBeforeFeeNum))
		);
		let baseAmountAfterFee = new BigNumber(baseAmountBeforeFee);
		const feeRateBN = new BigNumber(feeSchedule.rate);
		const feeMinBN = new BigNumber(feeSchedule.minimum);
		if (isBid)
			if (feeSchedule.asset)
				baseAmountAfterFee = baseAmountBeforeFee.add(
					BigNumber.max(baseAmountBeforeFee.mul(feeRateBN), feeMinBN)
				);
			else
				tokenAmountAfterFee = tokenAmountBeforeFee.sub(
					BigNumber.max(tokenAmountBeforeFee.mul(feeRateBN), feeMinBN)
				);
		else if (feeSchedule.asset)
			baseAmountAfterFee = baseAmountBeforeFee.sub(
				BigNumber.max(baseAmountBeforeFee.mul(feeRateBN), feeMinBN)
			);
		else
			tokenAmountAfterFee = tokenAmountBeforeFee.add(
				BigNumber.max(tokenAmountBeforeFee.mul(feeRateBN), feeMinBN)
			);

		return {
			takerAssetAmount: isBid ? tokenAmountAfterFee : baseAmountAfterFee,
			makerAssetAmount: isBid ? baseAmountAfterFee : tokenAmountAfterFee
		};
	}

	public getPriceBeforeFee(
		tokenAmountAfterFeeNum: number,
		baseAmountAfterFeeNum: number,
		feeSchedule: IFeeSchedule,
		isBid: boolean
	) {
		const tokenAmountAfterFee = new BigNumber(tokenAmountAfterFeeNum);
		const baseAmountAfterFee = new BigNumber(baseAmountAfterFeeNum);
		let feeAmount = new BigNumber(0);
		let price = new BigNumber(0);
		let tokenAmountBeforeFee = new BigNumber(tokenAmountAfterFee);
		let baseAmountBeforeFee = new BigNumber(baseAmountAfterFee);
		const feeRateBN = new BigNumber(feeSchedule.rate);
		const feeMinBN = new BigNumber(feeSchedule.minimum);
		if (isBid)
			if (feeSchedule.asset) {
				feeAmount = BigNumber.max(
					baseAmountAfterFee.mul(feeRateBN).div(feeRateBN.add(1)),
					feeMinBN
				);
				baseAmountBeforeFee = baseAmountAfterFee.sub(feeAmount);
			} else {
				feeAmount = BigNumber.max(
					tokenAmountAfterFee.mul(feeRateBN).div(new BigNumber(1).sub(feeRateBN)),
					feeMinBN
				);
				tokenAmountBeforeFee = tokenAmountAfterFee.add(feeAmount);
			}
		else if (feeSchedule.asset) {
			feeAmount = BigNumber.max(
				baseAmountAfterFee.mul(feeRateBN).div(new BigNumber(1).sub(feeRateBN)),
				feeMinBN
			);
			baseAmountBeforeFee = baseAmountAfterFee.add(feeAmount);
		} else {
			feeAmount = BigNumber.max(
				tokenAmountAfterFee.mul(feeRateBN).div(feeRateBN.add(1)),
				feeMinBN
			);
			tokenAmountBeforeFee = tokenAmountAfterFee.sub(feeAmount);
		}

		price = baseAmountBeforeFee.div(tokenAmountBeforeFee);

		util.logDebug(
			`isBid ${isBid} feeAsset ${
				feeSchedule.asset
			} fee ${feeAmount.valueOf()} tokenAmountBeforeFee ${tokenAmountBeforeFee.valueOf()} baseAmountBeforeFee ${baseAmountBeforeFee.valueOf()} price ${price.valueOf()}`
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
			price: Number(priceBeforeFee.price.valueOf()),
			amount: Number(priceBeforeFee.amount.valueOf()),
			balance: Number(priceBeforeFee.amount.valueOf()),
			matching: 0,
			fill: 0,
			side: side,
			expiry: Number(signedOrder.expirationTimeSeconds) * 1000,
			fee: Number(priceBeforeFee.feeAmount.valueOf()),
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
			Number(
				new BigNumber(util.round(liveOrder.amount))
					.mod(new BigNumber(token.denomination))
					.valueOf()
			)
		)
			return CST.WS_INVALID_AMT;
		if (
			Number(
				new BigNumber(util.round(liveOrder.price))
					.mod(new BigNumber(token.precisions[code2]))
					.valueOf()
			)
		)
			return CST.WS_INVALID_PX;

		const monthExpTime = Math.ceil(util.getExpiryTimestamp(true) / 1000);
		const dayExpTime = Math.ceil(util.getExpiryTimestamp(false) / 1000);
		if (
			Number(stringSignedOrder.expirationTimeSeconds) !== monthExpTime &&
			Number(stringSignedOrder.expirationTimeSeconds) !== dayExpTime
		)
			return CST.WS_INVALID_EXP;
		return orderHash;
	}
}
const orderUtil = new OrderUtil();
export default orderUtil;
