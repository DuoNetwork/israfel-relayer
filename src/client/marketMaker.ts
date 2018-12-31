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
	public isMakingOrder: boolean = false;
	public liveBidOrders: { [pair: string]: { [orderHash: string]: IUserOrder } } = {};
	public liveAskOrders: { [pair: string]: { [orderHash: string]: IUserOrder } } = {};
	public makerAccount: IAccount = { address: '0x0', privateKey: '' };
	public custodianStates: IDualClassStates | null = null;
	public priceStep: number = 0.0005;
	public tokenBalances: number[] = [0, 0, 0];

	public async checkBalance(web3Util: Web3Util, dualClassWrapper: DualClassWrapper) {
		const address = this.makerAccount.address;
		this.tokenBalances = [
			await web3Util.getTokenBalance(CST.TOKEN_WETH, address),
			await web3Util.getTokenBalance(this.tokens[0].code, address),
			await web3Util.getTokenBalance(this.tokens[1].code, address)
		];

		return this.maintainBalance(web3Util, dualClassWrapper);
	}

	public async checkAllowance(web3Util: Web3Util, dualClassWrapper: DualClassWrapper) {
		const address = this.makerAccount.address;

		for (const code of [CST.TOKEN_WETH, this.tokens[0].code, this.tokens[1].code])
			if (!(await web3Util.getTokenAllowance(code, address))) {
				util.logDebug(`${address} ${code} allowance is 0, approving.....`);
				const txHash = await web3Util.setUnlimitedTokenAllowance(code, address);
				await web3Util.awaitTransactionSuccessAsync(txHash);
			}

		const wethAddress = web3Util.contractAddresses.etherToken;
		const custodianAddress = dualClassWrapper.address;
		if (
			!(await dualClassWrapper.web3Wrapper.getErc20Allowance(
				wethAddress,
				address,
				custodianAddress
			))
		) {
			const txHash = await dualClassWrapper.web3Wrapper.erc20Approve(
				wethAddress,
				address,
				custodianAddress,
				0,
				true
			);
			await web3Util.awaitTransactionSuccessAsync(txHash);
		}
	}

	public async maintainBalance(web3Util: Web3Util, dualClassWrapper: DualClassWrapper) {
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
			const tx = await web3Util.tokenTransfer(
				CST.TOKEN_WETH,
				CST.FAUCET_ADDR,
				this.makerAccount.address,
				this.makerAccount.address,
				wethShortfall
			);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[0] += wethShortfall;
		}

		if (bTokenToCreate) {
			const tx = await dualClassWrapper.createRaw(
				this.makerAccount.address,
				this.makerAccount.privateKey,
				gasPrice,
				CST.CREATE_GAS,
				ethAmountForCreation,
				web3Util.contractAddresses.etherToken
			);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[2] += bTokenToCreate;
			this.tokenBalances[1] += bTokenToCreate * alpha;
			this.tokenBalances[0] -= ethAmountForCreation;
		}

		if (bTokenToRedeem) {
			let tx = await dualClassWrapper.redeemRaw(
				this.makerAccount.address,
				this.makerAccount.privateKey,
				bTokenToRedeem * alpha,
				bTokenToRedeem,
				gasPrice,
				CST.CREATE_GAS
			);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[2] -= bTokenToCreate;
			this.tokenBalances[1] -= bTokenToCreate * alpha;
			tx = await web3Util.wrapEther(ethAmountForRedemption, this.makerAccount.address);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[0] += ethAmountForRedemption;
		}

		if (wethSurplus) {
			const tx = await web3Util.tokenTransfer(
				CST.TOKEN_WETH,
				this.makerAccount.address,
				CST.FAUCET_ADDR,
				this.makerAccount.address,
				wethSurplus
			);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[0] -= wethSurplus;
		}
	}

	public getSideTotalLiquidity(side: IOrderBookSnapshotLevel[], level?: number): number {
		level = level ? Math.min(side.length, level) : side.length;
		if (level === 0) return 0;
		let accumulatedAmt = 0;
		for (let i = 0; i++; i < level) accumulatedAmt += side[i].balance;
		return accumulatedAmt;
	}

	public async startMakingOrders(
		relayerClient: RelayerClient,
		dualClassWrapper: DualClassWrapper,
		pair: string
	) {
		this.custodianStates = await dualClassWrapper.getStates();
		const ethNav = this.custodianStates.lastPrice / this.custodianStates.resetPrice;
		const isA = this.tokens[0].code === pair.split('|')[0];
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
		// make orders for this side
		if (
			orderBookSnapshot.bids.length < CST.MIN_ORDER_BOOK_LEVELS ||
			this.getSideTotalLiquidity(orderBookSnapshot.bids, 3) < CST.MIN_SIDE_LIQUIDITY
		)
			await this.createOrderBookSide(
				relayerClient,
				pair,
				bestBidPrice,
				true,
				Math.min(3 - newBids.length, 3)
			);

		if (
			newAsks.length < CST.MIN_ORDER_BOOK_LEVELS ||
			this.getSideTotalLiquidity(newAsks, 3) < CST.MIN_SIDE_LIQUIDITY
		)
			await this.createOrderBookSide(
				relayerClient,
				pair,
				bestAskPrice,
				false,
				Math.min(3 - newAsks.length, 3)
			);

		const otherTokenNoArbBidPrice =
			ethNav * (1 + this.custodianStates.alpha) -
			(isA ? this.custodianStates.alpha : 1) * bestBidPrice;

		const otherTokenNoArbAskPrice =
			ethNav * (1 + this.custodianStates.alpha) -
			(isA ? this.custodianStates.alpha : 1) * bestAskPrice;
		// TODO: cancel self make order with bid price > otherTokenBestBidPrice
		// currently, take all orders with bid price > otherTokenBestBidPrice, including self
		const otherTokenOrderBook =
			relayerClient.orderBookSnapshots[this.tokens[isA ? 1 : 0].code + '|' + CST.TOKEN_WETH];
		const otherTokenBestBid = otherTokenOrderBook.bids.length
			? otherTokenOrderBook.bids[0].price
			: 0;
		const otherTokenBestAsk = otherTokenOrderBook.asks.length
			? otherTokenOrderBook.asks[0].price
			: Number.MAX_VALUE;

		const pairToCancel = this.tokens[isA ? 1 : 0].code + '|' + CST.TOKEN_WETH;
		if (otherTokenBestBid >= otherTokenNoArbAskPrice) {
			const orderHashesToCancel: string[] = [];
			for (const orderHash in this.liveBidOrders[pairToCancel]) {
				const liveOrder = this.liveBidOrders[pairToCancel][orderHash];
				if (liveOrder.price >= otherTokenNoArbAskPrice) orderHashesToCancel.push(orderHash);
			}
			if (orderHashesToCancel.length)
				await this.cancelOrders(relayerClient, pairToCancel, orderHashesToCancel);
			await this.takeOneSideOrders(
				relayerClient,
				pair,
				true,
				otherTokenOrderBook.bids.filter(bid => bid.price >= otherTokenNoArbAskPrice)
			);
		}

		if (otherTokenBestAsk <= otherTokenNoArbBidPrice) {
			const orderHashesToCancel: string[] = [];
			for (const orderHash in this.liveAskOrders[pairToCancel]) {
				const liveOrder = this.liveAskOrders[pairToCancel][orderHash];
				if (liveOrder.price <= otherTokenNoArbBidPrice) orderHashesToCancel.push(orderHash);
			}
			if (orderHashesToCancel.length)
				await this.cancelOrders(relayerClient, pairToCancel, orderHashesToCancel);
			await this.takeOneSideOrders(
				relayerClient,
				pair,
				false,
				otherTokenOrderBook.asks.filter(ask => ask.price <= otherTokenNoArbBidPrice)
			);
		}
		this.isMakingOrder = false;
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
			await relayerClient.addOrder(
				this.makerAccount.address,
				pair,
				orderLevel.price,
				orderLevel.balance,
				!isBid,
				util.getExpiryTimestamp(true)
			);
			util.sleep(1000);
		}
	}

	public async createOrderBookSide(
		relayerClient: RelayerClient,
		pair: string,
		bestPrice: number,
		isBid: boolean,
		level: number = 3
	) {
		for (let i = 0; i < level; i++) {
			const levelPrice = util.round(bestPrice + (isBid ? -1 : 1) * i * this.priceStep);
			await relayerClient.addOrder(
				this.makerAccount.address,
				pair,
				levelPrice,
				20,
				isBid,
				util.getExpiryTimestamp(false)
			);
		}
	}

	public async getNav(dualClassWrapper: DualClassWrapper) {
		this.custodianStates = await dualClassWrapper.getStates();
		return [this.custodianStates.navA, this.custodianStates.navB];
	}

	public async createOrderBookFromNav(
		dualClassWrapper: DualClassWrapper,
		relayerClient: RelayerClient
	) {
		const navPrices = await this.getNav(dualClassWrapper);
		await this.createOrderBookSide(
			relayerClient,
			this.tokens[0].code + '|' + CST.TOKEN_WETH,
			navPrices[0] - this.priceStep,
			true
		);
		await this.createOrderBookSide(
			relayerClient,
			this.tokens[0].code + '|' + CST.TOKEN_WETH,
			navPrices[0] + this.priceStep,
			false
		);
		await this.createOrderBookSide(
			relayerClient,
			this.tokens[1].code + '|' + CST.TOKEN_WETH,
			navPrices[1] - this.priceStep,
			true
		);
		await this.createOrderBookSide(
			relayerClient,
			this.tokens[1].code + '|' + CST.TOKEN_WETH,
			navPrices[1] + this.priceStep,
			false
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

		if (this.isMakingOrder) return;

		if (
			orderBookSnapshot.bids.length < CST.MIN_ORDER_BOOK_LEVELS ||
			orderBookSnapshot.asks.length < CST.MIN_ORDER_BOOK_LEVELS ||
			this.getSideTotalLiquidity(orderBookSnapshot.asks, 3) < CST.MIN_SIDE_LIQUIDITY ||
			this.getSideTotalLiquidity(orderBookSnapshot.bids, 3) < CST.MIN_SIDE_LIQUIDITY
		) {
			this.isMakingOrder = true;

			await this.startMakingOrders(relayerClient, dualClassWrapper, pair);
		}
	}

	public async cancelOrders(relayerClient: RelayerClient, pair: string, orderHashes: string[]) {
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
			if (!this.liveBidOrders[pair]) this.liveBidOrders[pair] = {};
			if (!this.liveAskOrders[pair]) this.liveAskOrders[pair] = {};
			if (side === CST.DB_BID) this.liveBidOrders[pair][orderHash] = uo;
			else this.liveAskOrders[pair][orderHash] = uo;

			const code = pair.split('|')[0];
			const tokenIndex = pair.startsWith(this.tokens[0].code) ? 1 : 2;
			if (codes.includes(code))
				if (side === CST.DB_BID) this.tokenBalances[0] -= balance * price;
				else this.tokenBalances[tokenIndex] -= balance;
		});

		for (const pair in this.liveBidOrders) {
			const orderHashes = [
				...Object.keys(this.liveBidOrders[pair]),
				...Object.keys(this.liveAskOrders[pair])
			];
			if (orderHashes.length) this.cancelOrders(relayerClient, pair, orderHashes);
		}

		this.createOrderBookFromNav(dualClassWrapper, relayerClient);
		relayerClient.subscribeOrderBook(this.tokens[0].code + '|' + CST.TOKEN_WETH);
		relayerClient.subscribeOrderBook(this.tokens[1].code + '|' + CST.TOKEN_WETH);
	}

	public async handleUserOrder(
		userOrder: IUserOrder,
		web3Util: Web3Util,
		dualClassWrapper: DualClassWrapper
	) {
		const isBid = userOrder.side === CST.DB_BID;
		const { pair, orderHash } = userOrder;
		const tokenIndex = pair.startsWith(this.tokens[0].code) ? 1 : 2;
		const orderCache = isBid ? this.liveBidOrders : this.liveAskOrders;
		if (userOrder.type === CST.DB_TERMINATE) {
			const prevVersion = orderCache[pair][userOrder.orderHash];
			delete orderCache[pair][userOrder.orderHash];
			if (isBid) this.tokenBalances[0] += prevVersion.balance * prevVersion.price;
			else this.tokenBalances[tokenIndex] += prevVersion.balance;
		} else if (userOrder.type === CST.DB_ADD) {
			orderCache[pair][orderHash] = userOrder;
			if (isBid) this.tokenBalances[0] -= userOrder.balance * userOrder.price;
			else this.tokenBalances[tokenIndex] -= userOrder.balance;
			orderCache[pair][orderHash] = userOrder;
		} else if (userOrder.type === CST.DB_UPDATE && userOrder.status !== CST.DB_MATCHING) {
			if (isBid)
				this.tokenBalances[0] -=
					(userOrder.balance - orderCache[pair][orderHash].balance) * userOrder.price;
			else
				this.tokenBalances[tokenIndex] -=
					userOrder.balance - orderCache[pair][orderHash].balance;
			orderCache[pair][orderHash] = userOrder;
		}

		await this.checkBalance(web3Util, dualClassWrapper);
	}

	private getMakerAccount(mnemomic: string, index: number): IAccount {
		const bip39 = require('bip39');
		const hdkey = require('ethereumjs-wallet/hdkey');
		const hdwallet = hdkey.fromMasterSeed(bip39.mnemonicToSeed(mnemomic));
		const wallet = hdwallet.derivePath(CST.BASE_DERIVATION_PATH + index).getWallet();
		const address = '0x' + wallet.getAddress().toString('hex');
		const privateKey = wallet.getPrivateKey().toString('hex');
		return {
			address: address,
			privateKey: privateKey
		};
	}

	public async startProcessing(option: IOption) {
		const mnemonic = require('../keys/mnemomicBot.json');
		const live = option.env === CST.DB_LIVE;
		const web3Util = new Web3Util(null, live, mnemonic[option.token], false);
		this.makerAccount = this.getMakerAccount(mnemonic[option.token], 0);
		const relayerClient = new RelayerClient(web3Util, option.env);
		let dualClassWrapper: DualClassWrapper | null = null;

		relayerClient.onInfoUpdate(async () => {
			if (!dualClassWrapper) {
				const aToken = web3Util.getTokenByCode(option.token);
				if (!aToken) return;
				const bToken = web3Util.tokens.find(
					t => t.code !== aToken.code && t.custodian === aToken.custodian
				);
				if (!bToken) return;
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
					(live ? CST.PROVIDER_INFURA_MAIN : CST.PROVIDER_INFURA_KOVAN) +
					'/' +
					infura.token;

				dualClassWrapper = new DualClassWrapper(
					new Web3Wrapper(null, 'source', infuraProvider, live),
					aToken.custodian
				);
				await this.checkAllowance(web3Util, dualClassWrapper);
				await this.checkBalance(web3Util, dualClassWrapper);
				relayerClient.subscribeOrderHistory(this.makerAccount.address);
			}
		});

		relayerClient.onOrder(
			async userOrders =>
				this.handleOrderHistory(
					relayerClient,
					dualClassWrapper as DualClassWrapper,
					userOrders
				),
			userOrder =>
				this.handleUserOrder(userOrder, web3Util, dualClassWrapper as DualClassWrapper),
			(method, orderHash, error) => util.logError(method + ' ' + orderHash + ' ' + error)
		);
		relayerClient.onOrderBook(
			orderBookSnapshot =>
				this.handleOrderBookUpdate(
					dualClassWrapper as DualClassWrapper,
					relayerClient,
					orderBookSnapshot
				),
			(method, pair, error) => {
				util.logError(method + ' ' + pair + ' ' + error); // TODO: handle add and terminate error
			}
		);

		relayerClient.onConnection(
			() => util.logDebug('connected'),
			() => util.logDebug('reconnecting') // TODO: handle reconnect
		);
		relayerClient.connectToRelayer();
	}
}

const marketMaker = new MarketMaker();
export default marketMaker;
