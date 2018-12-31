import DualClassWrapper from '../../../duo-contract-wrapper/src/DualClassWrapper';
import Web3Wrapper from '../../../duo-contract-wrapper/src/Web3Wrapper';
import Web3Util from '../../../israfel-relayer/src/utils/Web3Util';
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
import RelayerClient from './RelayerClient';

// change faucet to WETH approve and transfers

class MarketMaker {
	public tokens: IToken[] = [];
	public isMakingOrder: boolean = false;
	public liveOrders: { [pair: string]: { [orderHash: string]: IUserOrder } } = {};
	public makerAccount: IAccount = { address: '0x0', privateKey: '' };
	public custodianStates: IDualClassStates | null = null;
	public priceStep: number = 0.0005;
	public availableBalances: { [code: string]: number } = {};
	public ethBalance: number = 0;
	public tokenBalances: number[] = [0, 0, 0];

	public getMainAccount() {
		const faucetAccount = require('../keys/faucetAccount.json');
		return {
			address: faucetAccount.publicKey,
			privateKey: faucetAccount.privateKey
		};
	}

	public async checkBalanceAllowance(web3Util: Web3Util, dualClassWrapper: DualClassWrapper) {
		const address = this.makerAccount.address;
		this.ethBalance = await web3Util.getEthBalance(address);
		this.tokenBalances = [
			await web3Util.getTokenBalance(CST.TOKEN_WETH, address),
			await web3Util.getTokenBalance(this.tokens[0].code, address),
			await web3Util.getTokenBalance(this.tokens[1].code, address)
		];

		for (const code of [CST.TOKEN_WETH, this.tokens[0].code, this.tokens[1].code])
			if (!(await web3Util.getProxyTokenAllowance(code, address))) {
				util.logDebug(`${address} ${code} allowance is 0, approvaing.....`);
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

		return this.maintainMinimumBalance(web3Util, dualClassWrapper);
	}

	public async maintainMinimumBalance(web3Util: Web3Util, dualClassWrapper: DualClassWrapper) {
		this.custodianStates = await dualClassWrapper.getStates();
		const alpha = this.custodianStates.alpha;
		let wethShortFall = Math.max(0, CST.MIN_WETH_BALANCE - this.tokenBalances[0]);
		const aTokenShortFall = Math.max(0, CST.MIN_TOKEN_BALANCE * alpha - this.tokenBalances[1]);
		const bTokenShortFall = Math.max(0, CST.MIN_TOKEN_BALANCE - this.tokenBalances[2]);
		const bTokenToCreate = Math.max(aTokenShortFall / alpha, bTokenShortFall);
		const tokensPerEth = DualClassWrapper.getTokensPerEth(this.custodianStates);
		const ethAmountForCreation =
			(bTokenToCreate
				? bTokenToCreate + CST.TARGET_TOKEN_BALANCE - CST.MIN_TOKEN_BALANCE
				: 0) /
			tokensPerEth[1] /
			(1 - this.custodianStates.createCommRate);

		wethShortFall += ethAmountForCreation;
		if (wethShortFall) {
			const faucet = this.getMainAccount();
			const tx = await web3Util.tokenTransfer(
				CST.TOKEN_WETH,
				faucet.address,
				this.makerAccount.address,
				this.makerAccount.address,
				CST.TARGET_WETH_BALANCE - this.tokenBalances[0]
			);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[0] = CST.MIN_WETH_BALANCE;
		}
		if (bTokenToCreate) {
			const gasPrice = Math.max(
				await web3Util.getGasPrice(),
				CST.DEFAULT_GAS_PRICE * Math.pow(10, 9)
			);
			const tx = await dualClassWrapper.createRaw(
				this.makerAccount.address,
				this.makerAccount.privateKey,
				gasPrice,
				CST.CREATE_GAS,
				ethAmountForCreation,
				web3Util.contractAddresses.etherToken
			);
			await web3Util.awaitTransactionSuccessAsync(tx);
			this.tokenBalances[2] = CST.MIN_TOKEN_BALANCE;
			this.tokenBalances[1] += bTokenToCreate * alpha;
		}
	}

	private getSideTotalLiquidity(side: IOrderBookSnapshotLevel[], level?: number): number {
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

		if (otherTokenBestBid > otherTokenNoArbAskPrice)
			await this.takeOneSideOrders(
				relayerClient,
				pair,
				true,
				otherTokenOrderBook.bids.filter(bid => bid.price >= otherTokenNoArbAskPrice)
			);

		if (otherTokenBestAsk < otherTokenNoArbBidPrice)
			await this.takeOneSideOrders(
				relayerClient,
				pair,
				false,
				otherTokenOrderBook.asks.filter(ask => ask.price <= otherTokenNoArbBidPrice)
			);
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

	public async handleOrderHistory(
		dualClassWrapper: DualClassWrapper,
		relayerClient: RelayerClient,
		userOrders: IUserOrder[],
		web3Util: Web3Util
	) {
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

		// TODO: reduce balance first by each order
		for (const pair in this.liveOrders) {
			const orderHashes = Object.keys(this.liveOrders[pair]);
			if (orderHashes.length) {
				const signature = await web3Util.web3PersonalSign(
					this.makerAccount.address,
					CST.TERMINATE_SIGN_MSG + orderHashes.join(',')
				);

				relayerClient.deleteOrder(pair, orderHashes, signature);
				const code = pair.split('|')[0];

				for (const orderHash of orderHashes) {
					const liveOrder = this.liveOrders[code][orderHash];
					if (this.tokens.map(token => token.code).includes(code))
						if (liveOrder.side === CST.DB_BID) {
							this.availableBalances[CST.TOKEN_WETH] +=
								liveOrder.price * liveOrder.balance;
							this.availableBalances[code] -= liveOrder.balance;
						} else {
							this.availableBalances[CST.TOKEN_WETH] -=
								liveOrder.price * liveOrder.balance;
							this.availableBalances[code] += liveOrder.balance;
						}
				}

				this.liveOrders[pair] = {};
			}
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
		if (userOrder.type === CST.DB_TERMINATE) {
			const prevVersion = this.liveOrders[pair][userOrder.orderHash];
			delete this.liveOrders[pair][userOrder.orderHash];
			if (isBid) this.tokenBalances[0] += prevVersion.balance * prevVersion.price;
			else this.tokenBalances[tokenIndex] += prevVersion.balance;
		} else if (userOrder.type === CST.DB_ADD) {
			this.liveOrders[pair][orderHash] = userOrder;
			if (isBid) this.tokenBalances[0] -= userOrder.balance * userOrder.price;
			else this.tokenBalances[tokenIndex] -= userOrder.balance;
			this.liveOrders[pair][orderHash] = userOrder;
		} else if (userOrder.type === CST.DB_UPDATE && userOrder.status !== CST.DB_MATCHING) {
			if (isBid)
				this.availableBalances[CST.TOKEN_WETH] -=
					(userOrder.balance - this.liveOrders[pair][orderHash].balance) *
					userOrder.price;
			else
				this.availableBalances[pair.split('|')[0]] -=
					userOrder.balance - this.liveOrders[pair][orderHash].balance;
			this.liveOrders[pair][orderHash] = userOrder;
		}

		await this.checkBalanceAllowance(web3Util, dualClassWrapper);
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
				await this.checkBalanceAllowance(web3Util, dualClassWrapper);
				relayerClient.subscribeOrderHistory(this.makerAccount.address);
			}
		});

		relayerClient.onOrder(
			async userOrders =>
				this.handleOrderHistory(
					dualClassWrapper as DualClassWrapper,
					relayerClient,
					userOrders,
					web3Util
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
				util.logError(method + ' ' + pair + ' ' + error) // TODO: handle add and terminate error
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
