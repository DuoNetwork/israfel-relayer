// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import WebSocket from 'ws';
import orderUtil from '../../../israfel-relayer/src/utils/orderUtil';
import Web3Util from '../../../israfel-relayer/src/utils/Web3Util';
import * as CST from '../common/constants';
import {
	ICreateOB,
	IOption,
	IOrderBookSnapshotLevel,
	IStringSignedOrder,
	IWsAddOrderRequest
} from '../common/types';
import util from '../utils/util';
import { ContractUtil } from './contractUtil';

export class OrderMakerUtil {
	public web3Util: Web3Util;
	public ws: WebSocket | null = null;
	public availableAddrs: string[] = [];
	public currentAddrIdx: number = 0;
	public contractUtil: ContractUtil;
	constructor(web3Util: Web3Util, contractUtil: ContractUtil) {
		this.web3Util = web3Util;
		this.contractUtil = contractUtil;
	}

	public getCurrentAddress() {
		const currentAddr = this.availableAddrs[this.currentAddrIdx];
		this.currentAddrIdx = (this.currentAddrIdx + 1) % this.availableAddrs.length;
		return currentAddr;
	}

	public async setAvailableAddrs(option: IOption) {
		if (!this.web3Util) {
			util.logDebug(`no web3Util initiated`);
			return;
		}
		const allAddrs = await this.web3Util.getAvailableAddresses();
		const idxs = CST.AVAILABLE_ADDR_IDX[option.type + '|' + option.tenor];
		this.availableAddrs = allAddrs.slice(idxs[0], idxs[1] + 1);
	}

	public setWs(ws: WebSocket) {
		this.ws = ws;
	}

	public async placeOrder(
		isBid: boolean,
		price: number,
		amount: number,
		pair: string
	): Promise<boolean> {
		console.log('############');
		console.log(this.web3Util);
		if (!this.web3Util) throw new Error('no web3Util initiated');
		if (!this.web3Util.isValidPair(pair)) throw new Error('invalid pair');
		const [code1, code2] = pair.split('|');
		const token1 = this.web3Util.getTokenByCode(code1);
		if (!token1) throw new Error('invalid pair');
		const address1 = token1.address;
		const address2 = this.web3Util.getTokenAddressFromCode(code2);

		const amountAfterFee = orderUtil.getAmountAfterFee(
			amount,
			price,
			token1.feeSchedules[code2],
			isBid
		);

		const expiry = Math.floor(util.getExpiryTimestamp(false) / 1000);

		if (!amountAfterFee.makerAssetAmount || !amountAfterFee.takerAssetAmount)
			throw new Error('invalid amount');

		const rawOrder = await this.web3Util.createRawOrder(
			pair,
			this.getCurrentAddress(),
			isBid ? address2 : address1,
			isBid ? address1 : address2,
			amountAfterFee.makerAssetAmount,
			amountAfterFee.takerAssetAmount,
			expiry
		);

		const res = await this.validateOrder(
			pair,
			rawOrder.orderHash,
			JSON.parse(JSON.stringify(rawOrder.signedOrder))
		);
		if (!res) throw new Error('validation not passed');

		console.log(rawOrder.signedOrder);

		const msg: IWsAddOrderRequest = {
			method: CST.DB_ADD,
			channel: CST.DB_ORDERS,
			pair: pair,
			orderHash: rawOrder.orderHash,
			order: rawOrder.signedOrder
		};
		if (!this.ws) {
			console.log('no client initiated');
			return false;
		}

		util.logInfo(
			'send add order request' +
				JSON.stringify({
					price: price,
					amount: amount,
					isBid: isBid
				})
		);
		this.ws.send(JSON.stringify(msg));
		return true;
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

	public async validateOrder(
		pair: string,
		rawOrderHash: string,
		stringSignedOrder: IStringSignedOrder
	): Promise<boolean> {
		if (!this.web3Util) {
			util.logInfo(`no web3Util initiated when validating signedOrder`);
			return false;
		}

		const token = this.web3Util.tokens.find(t => t.code === pair.split('|')[0]);
		if (!token) {
			util.logInfo(`no token can be found when validating signedOrder`);
			return false;
		}

		try {
			const orderHash = await orderUtil.validateOrder(
				this.web3Util,
				pair,
				token,
				stringSignedOrder
			);
			if (orderHash === rawOrderHash) {
				util.logDebug(`order ${rawOrderHash} valided,`);
				return true;
			} else {
				util.logDebug('invalid orderHash, ignore');
				return false;
			}
		} catch (error) {
			util.logError(error);
			return false;
		}
	}
}
