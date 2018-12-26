// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import DualClassWrapper from '../../../duo-contract-wrapper/src/DualClassWrapper';
import Web3Wrapper from '../../../duo-contract-wrapper/src/Web3Wrapper';
import Web3Util from '../../../israfel-relayer/src/utils/Web3Util';
import * as CST from '../common/constants';
import {
	IAcceptedPrice,
	IAccounts,
	IOption,
	IOrderBookSnapshot,
	IToken,
	IUserOrder
} from '../common/types';
import orderBookUtil from '../utils/orderBookUtil';
import util from '../utils/util';
import { OrderMakerUtil } from './orderMakerUtil';
import RelayerClient from './RelayerClient';

class MarketMaker {
	private dualClassWrapper: DualClassWrapper | null = null;
	private relayerClient: RelayerClient | null = null;
	public orderBookSnapshot: IOrderBookSnapshot = {
		version: 0,
		pair: 'pair',
		bids: [],
		asks: []
	};
	public tokens: IToken[] = [];
	public pair: string = '';
	public orderMakerUtil: OrderMakerUtil | null = null;
	public contractAddress: string = '';
	public contractType: string = '';
	public contractTenor: string = '';
	public tokenIndex: number = 0;
	public acceptedPrices: IAcceptedPrice[] = [];
	public orderSubscribed: boolean = false;
	public isMakingOrder: boolean = false;
	public liveOrders: { [pair: string]: { [orderHash: string]: IUserOrder } } = {};

	// public async checkBalance(
	// 	web3Util: Web3Util,
	// 	dualClassWrapper: DualClassWrapper,
	// 	pair: string,
	// 	tokenIndex: number,
	// 	addresses: string[]
	// ): Promise<string[]> {
	// 	const [code1, code2] = pair.split('|');

	// 	for (const address of addresses) {
	// 		const faucetAccount: IAccounts = this.getMainAccount();
	// 		// ethBalance
	// 		const ethBalance = await web3Util.getEthBalance(address);
	// 		util.logInfo(`the ethBalance of ${address} is ${ethBalance}`);
	// 		if (ethBalance < CST.MIN_ETH_BALANCE) {
	// 			util.logDebug(
	// 				`the address ${address} current eth balance is ${ethBalance}, make transfer...`
	// 			);

	// 			await dualClassWrapper.web3Wrapper.ethTransferRaw(
	// 				faucetAccount.address,
	// 				faucetAccount.privateKey,
	// 				address,
	// 				util.round(CST.MIN_ETH_BALANCE),
	// 				await web3Util.getTransactionCount(faucetAccount.address)
	// 			);
	// 		}

	// 		// wEthBalance
	// 		const wEthBalance = await web3Util.getTokenBalance(code2, address);
	// 		if (wEthBalance < CST.MIN_WETH_BALANCE) {
	// 			util.logDebug(
	// 				`the address ${address} current weth balance is ${wEthBalance}, wrapping...`
	// 			);
	// 			const amtToWrap = CST.MIN_WETH_BALANCE - wEthBalance + 0.1;

	// 			if (ethBalance < amtToWrap)
	// 				await dualClassWrapper.web3Wrapper.ethTransferRaw(
	// 					faucetAccount.address,
	// 					faucetAccount.privateKey,
	// 					address,
	// 					CST.MIN_ETH_BALANCE,
	// 					await web3Util.getTransactionCount(faucetAccount.address)
	// 				);

	// 			util.logDebug(`start wrapping for ${address} with amt ${amtToWrap}`);
	// 			await web3Util.wrapEther(util.round(amtToWrap), address);
	// 		}

	// 		// wETHallowance
	// 		const wethAllowance = await web3Util.getProxyTokenAllowance(code2, address);
	// 		util.logDebug(`tokenAllowande of token ${code2} is ${wethAllowance}`);
	// 		if (wethAllowance <= 0) {
	// 			util.logDebug(
	// 				`the address ${address} token allowance of ${code2} is 0, approvaing.....`
	// 			);
	// 			await web3Util.setUnlimitedTokenAllowance(code2, address);
	// 		}

	// 		// tokenBalance
	// 		const tokenBalance = await web3Util.getTokenBalance(code1, address);
	// 		util.logDebug(`the ${code1} tokenBalance of ${address} is ${tokenBalance}`);
	// 		const accountsBot: IAccounts[] = require('../keys/accountsBot.json');
	// 		const account = accountsBot.find(a => a.address === address);
	// 		const gasPrice = Math.max(
	// 			await web3Util.getGasPrice(),
	// 			CST.DEFAULT_GAS_PRICE * Math.pow(10, 9)
	// 		);
	// 		if (tokenBalance < CST.MIN_TOKEN_BALANCE) {
	// 			util.logDebug(
	// 				`the address ${address} current token balance of ${code1} is ${tokenBalance}, need create more tokens...`
	// 			);

	// 			const tokenAmtToCreate = await estimateDualTokenCreateAmt(
	// 				ethBalance - CST.MIN_ETH_BALANCE - 0.1
	// 			);
	// 			if (tokenAmtToCreate[tokenIndex] + tokenBalance <= CST.MIN_TOKEN_BALANCE)
	// 				await dualClassWrapper.web3Wrapper.ethTransferRaw(
	// 					faucetAccount.address,
	// 					faucetAccount.privateKey,
	// 					address,
	// 					CST.MIN_ETH_BALANCE,
	// 					await web3Util.getTransactionCount(faucetAccount.address)
	// 				);

	// 			util.logDebug(`creating token ${code1}`);
	// 			if (account)
	// 				await dualClassWrapper.web3Wrapper.createRaw(
	// 					address,
	// 					account.privateKey,
	// 					gasPrice,
	// 					CST.CREATE_GAS,
	// 					CST.MIN_ETH_BALANCE
	// 				);
	// 			else {
	// 				util.logDebug(`the address ${address} cannot create, skip...`);
	// 				addresses = addresses.filter(addr => addr !== address);
	// 				continue;
	// 			}
	// 		} else if (tokenBalance >= CST.MAX_TOKEN_BALANCE) {
	// 			util.logDebug(
	// 				`the address ${address} current token balance of ${code1} is ${tokenBalance}, need redeem back...`
	// 			);
	// 			if (account) {
	// 				const states = await dualClassWrapper.getStates();
	// 				await dualClassWrapper.redeemRaw(
	// 					address,
	// 					account.privateKey,
	// 					tokenBalance - CST.MAX_TOKEN_BALANCE,
	// 					(tokenBalance - CST.MAX_TOKEN_BALANCE) / states.alpha,
	// 					gasPrice,
	// 					CST.REDEEM_GAS
	// 				);
	// 			}
	// 		}

	// 		const tokenAllowance = await web3Util.getProxyTokenAllowance(code1, address);
	// 		util.logInfo(`tokenAllowande of token ${code1} is ${tokenAllowance}`);
	// 		if (tokenAllowance <= 0) {
	// 			util.logInfo(
	// 				`the address ${address} token allowance of ${code1} is 0, approvaing.....`
	// 			);
	// 			await web3Util.setUnlimitedTokenAllowance(code1, address);
	// 		}
	// 	}

	// 	return addresses;
	// }

	// private getSideTotalLiquidity(side: IOrderBookSnapshotLevel[]): number {
	// 	return side.length
	// 		? side
	// 				.map(ask => ask.balance)
	// 				.reduce((accumulator, currentValue) => accumulator + currentValue)
	// 		: 0;
	// }

	// private getSideAmtToCreate(currentSideLevel: number, currentSideLiquidity: number): number {
	// 	return currentSideLevel >= 3
	// 		? 50 - currentSideLiquidity
	// 		: currentSideLevel === 2
	// 		? Math.max(50 - currentSideLiquidity, 20)
	// 		: currentSideLevel === 1
	// 		? Math.max(50 - currentSideLiquidity, 40)
	// 		: 50;
	// }

	// public async startMakingOrders() {
	// 	util.logInfo(`start anlayzing new orderBookSnapshot`);
	// 	if (!this.orderBookSnapshot || !this.lastAcceptedPrice) {
	// 		util.logDebug(`no orderBookSnapshot or orderMakerUtil or lastAcceptedPrice, pls check`);
	// 		return;
	// 	}

	// 	const expectedMidPrice = util.round(
	// 		(this.tokenIndex === 0 ? this.lastAcceptedPrice.navA : this.lastAcceptedPrice.navB) /
	// 			this.lastAcceptedPrice.price
	// 	);

	// 	util.logDebug(`expected midprice of pair ${this.pair} is ${expectedMidPrice}`);

	// 	let bidAmountToCreate = 0;
	// 	let askAmountToCreate = 0;
	// 	let numOfBidOrdersToPlace = 0;
	// 	let numOfAskOrdersToPlace = 0;
	// 	let existingBidPrices = this.orderBookSnapshot.bids.map(bid => bid.price);
	// 	let existingAskPrices = this.orderBookSnapshot.asks.map(ask => ask.price);
	// 	let currentAskLevels = this.orderBookSnapshot.asks.length;
	// 	let currentBidLevels = this.orderBookSnapshot.bids.length;

	// 	if (!currentBidLevels && !currentAskLevels) {
	// 		util.logDebug(`no bids and asks, need to create whole new orderBook`);
	// 		askAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
	// 		bidAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
	// 		numOfBidOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;
	// 		numOfAskOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;
	// 	} else if (!currentBidLevels && currentAskLevels) {
	// 		util.logInfo(`no bids ,have asks`);
	// 		const bestAskPrice = this.orderBookSnapshot.asks[0].price;
	// 		const totalLiquidity = this.getSideTotalLiquidity(this.orderBookSnapshot.asks);
	// 		util.logDebug(
	// 			`best ask price is ${bestAskPrice} with totalLiquilidty ${totalLiquidity}`
	// 		);

	// 		if (bestAskPrice > expectedMidPrice) {
	// 			askAmountToCreate = CST.MIN_SIDE_LIQUIDITY - totalLiquidity;
	// 			bidAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
	// 			numOfBidOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;
	// 			numOfAskOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS - currentAskLevels;
	// 		} else if (bestAskPrice <= expectedMidPrice) {
	// 			util.logDebug(`ask side liquidity not enough, take all and recreate orderBook`);
	// 			// take one side
	// 			await this.orderMakerUtil.takeOneSideOrders(
	// 				this.pair,
	// 				false,
	// 				this.orderBookSnapshot.asks.filter(ask => ask.price <= expectedMidPrice)
	// 			);

	// 			bidAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
	// 			numOfBidOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;

	// 			currentAskLevels = this.orderBookSnapshot.asks.filter(
	// 				ask => ask.price > expectedMidPrice
	// 			).length;
	// 			const totalAskLiquidity = this.getSideTotalLiquidity(
	// 				this.orderBookSnapshot.asks.filter(ask => ask.price > expectedMidPrice)
	// 			);
	// 			askAmountToCreate = this.getSideAmtToCreate(currentAskLevels, totalAskLiquidity);
	// 			numOfAskOrdersToPlace = Math.max(3 - currentAskLevels, 1);
	// 			existingAskPrices = existingAskPrices.filter(price => price > expectedMidPrice);
	// 		}
	// 	} else if (!currentAskLevels && currentBidLevels) {
	// 		util.logInfo(`no asks, have bids`);
	// 		const bestBidPrice = this.orderBookSnapshot.bids[0].price;
	// 		const totalLiquidity = this.getSideTotalLiquidity(this.orderBookSnapshot.bids);
	// 		util.logDebug(
	// 			`best bid price is ${bestBidPrice} with totalLiquilidty ${totalLiquidity}`
	// 		);

	// 		if (bestBidPrice < expectedMidPrice) {
	// 			bidAmountToCreate = CST.MIN_SIDE_LIQUIDITY - totalLiquidity;
	// 			askAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
	// 			numOfBidOrdersToPlace = 3 - currentBidLevels;
	// 			numOfAskOrdersToPlace = 3;
	// 		} else if (bestBidPrice >= expectedMidPrice) {
	// 			util.logDebug(`bid side liquidity not enough, take all and recreate orderBook`);
	// 			// take all
	// 			await this.orderMakerUtil.takeOneSideOrders(
	// 				this.pair,
	// 				true,
	// 				this.orderBookSnapshot.bids.filter(bid => bid.price >= expectedMidPrice)
	// 			);
	// 			askAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
	// 			numOfAskOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;

	// 			currentBidLevels = this.orderBookSnapshot.bids.filter(
	// 				bod => bod.price < expectedMidPrice
	// 			).length;
	// 			const totalBidLiquidity = this.getSideTotalLiquidity(
	// 				this.orderBookSnapshot.bids.filter(bid => bid.price < expectedMidPrice)
	// 			);

	// 			bidAmountToCreate = this.getSideAmtToCreate(currentBidLevels, totalBidLiquidity);
	// 			numOfBidOrdersToPlace = Math.max(3 - currentBidLevels, 1);
	// 			existingBidPrices = existingBidPrices.filter(price => price < expectedMidPrice);
	// 		}
	// 	} else {
	// 		util.logInfo(`have both asks and have bids`);
	// 		const bestBidPrice = this.orderBookSnapshot.bids[0].price;
	// 		const bestAskPrice = this.orderBookSnapshot.asks[0].price;
	// 		let totalBidLiquidity = this.getSideTotalLiquidity(this.orderBookSnapshot.bids);
	// 		let totalAskLiquidity = this.getSideTotalLiquidity(this.orderBookSnapshot.asks);
	// 		if (expectedMidPrice > bestAskPrice) {
	// 			await this.orderMakerUtil.takeOneSideOrders(
	// 				this.pair,
	// 				false,
	// 				this.orderBookSnapshot.asks.filter(ask => ask.price <= expectedMidPrice)
	// 			);

	// 			currentAskLevels = this.orderBookSnapshot.asks.filter(
	// 				ask => ask.price > expectedMidPrice
	// 			).length;

	// 			totalAskLiquidity = this.getSideTotalLiquidity(
	// 				this.orderBookSnapshot.asks.filter(ask => ask.price > expectedMidPrice)
	// 			);
	// 			existingAskPrices = existingAskPrices.filter(price => price > expectedMidPrice);
	// 		} else if (expectedMidPrice < bestBidPrice) {
	// 			await this.orderMakerUtil.takeOneSideOrders(
	// 				this.pair,
	// 				true,
	// 				this.orderBookSnapshot.bids.filter(bid => bid.price >= expectedMidPrice)
	// 			);

	// 			currentBidLevels = this.orderBookSnapshot.bids.filter(
	// 				bid => bid.price < expectedMidPrice
	// 			).length;
	// 			totalBidLiquidity = this.getSideTotalLiquidity(
	// 				this.orderBookSnapshot.bids.filter(bid => bid.price < expectedMidPrice)
	// 			);
	// 			existingBidPrices = existingBidPrices.filter(price => price < expectedMidPrice);
	// 		}

	// 		askAmountToCreate = this.getSideAmtToCreate(currentAskLevels, totalAskLiquidity);
	// 		bidAmountToCreate = this.getSideAmtToCreate(currentBidLevels, totalBidLiquidity);
	// 		numOfBidOrdersToPlace = Math.max(3 - currentBidLevels, 1);
	// 		numOfAskOrdersToPlace = Math.max(3 - currentAskLevels, 1);
	// 	}

	// 	util.logInfo(`bidAmountToCreate: ${bidAmountToCreate} numOfBidOrdersToPlace: ${numOfBidOrdersToPlace}
	// 	askAmountToCreate: ${askAmountToCreate} numOfAskOrdersToPlace: ${numOfAskOrdersToPlace}`);

	// 	if (askAmountToCreate > 0 && numOfAskOrdersToPlace > 0)
	// 		await this.orderMakerUtil.createOrderBookSide(
	// 			this.pair,
	// 			false,
	// 			this.contractType,
	// 			this.contractTenor,
	// 			expectedMidPrice,
	// 			askAmountToCreate,
	// 			numOfAskOrdersToPlace,
	// 			existingAskPrices
	// 		);
	// 	if (bidAmountToCreate > 0 && numOfBidOrdersToPlace)
	// 		await this.orderMakerUtil.createOrderBookSide(
	// 			this.pair,
	// 			true,
	// 			this.contractType,
	// 			this.contractTenor,
	// 			expectedMidPrice,
	// 			bidAmountToCreate,
	// 			numOfBidOrdersToPlace,
	// 			existingBidPrices
	// 		);
	// 	this.isMakingOrder = false;
	// }

	// private getMainAccount(): IAccounts {
	// 	const faucetAccount = require('../keys/faucetAccount.json');

	// 	return {
	// 		address: faucetAccount.publicKey,
	// 		privateKey: faucetAccount.privateKey
	// 	};
	// }

	public async startProcessing(option: IOption) {
		const mnemonic = require('../keys/mnemomicBot.json');
		const live = option.env === CST.DB_LIVE;
		this.relayerClient = new RelayerClient(
			new Web3Util(null, live, mnemonic.mnemomic, false),
			option.env
		);

		this.relayerClient.onInfoUpdate((tokens, status, acceptedPrices) => {
			if (!this.dualClassWrapper) {
				util.logDebug(JSON.stringify(status));
				const aToken = tokens.find(t => t.code === option.token);
				if (!aToken) return;
				const bToken = tokens.find(
					t => t.code !== aToken.code && t.custodian === aToken.custodian
				);
				if (!bToken) return;
				this.tokens = [aToken, bToken];
				let infura = {
					token: ''
				};
				try {
					infura = require('../keys/infura.json');
				} catch (error) {
					console.log(error);
				}
				const infuraProvider =
					(live ? CST.PROVIDER_INFURA_MAIN : CST.PROVIDER_INFURA_KOVAN) +
					'/' +
					infura.token;

				this.dualClassWrapper = new DualClassWrapper(
					new Web3Wrapper(null, 'source', infuraProvider, live),
					aToken.custodian
				);
			}

			this.acceptedPrices = acceptedPrices[this.dualClassWrapper.address] || [];
		});

		this.relayerClient.onOrder(
			userOrders => {
				const processed: { [orderHash: string]: boolean } = {};
				userOrders.sort(
					(a, b) => a.pair.localeCompare(b.pair) || -a.currentSequence + b.currentSequence
				);
				userOrders.forEach(uo => {
					if (processed[uo.orderHash]) return;
					processed[uo.orderHash] = true;
					if (uo.type === CST.DB_TERMINATE) return;
					if (!this.liveOrders[uo.pair]) this.liveOrders[uo.pair] = {};
					this.liveOrders[uo.pair][uo.orderHash] = uo;
				});
			},
			userOrder => {
				if (userOrder.type === CST.DB_TERMINATE)
					delete this.liveOrders[userOrder.pair][userOrder.orderHash];
				else this.liveOrders[userOrder.pair][userOrder.orderHash] = userOrder;
			},
			(method, orderHash, error) => util.logError(method + ' ' + orderHash + ' ' + error)
		);
		this.relayerClient.onOrderBook(
			orderBookSnapshot => (this.orderBookSnapshot = orderBookSnapshot),
			orderBookUpdate =>
				orderBookUtil.updateOrderBookSnapshot(this.orderBookSnapshot, orderBookUpdate),
			(method, pair, error) => util.logError(method + ' ' + pair + ' ' + error)
		);

		this.relayerClient.onConnection(
			() => util.logDebug('connected'),
			() => util.logDebug('reconnecting')
		);
		this.relayerClient.connectToRelayer();

		// const orderMakerUtil: OrderMakerUtil = new OrderMakerUtil(web3Util, contractUtil);
		// util.logInfo(`makeDepth for ${this.pair}`);
		// await this.orderMakerUtil.setAvailableAddrs(option);
		// util.logDebug(
		// 	`avaialbel address are ${JSON.stringify(this.orderMakerUtil.availableAddrs)}`
		// );

		// await this.connectToRelayer();
		// if (!this.ws) throw new Error('no ws client initied');

		// let waitNums = 0;
		// while (!this.isTokenSet && waitNums < 6) {
		// 	util.logDebug(`wait tokens to be set`);
		// 	util.sleep(1000);
		// 	waitNums++;
		// }

		// const availableAddrs = this.orderMakerUtil.availableAddrs;

		// if (this.isTokenSet) {
		// 	this.orderMakerUtil.availableAddrs = await contractUtil.checkBalance(
		// 		this.pair,
		// 		this.tokenIndex,
		// 		availableAddrs
		// 	);

		// 	if (!this.orderMakerUtil.availableAddrs.length)
		// 		throw new Error('no available accounts');
		// } else throw new Error('tokens data have not been received, pls check relayer...');

		// setInterval(
		// 	() => contractUtil.checkBalance(this.pair, this.tokenIndex, availableAddrs),
		// 	CST.ONE_MINUTE_MS * 20
		// );
	}
}

const marketMaker = new MarketMaker();
export default marketMaker;
