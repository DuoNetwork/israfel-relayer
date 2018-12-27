// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import Web3Util from '../../../israfel-relayer/src/utils/Web3Util';
import * as CST from '../common/constants';
import {
	ICreateOB,
	IOption,
	IOrderBookSnapshotLevel,
} from '../common/types';
import util from '../utils/util';

export class OrderMakerUtil {
	public web3Util: Web3Util;
	constructor(web3Util: Web3Util) {
		this.web3Util = web3Util;
	}

	public async createDualTokenOrderBook(createOb: ICreateOB) {
		const {
			pair,
			isBid,
			contractTenor,
			midPrice,
			totalSize,
			numOfOrders,
			existingPriceLevel
		} = createOb;

		if (![CST.TENOR_PPT, CST.TENOR_M19].includes(contractTenor)) {
			util.logDebug('wrong contract tenor');
			return;
		}
		const amountPerLevel = totalSize / numOfOrders;

		util.logInfo(`start making side for  ${
			isBid ? 'bid' : 'ask'
		} with ${numOfOrders} orders, existing price level
	${existingPriceLevel.length > 0 ? existingPriceLevel.join(',') : ' 0 existing price level'}
		`);

		let i = 0;
		let createdOrder = 0;
		while (createdOrder < numOfOrders) {
			const bidPrice = util.round(midPrice - (i + 1) * CST.PRICE_STEP);
			const askPrice = util.round(midPrice + (i + 1) * CST.PRICE_STEP);
			const bidAmt = util.round(amountPerLevel + Math.random() * 10);
			const askAmt = util.round(amountPerLevel + Math.random() * 10);

			const price = isBid ? bidPrice : askPrice;
			if (!existingPriceLevel.includes(price)) {
				util.logInfo(
					`placing an ${isBid ? 'bid' : 'ask'} order, with price ${
						isBid ? bidPrice : askPrice
					} with amount ${isBid ? bidAmt : askAmt}`
				);
				if (await this.placeOrder(isBid, price, isBid ? bidAmt : askAmt, pair)) {
					createdOrder++;
					i++;
					util.sleep(1000);
					continue;
				} else {
					util.logInfo(`creating failure`);
					throw new Error('failed');
				}
			}
			i++;
		}
	}

	public async takeOneSideOrders(
		pair: string,
		isSideBid: boolean,
		orderBookSide: IOrderBookSnapshotLevel[]
	) {
		console.log('take one side');
		for (const orderLevel of orderBookSide) {
			util.logDebug(
				`taking an  ${isSideBid ? 'bid' : 'ask'} order with price ${
					orderLevel.price
				} amount ${orderLevel.balance}`
			);
			await this.placeOrder(!isSideBid, orderLevel.price, orderLevel.balance, pair);
			util.sleep(1000);
		}
	}

	public async createOrderBookSide(
		pair: string,
		isBid: boolean,
		contractType: string,
		contractTenor: string,
		midPrice: number,
		totalSize: number,
		numOfOrders: number,
		existingPriceLevel: number[]
	) {
		if (!this.contractUtil) {
			util.logDebug(`no contractUtil initiated`);
			return;
		}
		if (contractType === CST.BEETHOVEN || contractType === CST.MOZART)
			await this.createDualTokenOrderBook({
				pair,
				isBid,
				contractTenor,
				midPrice,
				totalSize,
				numOfOrders,
				existingPriceLevel
			});
		else util.logDebug(`incorrect contract type specified`);
	}
}
