import DualClassWrapper from '../../../duo-contract-wrapper/src/DualClassWrapper';
import Web3Wrapper from '../../../duo-contract-wrapper/src/Web3Wrapper';
import * as CST from '../common/constants';
import {
	IAccount,
	IDualClassStates,
	IOption,
	IOrderBookSnapshot,
	IOrderBookSnapshotLevel,
	IPrice,
	IToken,
	IUserOrder
} from '../common/types';
import orderBookUtil from '../utils/orderBookUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';
import RelayerClient from './RelayerClient';

class MarketMaker {
	public tokens: IToken[] = [];
	public liveBidOrders: IUserOrder[][] = [[], []];
	public liveAskOrders: IUserOrder[][] = [[], []];
	public makerAccount: IAccount = { address: '0x0', privateKey: '' };
	public custodianStates: IDualClassStates | null = null;
	public priceStep: number = 0.0001;
	public tokenBalances: number[] = [0, 0, 0];
	public pendingOrders: { [orderHash: string]: boolean } = {};
	public exchangePrices: { [source: string]: IPrice[] } = {};
	public isBeethoven = true;
	public isInitialized = false;
	public isSendingOrder = false;
	public isMaintainingBalance = false;
	public isMakingOrders = false;
	public lastMid: number[] = [0, 0];

	private isA(pair: string) {
		return pair.startsWith(this.tokens[0].code);
	}

	private getOtherPair(pair: string) {
		const isA = this.isA(pair);
		return this.tokens[isA ? 1 : 0].code + '|' + pair.split('|')[1];
	}

	public getEthPrice() {
		return this.exchangePrices[CST.API_KRAKEN] && this.exchangePrices[CST.API_KRAKEN].length
			? this.exchangePrices[CST.API_KRAKEN][0].close
			: 0;
	}

	public async checkAllowance(web3Util: Web3Util, dualClassWrapper: DualClassWrapper) {
		util.logDebug('start to check allowance');
		const address = this.makerAccount.address;
		for (const code of [CST.TOKEN_WETH, this.tokens[0].code, this.tokens[1].code])
			if (!(await web3Util.getTokenAllowance(code, address))) {
				util.logDebug(`${address} ${code} allowance is 0, approving`);
				const txHash = await web3Util.setUnlimitedTokenAllowance(code, address);
				await web3Util.awaitTransactionSuccessAsync(txHash);
			}

		const custodianAddress = dualClassWrapper.address;
		if (!(await web3Util.getTokenAllowance(CST.TOKEN_WETH, address, custodianAddress))) {
			util.logDebug(`${address} for custodian allowance is 0, approving`);
			const txHash = await web3Util.setUnlimitedTokenAllowance(
				CST.TOKEN_WETH,
				address,
				custodianAddress
			);
			await web3Util.awaitTransactionSuccessAsync(txHash);
		}
		util.logDebug('completed checking allowance');
	}

	public async maintainBalance(web3Util: Web3Util, dualClassWrapper: DualClassWrapper) {
		if (this.isMaintainingBalance) return;

		this.isMaintainingBalance = true;
		this.custodianStates = await dualClassWrapper.getStates();
		const { alpha, createCommRate, redeemCommRate } = this.custodianStates;
		let impliedWethBalance = this.tokenBalances[0];
		let wethShortfall = 0;
		let wethSurplus = 0;
		const tokensPerEth = DualClassWrapper.getTokensPerEth(this.custodianStates);
		let bTokenToCreate = 0;
		let bTokenToRedeem = 0;
		let ethAmountForCreation = 0;
		let ethAmountForRedemption = 0;
		if (
			this.tokenBalances[2] <= CST.MIN_TOKEN_BALANCE ||
			this.tokenBalances[1] <= CST.MIN_TOKEN_BALANCE * alpha
		) {
			const bTokenShortfall = Math.max(0, CST.TARGET_TOKEN_BALANCE - this.tokenBalances[2]);
			const aTokenShortfall = Math.max(
				0,
				CST.TARGET_TOKEN_BALANCE * alpha - this.tokenBalances[1]
			);
			bTokenToCreate = Math.max(aTokenShortfall / alpha, bTokenShortfall);
			ethAmountForCreation = bTokenToCreate / tokensPerEth[1] / (1 - createCommRate);
			impliedWethBalance -= ethAmountForCreation;
		}

		if (
			this.tokenBalances[2] >= CST.MAX_TOKEN_BALANCE &&
			this.tokenBalances[1] >= CST.MAX_TOKEN_BALANCE * alpha
		) {
			const bTokenSurplus = Math.max(0, this.tokenBalances[2] - CST.TARGET_TOKEN_BALANCE);
			const aTokenSurplus = Math.max(
				0,
				this.tokenBalances[1] - CST.TARGET_TOKEN_BALANCE * alpha
			);
			bTokenToRedeem = Math.min(aTokenSurplus / alpha, bTokenSurplus);
			ethAmountForRedemption = util.round(
				(bTokenToRedeem / tokensPerEth[1]) * (1 - redeemCommRate)
			);
			impliedWethBalance += ethAmountForRedemption;
		}

		if (impliedWethBalance > CST.MAX_WETH_BALANCE)
			wethSurplus = impliedWethBalance - CST.TARGET_WETH_BALANCE;
		else if (impliedWethBalance < CST.MIN_WETH_BALANCE)
			wethShortfall = CST.TARGET_WETH_BALANCE - impliedWethBalance;

		const gasPrice = Math.max(
			await web3Util.getGasPrice(),
			CST.DEFAULT_GAS_PRICE * Math.pow(10, 9)
		);

		if (wethShortfall) {
			util.logDebug(`transfer WETH shortfall of ${wethShortfall} from faucet`);
			const tx = await web3Util.tokenTransfer(
				CST.TOKEN_WETH,
				CST.FAUCET_ADDR,
				this.makerAccount.address,
				this.makerAccount.address,
				util.round(wethShortfall)
			);
			util.logDebug(`tx hash: ${tx}`);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[0] += wethShortfall;
		}

		if (bTokenToCreate) {
			util.logDebug(`create tokens from ${ethAmountForCreation} WETH`);
			const tx = await dualClassWrapper.createRaw(
				this.makerAccount.address,
				this.makerAccount.privateKey,
				gasPrice,
				CST.CREATE_GAS,
				util.round(ethAmountForCreation),
				web3Util.contractAddresses.etherToken
			);
			util.logDebug(`tx hash: ${tx}`);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[2] += bTokenToCreate;
			this.tokenBalances[1] += bTokenToCreate * alpha;
			this.tokenBalances[0] -= ethAmountForCreation;
		}

		if (bTokenToRedeem) {
			util.logDebug(`redeem ${ethAmountForRedemption} WETH from tokens`);
			let tx = await dualClassWrapper.redeemRaw(
				this.makerAccount.address,
				this.makerAccount.privateKey,
				util.round(bTokenToRedeem) * alpha,
				util.round(bTokenToRedeem),
				gasPrice,
				CST.REDEEM_GAS
			);
			util.logDebug(`tx hash: ${tx}`);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[2] -= bTokenToRedeem;
			this.tokenBalances[1] -= bTokenToRedeem * alpha;
			util.logDebug(`wrapping ether with amt ${ethAmountForRedemption}`);
			tx = await web3Util.wrapEther(ethAmountForRedemption, this.makerAccount.address);
			util.logDebug(`tx hash: ${tx}`);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[0] += ethAmountForRedemption;
		}

		if (wethSurplus) {
			util.logDebug(`transfer WETH surplus of ${wethSurplus} to faucet`);
			const tx = await web3Util.tokenTransfer(
				CST.TOKEN_WETH,
				this.makerAccount.address,
				CST.FAUCET_ADDR,
				this.makerAccount.address,
				util.round(wethSurplus)
			);
			util.logDebug(`tx hash: ${tx}`);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[0] -= wethSurplus;
		}
		this.isMaintainingBalance = false;
	}

	public canMakeOrder(relayerClient: RelayerClient, pair: string) {
		const otherPair = this.getOtherPair(pair);
		if (
			!relayerClient.orderBookSnapshots[pair] ||
			!relayerClient.orderBookSnapshots[otherPair]
		) {
			util.logDebug('waiting for the other orderbook');
			return false;
		}

		if (this.isSendingOrder || !util.isEmptyObject(this.pendingOrders)) {
			util.logDebug(`non empty pending updates ${Object.keys(this.pendingOrders)}`);
			return false;
		}

		return true;
	}

	public async makeOrders(
		relayerClient: RelayerClient,
		dualClassWrapper: DualClassWrapper,
		pair: string
	) {
		if (!this.canMakeOrder(relayerClient, pair) || this.isMakingOrders) return;

		this.isMakingOrders = true;
		const isA = this.isA(pair);
		const pariIndex = isA ? 0 : 1;
		const otherPairIndex = 1 - pariIndex;
		const otherPair = this.getOtherPair(pair);

		util.logDebug(`[${pair}] start making orders`);
		this.custodianStates = await dualClassWrapper.getStates();
		const alpha = this.custodianStates.alpha;
		const ethPrice = this.getEthPrice();
		const ethNavInEth = 1 / this.custodianStates.resetPrice;
		const navPrices = DualClassWrapper.calculateNav(
			this.custodianStates,
			this.isBeethoven,
			ethPrice,
			util.getUTCNowTimestamp()
		);
		const tokenNavInEth = navPrices[pariIndex] / ethPrice;
		util.logDebug(`[${pair}] ethPrice ${ethPrice} token nav ${navPrices[0]} ${navPrices[1]}`);
		util.logDebug(`[${pair}] eth nav in eth ${ethNavInEth} token nav in eth ${tokenNavInEth}`);
		const orderBookSnapshot = relayerClient.orderBookSnapshots[pair];
		const newMid = orderBookUtil.getOrderBookSnapshotMid(orderBookSnapshot);
		const newSpread = orderBookUtil.getOrderBookSnapshotSpread(orderBookSnapshot);
		const newBids = orderBookSnapshot.bids;

		const newAsks = orderBookSnapshot.asks;

		let bestBidPrice = newBids.length
			? newBids[0].price
			: newAsks.length
			? newAsks[0].price - this.priceStep
			: tokenNavInEth - this.priceStep;
		let bestAskPrice = newAsks.length
			? newAsks[0].price
			: newBids.length
			? newBids[0].price + this.priceStep
			: tokenNavInEth + this.priceStep;
		util.logDebug(`[${pair}] best bid ${bestBidPrice}, best ask ${bestAskPrice}`);

		if (this.lastMid[pariIndex] === 0 || newSpread <= 3 * this.priceStep) {
			if (newAsks.length < CST.MIN_ORDER_BOOK_LEVELS)
				await this.createOrderBookSide(
					relayerClient,
					pair,
					bestAskPrice,
					false,
					CST.MIN_ORDER_BOOK_LEVELS - newAsks.length
				);
			if (newBids.length < CST.MIN_ORDER_BOOK_LEVELS) {
				util.logDebug(JSON.stringify(newBids));
				util.logDebug(`[${pair}] bid for ${pair} has insufficient liquidity, make orders`);
				await this.createOrderBookSide(
					relayerClient,
					pair,
					bestBidPrice,
					true,
					CST.MIN_ORDER_BOOK_LEVELS - newBids.length
				);
			}
		} else if (newMid > this.lastMid[pariIndex]) {
			if (newAsks.length < CST.MIN_ORDER_BOOK_LEVELS)
				await this.createOrderBookSide(
					relayerClient,
					pair,
					bestAskPrice,
					false,
					CST.MIN_ORDER_BOOK_LEVELS - newAsks.length
				);

			const fixSpreadBestBidPrice = bestAskPrice - this.priceStep * 3;
			if (fixSpreadBestBidPrice > bestBidPrice) {
				bestBidPrice = fixSpreadBestBidPrice;
				await this.createOrderBookSide(relayerClient, pair, bestBidPrice, true, 1);
			}
		} else if (newMid < this.lastMid[pariIndex]) {
			if (newBids.length < CST.MIN_ORDER_BOOK_LEVELS) {
				util.logDebug(JSON.stringify(newBids));
				util.logDebug(`[${pair}] bid for ${pair} has insufficient liquidity, make orders`);
				await this.createOrderBookSide(
					relayerClient,
					pair,
					bestBidPrice,
					true,
					CST.MIN_ORDER_BOOK_LEVELS - newBids.length
				);
			}

			const fixSpreadBestAskPrice = this.priceStep * 3 + bestBidPrice;
			if (fixSpreadBestAskPrice < bestAskPrice) {
				bestAskPrice = fixSpreadBestAskPrice;
				await this.createOrderBookSide(relayerClient, pair, bestAskPrice, false, 1);
			}
		}

		const otherTokenNoArbBidPrice =
			(ethNavInEth * (1 + alpha) - (isA ? alpha : 1) * bestAskPrice) / (isA ? 1 : alpha);

		const otherTokenNoArbAskPrice =
			(ethNavInEth * (1 + alpha) - (isA ? alpha : 1) * bestBidPrice) / (isA ? 1 : alpha);
		const otherTokenOrderBook = relayerClient.orderBookSnapshots[otherPair];
		const otherTokenBestBid = otherTokenOrderBook.bids.length
			? otherTokenOrderBook.bids[0].price
			: 0;
		const otherTokenBestAsk = otherTokenOrderBook.asks.length
			? otherTokenOrderBook.asks[0].price
			: Number.MAX_VALUE;

		util.logDebug(
			`[${otherPair}] no arb bid ${otherTokenNoArbBidPrice} vs best bid ${otherTokenBestBid}`
		);
		util.logDebug(
			`[${otherPair}] no arb ask ${otherTokenNoArbAskPrice} vs best ask ${otherTokenBestAsk}`
		);
		const orderHashesToCancel: string[] = [];
		let bidsToTake: IOrderBookSnapshotLevel[] = [];
		let asksToTake: IOrderBookSnapshotLevel[] = [];
		if (otherTokenBestBid >= otherTokenNoArbAskPrice) {
			for (const liveOrder of this.liveBidOrders[otherPairIndex])
				if (liveOrder.price >= otherTokenNoArbAskPrice)
					orderHashesToCancel.push(liveOrder.orderHash);
			bidsToTake = otherTokenOrderBook.bids.filter(
				bid => bid.price >= otherTokenNoArbAskPrice
			);
		}

		if (otherTokenBestAsk <= otherTokenNoArbBidPrice) {
			for (const liveOrder of this.liveAskOrders[otherPairIndex])
				if (liveOrder.price <= otherTokenNoArbBidPrice)
					orderHashesToCancel.push(liveOrder.orderHash);
			asksToTake = otherTokenOrderBook.asks.filter(
				ask => ask.price <= otherTokenNoArbBidPrice
			);
		}

		if (orderHashesToCancel.length) {
			util.logDebug(`[${otherPair}] cancel arbitrage orders`);
			await this.cancelOrders(relayerClient, otherPair, orderHashesToCancel);
		}

		if (bidsToTake.length) {
			util.logDebug(`[${otherPair}] take arbitrage bids`);
			await this.takeOneSideOrders(relayerClient, otherPair, true, bidsToTake);
		}
		if (asksToTake.length) {
			util.logDebug(`[${otherPair}] take arbitrage asks`);
			await this.takeOneSideOrders(relayerClient, otherPair, false, asksToTake);
		}

		this.lastMid[pariIndex] = newMid;
		this.isMakingOrders = false;
	}

	public async takeOneSideOrders(
		relayerClient: RelayerClient,
		pair: string,
		isBid: boolean,
		orderBookSide: IOrderBookSnapshotLevel[]
	) {
		this.isSendingOrder = true;
		for (const orderLevel of orderBookSide) {
			util.logDebug(
				`${pair} taking an ${isBid ? 'bid' : 'ask'} order with price ${
					orderLevel.price
				} amount ${orderLevel.balance}`
			);
			if (!orderLevel.balance) continue;
			const orderHash = await relayerClient.addOrder(
				this.makerAccount.address,
				pair,
				orderLevel.price,
				orderLevel.balance,
				!isBid,
				util.getExpiryTimestamp(true)
			);
			this.pendingOrders[orderHash] = true;
			await util.sleep(1000);
		}
		this.isSendingOrder = false;
	}

	public async createOrderBookSide(
		relayerClient: RelayerClient,
		pair: string,
		bestPrice: number,
		isBid: boolean,
		level: number
	) {
		const precision = this.tokens[0].precisions[CST.TOKEN_WETH];
		this.isSendingOrder = true;
		for (let i = 0; i < level; i++) {
			const levelPrice = Number(
				util.formatFixedNumber(
					bestPrice +
						(isBid ? -1 : 1) * (i + CST.MIN_ORDER_BOOK_LEVELS - level) * this.priceStep,
					precision
				)
			);
			const orderHash = await relayerClient.addOrder(
				this.makerAccount.address,
				pair,
				levelPrice,
				20 + Number((Math.random() * 5).toFixed(1)),
				isBid,
				util.getExpiryTimestamp(true)
			);
			this.pendingOrders[orderHash] = true;
			await util.sleep(1000);
		}
		this.isSendingOrder = false;
	}

	public async createOrderBookFromNav(
		dualClassWrapper: DualClassWrapper,
		relayerClient: RelayerClient
	) {
		this.custodianStates = await dualClassWrapper.getStates();
		const ethPrice = this.getEthPrice();
		util.logDebug(`eth price ${ethPrice}`);
		const navPrices = DualClassWrapper.calculateNav(
			this.custodianStates,
			this.isBeethoven,
			ethPrice,
			util.getUTCNowTimestamp()
		);
		for (const index of [0, 1])
			for (const isBid of [true, false])
				await this.createOrderBookSide(
					relayerClient,
					this.tokens[index].code + '|' + CST.TOKEN_WETH,
					navPrices[index] / ethPrice + (isBid ? -1 : 1) * this.priceStep,
					isBid,
					CST.MIN_ORDER_BOOK_LEVELS
				);
	}

	public async handleOrderBookUpdate(
		dualClassWrapper: DualClassWrapper,
		relayerClient: RelayerClient,
		orderBookSnapshot: IOrderBookSnapshot
	) {
		const pair = orderBookSnapshot.pair;
		util.logDebug(`received orderBookUpdate ${pair} ${orderBookSnapshot.version}`);
		await this.makeOrders(relayerClient, dualClassWrapper, pair);
	}

	public async cancelOrders(relayerClient: RelayerClient, pair: string, orderHashes: string[]) {
		this.isSendingOrder = true;
		orderHashes.forEach(o => (this.pendingOrders[o] = true));
		const signature = await relayerClient.web3Util.web3PersonalSign(
			this.makerAccount.address,
			CST.TERMINATE_SIGN_MSG + orderHashes.join(',')
		);
		relayerClient.deleteOrder(pair, orderHashes, signature);
		this.isSendingOrder = false;
	}

	public async handleOrderHistory(
		relayerClient: RelayerClient,
		dualClassWrapper: DualClassWrapper,
		userOrders: IUserOrder[]
	) {
		util.logDebug('received order history');
		if (!this.isInitialized) {
			util.logDebug(`dualClassWrapper not initialized, stop handleOrderHistory`);
			return;
		}
		const processed: { [orderHash: string]: boolean } = {};
		userOrders.sort(
			(a, b) => a.pair.localeCompare(b.pair) || -a.currentSequence + b.currentSequence
		);
		const codes = this.tokens.map(token => token.code);
		userOrders.forEach(uo => {
			const { type, pair, side, orderHash, balance, price } = uo;
			if (processed[orderHash]) return;
			processed[orderHash] = true;
			if (type === CST.DB_TERMINATE) return;
			const index = this.isA(pair) ? 0 : 1;
			if (side === CST.DB_BID) this.liveBidOrders[index].push(uo);
			else this.liveAskOrders[index].push(uo);

			const code = pair.split('|')[0];
			if (codes.includes(code))
				if (side === CST.DB_BID) this.tokenBalances[0] -= balance * price;
				else this.tokenBalances[index + 1] -= balance;
		});

		util.logDebug('adjust available balance');
		for (const index of [0, 1]) {
			this.liveBidOrders[index].sort((a, b) => -a.price + b.price);
			this.liveAskOrders[index].sort((a, b) => a.price - b.price);
			const orderHashes = [
				...this.liveBidOrders[index].map(uo => uo.orderHash),
				...this.liveAskOrders[index].map(uo => uo.orderHash)
			];
			if (orderHashes.length) {
				util.logDebug('cancel existing orders');
				await this.cancelOrders(
					relayerClient,
					this.tokens[index].code + '|' + CST.TOKEN_WETH,
					orderHashes
				);
			}
		}

		util.logDebug('create order book from nav');
		await this.createOrderBookFromNav(dualClassWrapper, relayerClient);
		relayerClient.subscribeOrderBook(this.tokens[0].code + '|' + CST.TOKEN_WETH);
		relayerClient.subscribeOrderBook(this.tokens[1].code + '|' + CST.TOKEN_WETH);
	}

	public async handleUserOrder(
		userOrder: IUserOrder,
		relayerClient: RelayerClient,
		dualClassWrapper: DualClassWrapper
	) {
		const isBid = userOrder.side === CST.DB_BID;
		const { type, status, pair, orderHash, balance, price } = userOrder;
		util.logDebug(`received order update for ${pair} ${orderHash} ${type} ${status}`);
		if (this.pendingOrders[orderHash]) delete this.pendingOrders[orderHash];
		const index = this.isA(pair) ? 0 : 1;
		const orderCache = isBid ? this.liveBidOrders : this.liveAskOrders;
		const prevVersion = orderCache[index].find(uo => uo.orderHash === orderHash);
		if (type === CST.DB_TERMINATE && prevVersion) {
			// remove prev version;
			orderCache[index] = orderCache[index].filter(uo => uo.orderHash !== orderHash);
			if (isBid) this.tokenBalances[0] += prevVersion.balance * prevVersion.price;
			else this.tokenBalances[index + 1] += prevVersion.balance;
		} else if (type === CST.DB_ADD && !prevVersion) {
			orderCache[index].push(userOrder);
			orderCache[index].sort((a, b) => (isBid ? -a.price + b.price : a.price - b.price));
			if (isBid) this.tokenBalances[0] -= balance * price;
			else this.tokenBalances[index + 1] -= balance;
			// cancel far away orders
			if (orderCache[index].length > CST.MIN_ORDER_BOOK_LEVELS) {
				util.logDebug(pair + ' cancel orders too far away');
				const ordersToCancel = orderCache[index]
					.slice(CST.MIN_ORDER_BOOK_LEVELS)
					.map(o => o.orderHash);
				await this.cancelOrders(relayerClient, pair, ordersToCancel);
			}
		} else if (type === CST.DB_UPDATE && status !== CST.DB_MATCHING && prevVersion) {
			if (isBid) this.tokenBalances[0] -= (balance - prevVersion.balance) * price;
			else this.tokenBalances[index + 1] -= balance - prevVersion.balance;
			// override previous version;
			Object.assign(prevVersion, userOrder);
		}

		await this.maintainBalance(relayerClient.web3Util, dualClassWrapper);
		return this.makeOrders(relayerClient, dualClassWrapper, pair);
	}

	public handleOrderError(method: string, orderHash: string, error: string) {
		util.logError(method + ' ' + orderHash + ' ' + error);
		if (this.pendingOrders[orderHash]) delete this.pendingOrders[orderHash];
		// TODO: handle add and terminate error
	}

	public async initialize(relayerClient: RelayerClient, option: IOption) {
		util.logInfo('initializing dual class wrapper');
		this.isSendingOrder = false;
		this.isMaintainingBalance = false;
		this.isMakingOrders = false;
		const live = option.env === CST.DB_LIVE;
		const aToken = relayerClient.web3Util.getTokenByCode(option.token);
		if (!aToken) throw new Error('no aToken');
		const bToken = relayerClient.web3Util.tokens.find(
			t => t.code !== aToken.code && t.custodian === aToken.custodian
		);
		if (!bToken) throw new Error('no bToken');
		this.tokens = [aToken, bToken];
		this.priceStep = aToken.precisions[CST.TOKEN_WETH] * 20;
		let infura = {
			token: ''
		};
		try {
			infura = require('../keys/infura.json');
		} catch (error) {
			util.logError(`error in loading infura token: ${JSON.stringify(error)}`);
		}
		const infuraProvider =
			(live ? CST.PROVIDER_INFURA_MAIN : CST.PROVIDER_INFURA_KOVAN) + '/' + infura.token;
		const dualClassWrapper = new DualClassWrapper(
			new Web3Wrapper(null, 'source', infuraProvider, live),
			aToken.custodian
		);
		const address = this.makerAccount.address;
		util.logDebug(`updating balance for maker address ${address}`);
		this.tokenBalances = [
			await relayerClient.web3Util.getTokenBalance(CST.TOKEN_WETH, address),
			await relayerClient.web3Util.getTokenBalance(this.tokens[0].code, address),
			await relayerClient.web3Util.getTokenBalance(this.tokens[1].code, address)
		];
		util.logDebug('token balances: ' + JSON.stringify(this.tokenBalances));
		await this.checkAllowance(relayerClient.web3Util, dualClassWrapper);
		await this.maintainBalance(relayerClient.web3Util, dualClassWrapper);
		relayerClient.subscribeOrderHistory(this.makerAccount.address);
		return dualClassWrapper;
	}

	public connectToRelayer(relayerClient: RelayerClient, option: IOption) {
		let dualClassWrapper: DualClassWrapper | null = null;

		relayerClient.onInfoUpdate(async (tokens, status, acceptedPrices, exchangePrices) => {
			if (tokens && status && acceptedPrices && exchangePrices)
				this.exchangePrices = exchangePrices;
			if (!this.isInitialized) {
				this.isInitialized = true;
				dualClassWrapper = await this.initialize(relayerClient, option);
			}
		});

		relayerClient.onOrder(
			userOrders =>
				this.handleOrderHistory(
					relayerClient,
					dualClassWrapper as DualClassWrapper,
					userOrders
				),
			userOrder =>
				this.handleUserOrder(
					userOrder,
					relayerClient,
					dualClassWrapper as DualClassWrapper
				),
			(method, orderHash, error) => this.handleOrderError(method, orderHash, error)
		);
		relayerClient.onOrderBook(
			orderBookSnapshot =>
				this.handleOrderBookUpdate(
					dualClassWrapper as DualClassWrapper,
					relayerClient,
					orderBookSnapshot
				),
			(method, pair, error) => util.logError(method + ' ' + pair + ' ' + error)
		);

		relayerClient.onConnection(
			() => util.logDebug('connected'),
			() => {
				util.logDebug('reconnecting');
				dualClassWrapper = null;
				this.isInitialized = false;
			}
		);
		relayerClient.connectToRelayer();

		global.setInterval(() => {
			util.logInfo('hourly reinitialize');
			dualClassWrapper = null;
			this.isInitialized = false;
		}, 3600000);
	}

	public startProcessing(option: IOption) {
		util.logInfo(`starting bot for token ${option.token}`);
		const mnemonic = require('../keys/mnemomicBot.json');
		const live = option.env === CST.DB_LIVE;
		const web3Util = new Web3Util(null, live, mnemonic[option.token], false);
		this.makerAccount = Web3Util.getAccountFromMnemonic(mnemonic[option.token], 0);
		this.isBeethoven = option.token.startsWith('a');
		this.connectToRelayer(new RelayerClient(web3Util, option.env), option);
	}
}

const marketMaker = new MarketMaker();
export default marketMaker;
