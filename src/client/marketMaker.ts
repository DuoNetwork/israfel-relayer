import DualClassWrapper from '../../../duo-contract-wrapper/src/DualClassWrapper';
import Web3Wrapper from '../../../duo-contract-wrapper/src/Web3Wrapper';
import * as CST from '../common/constants';
import {
	IAccount,
	IDualClassStates,
	IOption,
	IOrderBookSnapshot,
	IOrderBookSnapshotLevel,
	IToken,
	IUserOrder
} from '../common/types';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';
import RelayerClient from './RelayerClient';

class MarketMaker {
	public tokens: IToken[] = [];
	public liveBidOrders: IUserOrder[][] = [[], []];
	public liveAskOrders: IUserOrder[][] = [[], []];
	public makerAccount: IAccount = { address: '0x0', privateKey: '' };
	public custodianStates: IDualClassStates | null = null;
	public priceStep: number = 0.0005;
	public tokenBalances: number[] = [0, 0, 0];
	public pendingOrders: { [orderHash: string]: boolean } = {};

	private isA(pair: string) {
		return this.tokens[0].code === pair.split('|')[0];
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
		util.logDebug('start balance maintenance');
		this.custodianStates = await dualClassWrapper.getStates();
		const alpha = this.custodianStates.alpha;
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
			ethAmountForCreation =
				bTokenToCreate / tokensPerEth[1] / (1 - this.custodianStates.createCommRate);
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
			ethAmountForRedemption =
				(bTokenToRedeem / tokensPerEth[1]) * (1 - this.custodianStates.createCommRate);
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
				wethShortfall
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
				ethAmountForCreation,
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
				bTokenToRedeem * alpha,
				bTokenToRedeem,
				gasPrice,
				CST.CREATE_GAS
			);
			util.logDebug(`tx hash: ${tx}`);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[2] -= bTokenToCreate;
			this.tokenBalances[1] -= bTokenToCreate * alpha;
			util.logDebug(`wrapping ether`);
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
				wethSurplus
			);
			util.logDebug(`tx hash: ${tx}`);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[0] -= wethSurplus;
		}
		util.logDebug('completed balance maintenance');
	}

	public getSideTotalLiquidity(side: IOrderBookSnapshotLevel[], level: number = 0): number {
		if (!side.length) return 0;
		level = level || side.length;
		let accumulatedAmt = 0;
		for (let i = 0; i++; i < level) accumulatedAmt += side[i].balance;
		return accumulatedAmt;
	}

	public async makeOrders(
		relayerClient: RelayerClient,
		dualClassWrapper: DualClassWrapper,
		pair: string
	) {
		util.logDebug('start making orders');
		this.custodianStates = await dualClassWrapper.getStates();
		const alpha = this.custodianStates.alpha;
		const ethNav = this.custodianStates.lastPrice / this.custodianStates.resetPrice;
		const isA = this.isA(pair);
		const tokenNav = isA ? this.custodianStates.navA : this.custodianStates.navB;
		const orderBookSnapshot = relayerClient.orderBookSnapshots[pair];

		const newBids = orderBookSnapshot.bids;
		const newAsks = orderBookSnapshot.asks;
		const bestBidPrice = newBids.length
			? newBids[0].price
			: newAsks.length
			? newAsks[0].price - this.priceStep
			: tokenNav - this.priceStep;
		const bestAskPrice = newAsks.length
			? newAsks[0].price
			: newBids.length
			? newBids[0].price + this.priceStep
			: tokenNav + this.priceStep;
		util.logDebug(`best bid ${bestBidPrice}, best ask ${bestAskPrice}`);
		// make orders for this side
		if (
			orderBookSnapshot.bids.length < CST.MIN_ORDER_BOOK_LEVELS ||
			this.getSideTotalLiquidity(orderBookSnapshot.bids, 3) < CST.MIN_SIDE_LIQUIDITY
		) {
			util.logDebug(`bid for ${pair} has insufficient liquidity, make orders`);
			await this.createOrderBookSide(
				relayerClient,
				pair,
				bestBidPrice,
				true,
				Math.min(3 - newBids.length, 3)
			);
		}

		if (
			newAsks.length < CST.MIN_ORDER_BOOK_LEVELS ||
			this.getSideTotalLiquidity(newAsks, 3) < CST.MIN_SIDE_LIQUIDITY
		) {
			util.logDebug(`ask for ${pair} has insufficient liquidity, make orders`);
			await this.createOrderBookSide(
				relayerClient,
				pair,
				bestAskPrice,
				false,
				Math.min(3 - newAsks.length, 3)
			);
		}

		util.logDebug('checking for arbitrage for the other token');
		const otherTokenNoArbBidPrice = ethNav * (1 + alpha) - (isA ? alpha : 1) * bestBidPrice;
		const otherTokenNoArbAskPrice = ethNav * (1 + alpha) - (isA ? alpha : 1) * bestAskPrice;
		const index = isA ? 1 : 0;
		const otherPair = this.tokens[index].code + '|' + CST.TOKEN_WETH;
		const otherTokenOrderBook = relayerClient.orderBookSnapshots[otherPair];
		const otherTokenBestBid = otherTokenOrderBook.bids.length
			? otherTokenOrderBook.bids[0].price
			: 0;
		const otherTokenBestAsk = otherTokenOrderBook.asks.length
			? otherTokenOrderBook.asks[0].price
			: Number.MAX_VALUE;

		util.logDebug(`no arb bid ${otherTokenNoArbBidPrice} vs best bid ${otherTokenBestBid}`);
		util.logDebug(`no arb ask ${otherTokenNoArbAskPrice} vs best ask ${otherTokenBestAsk}`);

		const orderHashesToCancel: string[] = [];
		let bidsToTake: IOrderBookSnapshotLevel[] = [];
		let asksToTake: IOrderBookSnapshotLevel[] = [];
		if (otherTokenBestBid >= otherTokenNoArbAskPrice) {
			for (const liveOrder of this.liveBidOrders[index])
				if (liveOrder.price >= otherTokenNoArbAskPrice)
					orderHashesToCancel.push(liveOrder.orderHash);
			bidsToTake = otherTokenOrderBook.bids.filter(
				bid => bid.price >= otherTokenNoArbAskPrice
			);
		}

		if (otherTokenBestAsk <= otherTokenNoArbBidPrice) {
			for (const liveOrder of this.liveAskOrders[index])
				if (liveOrder.price <= otherTokenNoArbBidPrice)
					orderHashesToCancel.push(liveOrder.orderHash);
			asksToTake = otherTokenOrderBook.asks.filter(
				ask => ask.price <= otherTokenNoArbBidPrice
			);
		}

		if (orderHashesToCancel.length) {
			util.logDebug('cancel arbitrage orders');
			await this.cancelOrders(relayerClient, otherPair, orderHashesToCancel);
		}

		if (bidsToTake.length) {
			util.logDebug('take arbitrage bids');
			await this.takeOneSideOrders(relayerClient, pair, true, bidsToTake);
		}
		if (asksToTake.length) {
			util.logDebug('take arbitrage asks');
			await this.takeOneSideOrders(relayerClient, pair, false, asksToTake);
		}
	}

	public async takeOneSideOrders(
		relayerClient: RelayerClient,
		pair: string,
		isBid: boolean,
		orderBookSide: IOrderBookSnapshotLevel[]
	) {
		for (const orderLevel of orderBookSide) {
			util.logDebug(
				`taking an  ${isBid ? 'bid' : 'ask'} order with price ${orderLevel.price} amount ${
					orderLevel.balance
				}`
			);
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
	}

	public async createOrderBookSide(
		relayerClient: RelayerClient,
		pair: string,
		bestPrice: number,
		isBid: boolean,
		level: number = 3
	) {
		const precision = this.tokens[0].precisions[CST.TOKEN_WETH];
		for (let i = 0; i < level; i++) {
			const levelPrice = Number(
				util.formatFixedNumber(bestPrice + (isBid ? -1 : 1) * i * this.priceStep, precision)
			);
			const orderHash = await relayerClient.addOrder(
				this.makerAccount.address,
				pair,
				levelPrice,
				20,
				isBid,
				util.getExpiryTimestamp(false)
			);
			this.pendingOrders[orderHash] = true;
			await util.sleep(1000);
		}
	}

	public async createOrderBookFromNav(
		dualClassWrapper: DualClassWrapper,
		relayerClient: RelayerClient
	) {
		this.custodianStates = await dualClassWrapper.getStates();
		const navPrices = [this.custodianStates.navA, this.custodianStates.navB];
		for (const index of [0, 1])
			for (const isBid of [true, false])
				await this.createOrderBookSide(
					relayerClient,
					this.tokens[index].code + '|' + CST.TOKEN_WETH,
					navPrices[index] / 135 - this.priceStep,
					isBid
				);
	}

	public async handleOrderBookUpdate(
		dualClassWrapper: DualClassWrapper,
		relayerClient: RelayerClient,
		orderBookSnapshot: IOrderBookSnapshot
	) {
		const pair = orderBookSnapshot.pair;
		if (
			!relayerClient.orderBookSnapshots[this.tokens[0].code + '|' + CST.TOKEN_WETH] ||
			!relayerClient.orderBookSnapshots[this.tokens[1].code + '|' + CST.TOKEN_WETH]
		)
			return;

		if (!util.isEmptyObject(this.pendingOrders)) return;

		await this.makeOrders(relayerClient, dualClassWrapper, pair);
	}

	public async cancelOrders(relayerClient: RelayerClient, pair: string, orderHashes: string[]) {
		orderHashes.forEach(o => (this.pendingOrders[o] = true));
		const signature = await relayerClient.web3Util.web3PersonalSign(
			this.makerAccount.address,
			CST.TERMINATE_SIGN_MSG + orderHashes.join(',')
		);
		relayerClient.deleteOrder(pair, orderHashes, signature);
	}

	public async handleOrderHistory(
		relayerClient: RelayerClient,
		dualClassWrapper: DualClassWrapper,
		userOrders: IUserOrder[]
	) {
		util.logDebug('received order history');
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
		this.createOrderBookFromNav(dualClassWrapper, relayerClient);
		// relayerClient.subscribeOrderBook(this.tokens[0].code + '|' + CST.TOKEN_WETH);
		// relayerClient.subscribeOrderBook(this.tokens[1].code + '|' + CST.TOKEN_WETH);
	}

	public handleUserOrder(
		userOrder: IUserOrder,
		web3Util: Web3Util,
		dualClassWrapper: DualClassWrapper
	) {
		const isBid = userOrder.side === CST.DB_BID;
		const { type, status, pair, orderHash, balance, price } = userOrder;
		util.logDebug(`received order update for ${orderHash} ${type} ${status}`);
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
		} else if (type === CST.DB_UPDATE && status !== CST.DB_MATCHING && prevVersion) {
			if (isBid) this.tokenBalances[0] -= (balance - prevVersion.balance) * price;
			else this.tokenBalances[index + 1] -= balance - prevVersion.balance;
			// override previous version;
			Object.assign(prevVersion, userOrder);
		}

		return this.maintainBalance(web3Util, dualClassWrapper);
	}

	public handleOrderError(method: string, orderHash: string, error: string) {
		util.logError(method + ' ' + orderHash + ' ' + error);
		if (this.pendingOrders[orderHash]) delete this.pendingOrders[orderHash];
		// TODO: handle add and terminate error
	}

	private getMakerAccount(mnemomic: string, index: number): IAccount {
		const bip39 = require('bip39');
		const hdkey = require('ethereumjs-wallet/hdkey');
		const hdwallet = hdkey.fromMasterSeed(bip39.mnemonicToSeed(mnemomic));
		const wallet = hdwallet
			.derivePath('m/' + CST.BASE_DERIVATION_PATH + '/' + index)
			.getWallet();
		const address = '0x' + wallet.getAddress().toString('hex');
		const privateKey = wallet.getPrivateKey().toString('hex');
		return {
			address: address,
			privateKey: privateKey
		};
	}

	public async initialize(relayerClient: RelayerClient, option: IOption) {
		util.logInfo('initializing dual class wrapper');
		const live = option.env === CST.DB_LIVE;
		const aToken = relayerClient.web3Util.getTokenByCode(option.token);
		if (!aToken) return null;
		const bToken = relayerClient.web3Util.tokens.find(
			t => t.code !== aToken.code && t.custodian === aToken.custodian
		);
		if (!bToken) return null;
		this.tokens = [aToken, bToken];
		this.priceStep = aToken.precisions[CST.TOKEN_WETH] * 100;
		let infura = {
			token: ''
		};
		try {
			infura = require('../keys/infura.json');
		} catch (error) {
			console.log(error);
		}
		const infuraProvider =
			(live ? CST.PROVIDER_INFURA_MAIN : CST.PROVIDER_INFURA_KOVAN) + '/' + infura.token;

		const dualClassWrapper = new DualClassWrapper(
			new Web3Wrapper(null, 'source', infuraProvider, live),
			aToken.custodian
		);
		util.logDebug('updating balance');
		const address = this.makerAccount.address;
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

	public async startProcessing(option: IOption) {
		util.logInfo(`starting bot for token ${option.token}`);
		const mnemonic = require('../keys/mnemomicBot.json');
		const live = option.env === CST.DB_LIVE;
		const web3Util = new Web3Util(null, live, mnemonic[option.token], false);
		this.makerAccount = this.getMakerAccount(mnemonic[option.token], 0);
		const relayerClient = new RelayerClient(web3Util, option.env);
		let dualClassWrapper: DualClassWrapper | null = null;

		relayerClient.onInfoUpdate(async () => {
			if (!dualClassWrapper) dualClassWrapper = await this.initialize(relayerClient, option);
		});

		relayerClient.onOrder(
			userOrders =>
				this.handleOrderHistory(
					relayerClient,
					dualClassWrapper as DualClassWrapper,
					userOrders
				),
			userOrder =>
				this.handleUserOrder(userOrder, web3Util, dualClassWrapper as DualClassWrapper),
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
			}
		);
		relayerClient.connectToRelayer();
	}
}

const marketMaker = new MarketMaker();
export default marketMaker;
