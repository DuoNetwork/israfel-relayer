// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import WebSocket from 'ws';
import orderBookUtil from '../../../israfel-relayer/src/utils/orderBookUtil';
import Web3Util from '../../../israfel-relayer/src/utils/Web3Util';
import * as CST from '../common/constants';
import {
	IAcceptedPrice,
	IOption,
	IOrderBookSnapshot,
	IOrderBookSnapshotLevel,
	IToken,
	IWsInfoResponse,
	IWsOrderBookResponse,
	IWsOrderBookUpdateResponse,
	IWsOrderHistoryRequest,
	IWsRequest,
	IWsResponse
} from '../common/types';
import util from '../utils/util';
import { ContractUtil } from './contractUtil';
import { OrderMakerUtil } from './orderMakerUtil';

export class MakeDepthUtil {
	public ws: WebSocket | null = null;
	public reconnectionNumber: number = 0;
	public latestVersionNumber: number = 0;
	public orderBookSnapshot: IOrderBookSnapshot | null = null;
	public tokens: IToken[] = [];

	public pair: string = '';
	public web3Util: Web3Util;
	public orderMakerUtil: OrderMakerUtil;
	public contractAddress: string = '';
	public contractType: string = '';
	public contractTenor: string = '';
	public tokenIndex: number = 0;
	public lastAcceptedPrice: IAcceptedPrice | null = null;
	private orderBookSubscribed: boolean = false;
	public orderSubscribed: boolean = false;
	public isMakingOrder: boolean = false;
	public isTokenSet: boolean = false;

	constructor(option: IOption, web3Util: Web3Util, orderMakerUtil: OrderMakerUtil) {
		this.pair = option.token + '|' + CST.TOKEN_WETH;
		this.web3Util = web3Util;
		this.orderMakerUtil = orderMakerUtil;
		this.contractType = option.type;
		this.contractTenor = option.tenor;
		if (option.token.toLowerCase().includes('b') || option.token.toLowerCase().includes('l'))
			this.tokenIndex = 1;
	}

	public connectToRelayer(option: IOption) {
		this.ws = new WebSocket(`wss://relayer.${option.env}.israfel.info:8080`);
		this.ws.onopen = () => {
			console.log('reconnect');
			this.reconnectionNumber = 0;
		};
		this.ws.onmessage = (m: any) => this.handleMessage(m.data.toString());
		this.ws.onerror = () => this.reconnect(option);
		this.ws.onclose = () => this.reconnect(option);
		if (this.orderMakerUtil) this.orderMakerUtil.setWs(this.ws);
	}

	public subscribeOrderBook(pair: string) {
		if (!this.ws) return;

		const msg: IWsRequest = {
			method: CST.WS_SUB,
			channel: CST.DB_ORDER_BOOKS,
			pair: pair
		};
		this.ws.send(JSON.stringify(msg));
	}

	public subscribeOrders(pair: string, address: string) {
		if (!this.ws) return;

		const msg: IWsOrderHistoryRequest = {
			method: CST.WS_SUB,
			channel: CST.DB_ORDERS,
			pair: pair,
			account: address
		};
		this.ws.send(JSON.stringify(msg));
	}

	private getSideTotalLiquidity(side: IOrderBookSnapshotLevel[]): number {
		return side.length
			? side
					.map(ask => ask.balance)
					.reduce((accumulator, currentValue) => accumulator + currentValue)
			: 0;
	}

	private getSideAmtToCreate(currentSideLevel: number, currentSideLiquidity: number): number {
		return currentSideLevel >= 3
			? 50 - currentSideLiquidity
			: currentSideLevel === 2
			? Math.max(50 - currentSideLiquidity, 20)
			: currentSideLevel === 1
			? Math.max(50 - currentSideLiquidity, 40)
			: 50;
	}

	public async handleOrderBookResponse(orderBookResponse: IWsResponse) {
		if (orderBookResponse.status !== CST.WS_OK) util.logDebug('orderBook error');
		else if (orderBookResponse.method === CST.DB_SNAPSHOT)
			if (
				(orderBookResponse as IWsOrderBookResponse).orderBookSnapshot.version <
				this.latestVersionNumber
			) {
				this.subscribeOrderBook(
					(orderBookResponse as IWsOrderBookResponse).orderBookSnapshot.pair
				);
				this.latestVersionNumber = (orderBookResponse as IWsOrderBookResponse).orderBookSnapshot.version;
			} else {
				this.orderBookSnapshot = (orderBookResponse as IWsOrderBookResponse).orderBookSnapshot;
				if (!this.isMakingOrder) {
					this.isMakingOrder = true;
					await this.startMakingOrders();
				}
			}
		else {
			this.latestVersionNumber = (orderBookResponse as IWsOrderBookUpdateResponse)
				.orderBookUpdate
				? (orderBookResponse as IWsOrderBookUpdateResponse).orderBookUpdate.version
				: 0;

			const obUpdate = (orderBookResponse as IWsOrderBookUpdateResponse).orderBookUpdate;

			if (this.orderBookSnapshot) {
				orderBookUtil.updateOrderBookSnapshot(this.orderBookSnapshot, obUpdate);
				if (
					!this.isMakingOrder &&
					(this.orderBookSnapshot.bids.length < CST.MIN_ORDER_BOOK_LEVELS ||
						this.orderBookSnapshot.asks.length < CST.MIN_ORDER_BOOK_LEVELS ||
						this.getSideTotalLiquidity(this.orderBookSnapshot.asks) <
							CST.MIN_SIDE_LIQUIDITY ||
						this.getSideTotalLiquidity(this.orderBookSnapshot.bids) <
							CST.MIN_SIDE_LIQUIDITY)
				) {
					this.isMakingOrder = true;
					await this.startMakingOrders();
				}
			} else util.logDebug(`update comes before snapshot`);
		}
	}

	public handleOrdesResponse(ordersResponse: any) {
		util.logDebug(
			`new order, method:  ${ordersResponse.method}, orderHash: ${ordersResponse.orderHas}`
		);
	}

	public async startMakingOrders() {
		util.logInfo(`start anlayzing new orderBookSnapshot`);
		if (!this.orderBookSnapshot || !this.lastAcceptedPrice) {
			util.logDebug(`no orderBookSnapshot or orderMakerUtil or lastAcceptedPrice, pls check`);
			return;
		}

		const expectedMidPrice = util.round(
			(this.tokenIndex === 0 ? this.lastAcceptedPrice.navA : this.lastAcceptedPrice.navB) /
				this.lastAcceptedPrice.price
		);

		util.logDebug(`expected midprice of pair ${this.pair} is ${expectedMidPrice}`);

		let bidAmountToCreate = 0;
		let askAmountToCreate = 0;
		let numOfBidOrdersToPlace = 0;
		let numOfAskOrdersToPlace = 0;
		let existingBidPrices = this.orderBookSnapshot.bids.map(bid => bid.price);
		let existingAskPrices = this.orderBookSnapshot.asks.map(ask => ask.price);
		let currentAskLevels = this.orderBookSnapshot.asks.length;
		let currentBidLevels = this.orderBookSnapshot.bids.length;

		if (!currentBidLevels && !currentAskLevels) {
			util.logDebug(`no bids and asks, need to create whole new orderBook`);
			askAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
			bidAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
			numOfBidOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;
			numOfAskOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;
		} else if (!currentBidLevels && currentAskLevels) {
			util.logInfo(`no bids ,have asks`);
			const bestAskPrice = this.orderBookSnapshot.asks[0].price;
			const totalLiquidity = this.getSideTotalLiquidity(this.orderBookSnapshot.asks);
			util.logDebug(
				`best ask price is ${bestAskPrice} with totalLiquilidty ${totalLiquidity}`
			);

			if (bestAskPrice > expectedMidPrice) {
				askAmountToCreate = CST.MIN_SIDE_LIQUIDITY - totalLiquidity;
				bidAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
				numOfBidOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;
				numOfAskOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS - currentAskLevels;
			} else if (bestAskPrice <= expectedMidPrice) {
				util.logDebug(`ask side liquidity not enough, take all and recreate orderBook`);
				// take one side
				await this.orderMakerUtil.takeOneSideOrders(
					this.pair,
					false,
					this.orderBookSnapshot.asks.filter(ask => ask.price <= expectedMidPrice)
				);

				bidAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
				numOfBidOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;

				currentAskLevels = this.orderBookSnapshot.asks.filter(
					ask => ask.price > expectedMidPrice
				).length;
				const totalAskLiquidity = this.getSideTotalLiquidity(
					this.orderBookSnapshot.asks.filter(ask => ask.price > expectedMidPrice)
				);
				askAmountToCreate = this.getSideAmtToCreate(currentAskLevels, totalAskLiquidity);
				numOfAskOrdersToPlace = Math.max(3 - currentAskLevels, 1);
				existingAskPrices = existingAskPrices.filter(price => price > expectedMidPrice);
			}
		} else if (!currentAskLevels && currentBidLevels) {
			util.logInfo(`no asks, have bids`);
			const bestBidPrice = this.orderBookSnapshot.bids[0].price;
			const totalLiquidity = this.getSideTotalLiquidity(this.orderBookSnapshot.bids);
			util.logDebug(
				`best bid price is ${bestBidPrice} with totalLiquilidty ${totalLiquidity}`
			);

			if (bestBidPrice < expectedMidPrice) {
				bidAmountToCreate = CST.MIN_SIDE_LIQUIDITY - totalLiquidity;
				askAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
				numOfBidOrdersToPlace = 3 - currentBidLevels;
				numOfAskOrdersToPlace = 3;
			} else if (bestBidPrice >= expectedMidPrice) {
				util.logDebug(`bid side liquidity not enough, take all and recreate orderBook`);
				// take all
				await this.orderMakerUtil.takeOneSideOrders(
					this.pair,
					true,
					this.orderBookSnapshot.bids.filter(bid => bid.price >= expectedMidPrice)
				);
				askAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
				numOfAskOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;

				currentBidLevels = this.orderBookSnapshot.bids.filter(
					bod => bod.price < expectedMidPrice
				).length;
				const totalBidLiquidity = this.getSideTotalLiquidity(
					this.orderBookSnapshot.bids.filter(bid => bid.price < expectedMidPrice)
				);

				bidAmountToCreate = this.getSideAmtToCreate(currentBidLevels, totalBidLiquidity);
				numOfBidOrdersToPlace = Math.max(3 - currentBidLevels, 1);
				existingBidPrices = existingBidPrices.filter(price => price < expectedMidPrice);
			}
		} else {
			util.logInfo(`have both asks and have bids`);
			const bestBidPrice = this.orderBookSnapshot.bids[0].price;
			const bestAskPrice = this.orderBookSnapshot.asks[0].price;
			let totalBidLiquidity = this.getSideTotalLiquidity(this.orderBookSnapshot.bids);
			let totalAskLiquidity = this.getSideTotalLiquidity(this.orderBookSnapshot.asks);
			if (expectedMidPrice > bestAskPrice) {
				await this.orderMakerUtil.takeOneSideOrders(
					this.pair,
					false,
					this.orderBookSnapshot.asks.filter(ask => ask.price <= expectedMidPrice)
				);

				currentAskLevels = this.orderBookSnapshot.asks.filter(
					ask => ask.price > expectedMidPrice
				).length;

				totalAskLiquidity = this.getSideTotalLiquidity(
					this.orderBookSnapshot.asks.filter(ask => ask.price > expectedMidPrice)
				);
				existingAskPrices = existingAskPrices.filter(price => price > expectedMidPrice);
			} else if (expectedMidPrice < bestBidPrice) {
				await this.orderMakerUtil.takeOneSideOrders(
					this.pair,
					true,
					this.orderBookSnapshot.bids.filter(bid => bid.price >= expectedMidPrice)
				);

				currentBidLevels = this.orderBookSnapshot.bids.filter(
					bid => bid.price < expectedMidPrice
				).length;
				totalBidLiquidity = this.getSideTotalLiquidity(
					this.orderBookSnapshot.bids.filter(bid => bid.price < expectedMidPrice)
				);
				existingBidPrices = existingBidPrices.filter(price => price < expectedMidPrice);
			}

			askAmountToCreate = this.getSideAmtToCreate(currentAskLevels, totalAskLiquidity);
			bidAmountToCreate = this.getSideAmtToCreate(currentBidLevels, totalBidLiquidity);
			numOfBidOrdersToPlace = Math.max(3 - currentBidLevels, 1);
			numOfAskOrdersToPlace = Math.max(3 - currentAskLevels, 1);
		}

		util.logInfo(`bidAmountToCreate: ${bidAmountToCreate} numOfBidOrdersToPlace: ${numOfBidOrdersToPlace}
		askAmountToCreate: ${askAmountToCreate} numOfAskOrdersToPlace: ${numOfAskOrdersToPlace}`);

		if (askAmountToCreate > 0 && numOfAskOrdersToPlace > 0)
			await this.orderMakerUtil.createOrderBookSide(
				this.pair,
				false,
				this.contractType,
				this.contractTenor,
				expectedMidPrice,
				askAmountToCreate,
				numOfAskOrdersToPlace,
				existingAskPrices
			);
		if (bidAmountToCreate > 0 && numOfBidOrdersToPlace)
			await this.orderMakerUtil.createOrderBookSide(
				this.pair,
				true,
				this.contractType,
				this.contractTenor,
				expectedMidPrice,
				bidAmountToCreate,
				numOfBidOrdersToPlace,
				existingBidPrices
			);
		this.isMakingOrder = false;
	}

	public handleInfoResonsde(info: IWsInfoResponse) {
		const { tokens, acceptedPrices } = info;
		if (!this.web3Util || !this.orderMakerUtil) {
			util.logDebug(`no web3Util initiated`);
			return;
		}
		this.web3Util.setTokens(tokens);
		this.isTokenSet = true;
		const token = tokens.find(t => t.code === this.pair.split('|')[0]);
		if (token) this.contractAddress = token.custodian;
		const newAcceptedPrice =
			acceptedPrices[this.contractAddress][acceptedPrices[this.contractAddress].length - 1];
		if (!this.lastAcceptedPrice) this.lastAcceptedPrice = newAcceptedPrice;
		else if (this.lastAcceptedPrice && newAcceptedPrice.price !== this.lastAcceptedPrice.price)
			this.lastAcceptedPrice = acceptedPrices[this.contractAddress].length
				? newAcceptedPrice
				: null;

		if (!this.orderBookSubscribed) {
			this.subscribeOrderBook(this.pair);
			this.orderBookSubscribed = true;
		}
		if (!this.orderSubscribed) {
			for (const address of this.orderMakerUtil.availableAddrs)
				this.subscribeOrders(this.pair, address);

			this.orderSubscribed = true;
		}
	}

	public handleMessage(message: string) {
		const res: IWsResponse = JSON.parse(message);
		if (res.method !== CST.WS_UNSUB)
			switch (res.channel) {
				case CST.DB_ORDER_BOOKS:
					this.handleOrderBookResponse(res);
					break;
				case CST.DB_ORDERS:
					this.handleOrdesResponse(res);
					break;
				case CST.WS_INFO:
					this.handleInfoResonsde(res as IWsInfoResponse);
					break;
				default:
					util.logDebug(`received msg from non intended channel`);
					break;
			}
	}

	private reconnect(option: IOption) {
		this.ws = null;
		if (this.reconnectionNumber < 6)
			setTimeout(() => {
				this.connectToRelayer(option);
				this.reconnectionNumber++;
			}, 5000);
		else util.logDebug('We have tried 6 times. Please try again later');
	}

	public async startMake(contractUtil: ContractUtil, option: IOption) {
		util.logInfo(`makeDepth for ${this.pair}`);
		await this.orderMakerUtil.setAvailableAddrs(option);
		util.logDebug(
			`avaialbel address are ${JSON.stringify(this.orderMakerUtil.availableAddrs)}`
		);

		await this.connectToRelayer(option);
		if (!this.ws) throw new Error('no ws client initied');
		// this.orderMakerUtil.setWs(this.ws);

		let waitNums = 0;
		while (!this.isTokenSet && waitNums < 6) {
			util.logDebug(`wait tokens to be set`);
			util.sleep(1000);
			waitNums++;
		}

		const availableAddrs = this.orderMakerUtil.availableAddrs;

		if (this.isTokenSet) {
			this.orderMakerUtil.availableAddrs = await contractUtil.checkBalance(
				this.pair,
				this.tokenIndex,
				availableAddrs
			);

			if (!this.orderMakerUtil.availableAddrs.length)
				throw new Error('no available accounts');
		} else throw new Error('tokens data have not been received, pls check relayer...');

		setInterval(
			() => contractUtil.checkBalance(this.pair, this.tokenIndex, availableAddrs),
			CST.ONE_MINUTE_MS * 20
		);
	}
}
