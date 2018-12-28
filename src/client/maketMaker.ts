import DualClassWrapper from '../../../duo-contract-wrapper/src/DualClassWrapper';
import Web3Wrapper from '../../../duo-contract-wrapper/src/Web3Wrapper';
import Web3Util from '../../../israfel-relayer/src/utils/Web3Util';
import * as CST from '../common/constants';
import {
	IAccounts,
	IBestPriceChange,
	IDualClassStates,
	IOption,
	IOrderBookSnapshot,
	IOrderBookSnapshotLevel,
	IOrderBookSnapshotUpdate,
	IToken,
	IUserOrder
} from '../common/types';
import util from '../utils/util';
import RelayerClient from './RelayerClient';

class MarketMaker {
	public orderBookSnapshots: { [pair: string]: IOrderBookSnapshot } = {};
	public pendingOrderBookUpdates: { [pair: string]: IOrderBookSnapshotUpdate[] } = {};
	public tokens: IToken[] = [];
	private dualClassWrapper: DualClassWrapper | null = null;
	private relayerClient: RelayerClient | null = null;
	public isMakingOrder: boolean = false;
	public liveOrders: { [pair: string]: { [orderHash: string]: IUserOrder } } = {};
	public makerAddress: string = '';
	public custodianStates: IDualClassStates | null = null;
	public priceStep: number = 0.0005;

	public getMainAccount() {
		const faucetAccount = require('../keys/faucetAccount.json');
		return {
			address: faucetAccount.publicKey,
			privateKey: faucetAccount.privateKey
		};
	}

	public async checkBalance(
		web3Util: Web3Util,
		dualClassWrapper: DualClassWrapper | null,
		addresses: string[]
	): Promise<string[]> {
		if (!dualClassWrapper) return [];
		const states: IDualClassStates = await dualClassWrapper.getStates();

		for (const address of addresses) {
			const faucetAccount: IAccounts = this.getMainAccount();
			// ethBalance
			const ethBalance = await web3Util.getEthBalance(address);
			util.logInfo(`the ethBalance of ${address} is ${ethBalance}`);
			if (ethBalance < CST.MIN_ETH_BALANCE) {
				util.logDebug(
					`the address ${address} current eth balance is ${ethBalance}, make transfer...`
				);

				await dualClassWrapper.web3Wrapper.ethTransferRaw(
					faucetAccount.address,
					faucetAccount.privateKey,
					address,
					util.round(CST.MIN_ETH_BALANCE),
					await web3Util.getTransactionCount(faucetAccount.address)
				);
			}

			// wEthBalance
			const wEthBalance = await web3Util.getTokenBalance(CST.TOKEN_WETH, address);
			if (wEthBalance < CST.MIN_WETH_BALANCE) {
				util.logDebug(
					`the address ${address} current weth balance is ${wEthBalance}, wrapping...`
				);
				const amtToWrap = CST.MIN_WETH_BALANCE - wEthBalance + 0.1;

				if (ethBalance < amtToWrap)
					await dualClassWrapper.web3Wrapper.ethTransferRaw(
						faucetAccount.address,
						faucetAccount.privateKey,
						address,
						CST.MIN_ETH_BALANCE,
						await web3Util.getTransactionCount(faucetAccount.address)
					);

				util.logDebug(`start wrapping for ${address} with amt ${amtToWrap}`);
				await web3Util.wrapEther(util.round(amtToWrap), address);
			}

			// wETHallowance
			const wethAllowance = await web3Util.getProxyTokenAllowance(CST.TOKEN_WETH, address);
			util.logDebug(`tokenAllowande of token ${CST.TOKEN_WETH} is ${wethAllowance}`);
			if (wethAllowance <= 0) {
				util.logDebug(
					`the address ${address} token allowance of ${
						CST.TOKEN_WETH
					} is 0, approvaing.....`
				);
				await web3Util.setUnlimitedTokenAllowance(CST.TOKEN_WETH, address);
			}

			// a tokenBalance
			const balanceOfTokenA = await web3Util.getTokenBalance(this.tokens[0].code, address);
			const balanceOfTokenB = await web3Util.getTokenBalance(this.tokens[1].code, address);
			const effBalanceOfTokenB = Math.min(balanceOfTokenA / states.alpha, balanceOfTokenB);

			const accountsBot: IAccounts[] = require('../keys/accountsBot.json');
			const account = accountsBot.find(a => a.address === address);
			const gasPrice = Math.max(
				await web3Util.getGasPrice(),
				CST.DEFAULT_GAS_PRICE * Math.pow(10, 9)
			);
			if (effBalanceOfTokenB < CST.MIN_TOKEN_BALANCE) {
				const tokenAmtToCreate =
					DualClassWrapper.getTokensPerEth(states)[1] *
					(ethBalance - CST.MIN_ETH_BALANCE - 0.1);

				if (tokenAmtToCreate + effBalanceOfTokenB <= CST.MIN_TOKEN_BALANCE)
					await dualClassWrapper.web3Wrapper.ethTransferRaw(
						faucetAccount.address,
						faucetAccount.privateKey,
						address,
						CST.MIN_ETH_BALANCE,
						await web3Util.getTransactionCount(faucetAccount.address)
					);

				if (account)
					await dualClassWrapper.createRaw(
						address,
						account.privateKey,
						gasPrice,
						CST.CREATE_GAS,
						CST.MIN_ETH_BALANCE
					);
				else {
					util.logDebug(`the address ${address} cannot create, skip...`);
					addresses = addresses.filter(addr => addr !== address);
					continue;
				}
			} else if (effBalanceOfTokenB >= CST.MAX_TOKEN_BALANCE)
				if (account)
					await dualClassWrapper.redeemRaw(
						address,
						account.privateKey,
						effBalanceOfTokenB - CST.MAX_TOKEN_BALANCE,
						(effBalanceOfTokenB - CST.MAX_TOKEN_BALANCE) / states.alpha,
						gasPrice,
						CST.REDEEM_GAS
					);

			for (const token of this.tokens) {
				const tokenAllowance = await web3Util.getProxyTokenAllowance(token.code, address);
				util.logInfo(`tokenAllowande of token ${token.code} is ${tokenAllowance}`);
				if (tokenAllowance <= 0) {
					util.logInfo(
						`the address ${address} token allowance of ${
							token.code
						} is 0, approvaing.....`
					);
					await web3Util.setUnlimitedTokenAllowance(token.code, address);
				}
			}
		}

		return addresses;
	}

	private getSideTotalLiquidity(side: IOrderBookSnapshotLevel[], level?: number): number {
		level = level ? Math.min(side.length, level) : side.length;
		if (level === 0) return 0;
		let accumulatedAmt = 0;
		for (let i = 0; i++; i < level) accumulatedAmt += side[i].balance;
		return accumulatedAmt;
	}

	public async startMakingOrders(
		pair: string,
		orderBookSnapshot: IOrderBookSnapshot,
		bestPriceChange: IBestPriceChange
	) {
		if (!this.dualClassWrapper) return;
		this.custodianStates = await this.dualClassWrapper.getStates();
		const ethNav = this.custodianStates.lastPrice / this.custodianStates.resetPrice;
		const thisToken = this.tokens.find(t => t.code === pair.split('|')[0]);
		const otherToken = this.tokens.find(t => t.code !== pair.split('|')[0]);
		if (!thisToken || !otherToken) {
			this.isMakingOrder = false;
			return;
		}

		if (bestPriceChange.changeAmount === 0) {
			// no bestPriceChange, need to make enough liquidity
			await this.createOrderBookSide(pair, orderBookSnapshot.bids[0].price, true);
			await this.createOrderBookSide(pair, orderBookSnapshot.asks[0].price, false);
		} else if (
			(bestPriceChange.isBidChange && bestPriceChange.changeAmount < 0) ||
			(!bestPriceChange.isBidChange && bestPriceChange.changeAmount > 0)
		) {
			await this.createOrderBookSide(
				pair,
				orderBookSnapshot.bids[0].price,
				true,
				Math.min(3 - orderBookSnapshot.bids.length, 3)
			);

			const otherTokenBestBidPrice =
				ethNav * (1 + this.custodianStates.alpha) -
				(this.tokens.indexOf(thisToken) === 0
					? this.custodianStates.alpha * orderBookSnapshot.bids[0].price
					: orderBookSnapshot.bids[0].price);

			// TODO: cancel self make order with bid price > otherTokenBestBidPrice
			// currently, take all orders with bid price > otherTokenBestBidPrice, including self
			await this.takeOneSideOrders(
				pair,
				true,
				this.orderBookSnapshots[otherToken.code].bids.filter(
					bid => bid.price > otherTokenBestBidPrice
				)
			);
			await this.createOrderBookSide(
				otherToken.code + '|' + CST.TOKEN_WETH,
				otherTokenBestBidPrice,
				true
			);
		} else if (
			(bestPriceChange.isBidChange && bestPriceChange.changeAmount > 0) ||
			(!bestPriceChange.isBidChange && bestPriceChange.changeAmount < 0)
		) {
			await this.createOrderBookSide(
				pair,
				orderBookSnapshot.asks[0].price,
				false,
				Math.min(3 - orderBookSnapshot.asks.length, 3)
			);
			const otherTokenBestAskPrice =
				ethNav * (1 + this.custodianStates.alpha) -
				(this.tokens.indexOf(thisToken) === 0
					? this.custodianStates.alpha * orderBookSnapshot.asks[0].price
					: orderBookSnapshot.asks[0].price);

			await this.takeOneSideOrders(
				pair,
				false,
				this.orderBookSnapshots[otherToken.code].asks.filter(
					ask => ask.price < otherTokenBestAskPrice
				)
			);
			await this.createOrderBookSide(
				otherToken.code + '|' + CST.TOKEN_WETH,
				otherTokenBestAskPrice,
				false
			);
		}
		this.isMakingOrder = false;
	}

	public async takeOneSideOrders(
		pair: string,
		isBid: boolean,
		orderBookSide: IOrderBookSnapshotLevel[]
	) {
		if (!this.relayerClient) {
			util.logDebug('no relayer client, ignore');
			return;
		}
		for (const orderLevel of orderBookSide) {
			util.logDebug(
				`taking an  ${isBid ? 'bid' : 'ask'} order with price ${orderLevel.price} amount ${
					orderLevel.balance
				}`
			);
			await this.relayerClient.addOrder(
				this.makerAddress,
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
		pair: string,
		bestPrice: number,
		isBid: boolean,
		level: number = 3
	) {
		if (!this.relayerClient) {
			util.logDebug('no relayer client, ignore');
			return;
		}
		for (let i = 0; i < level; i++) {
			const levelPrice = util.round(bestPrice + (isBid ? -1 : 1) * i * this.priceStep);
			const levelAmount = CST.ORDER_BOOK_LEVEL_AMT[i];
			if (levelAmount > 0)
				await this.relayerClient.addOrder(
					this.makerAddress,
					pair,
					levelPrice,
					levelAmount,
					isBid,
					util.getExpiryTimestamp(false)
				);
		}
	}

	public async getNav() {
		if (!this.dualClassWrapper) return [1, 1];
		this.custodianStates = await this.dualClassWrapper.getStates();
		return [this.custodianStates.navA, this.custodianStates.navB];
	}

	public async createOrderBookFromNav() {
		const navPrices = await this.getNav();
		await this.createOrderBookSide(
			this.tokens[0].code + '|' + CST.TOKEN_WETH,
			navPrices[0] - this.priceStep,
			true
		);
		await this.createOrderBookSide(
			this.tokens[0].code + '|' + CST.TOKEN_WETH,
			navPrices[0] + this.priceStep,
			false
		);
		await this.createOrderBookSide(
			this.tokens[1].code + '|' + CST.TOKEN_WETH,
			navPrices[1] - this.priceStep,
			true
		);
		await this.createOrderBookSide(
			this.tokens[1].code + '|' + CST.TOKEN_WETH,
			navPrices[1] + this.priceStep,
			false
		);
	}

	public async handleOrderBookUpdate(orderBookSnapshot: IOrderBookSnapshot) {
		const pair = orderBookSnapshot.pair;
		this.orderBookSnapshots[pair] = orderBookSnapshot;
		if (this.isMakingOrder) return;

		if (
			orderBookSnapshot.bids.length < CST.MIN_ORDER_BOOK_LEVELS ||
			orderBookSnapshot.asks.length < CST.MIN_ORDER_BOOK_LEVELS ||
			this.getSideTotalLiquidity(orderBookSnapshot.asks, 3) < CST.MIN_SIDE_LIQUIDITY ||
			this.getSideTotalLiquidity(orderBookSnapshot.bids, 3) < CST.MIN_SIDE_LIQUIDITY
		) {
			this.isMakingOrder = true;

			const bestPriceChange: IBestPriceChange = {
				isBidChange: true,
				changeAmount:
					(orderBookSnapshot.bids[0].price || 0) -
					(this.orderBookSnapshots[pair].bids[0].price || 0)
			};
			if (orderBookSnapshot.asks[0].price !== this.orderBookSnapshots[pair].asks[0].price) {
				bestPriceChange.isBidChange = false;
				bestPriceChange.changeAmount =
					(orderBookSnapshot.asks[0].price || 0) -
					(this.orderBookSnapshots[pair].asks[0].price || 0);
			}

			await this.startMakingOrders(pair, orderBookSnapshot, bestPriceChange);
		}
	}

	public async startProcessing(option: IOption) {
		const mnemonic = require('../keys/mnemomicBot.json');
		const live = option.env === CST.DB_LIVE;
		const web3Util = new Web3Util(null, live, mnemonic[option.token], false);
		this.makerAddress = (await web3Util.getAvailableAddresses())[0];
		this.relayerClient = new RelayerClient(web3Util, option.env);

		this.relayerClient.onInfoUpdate(async () => {
			if (!this.dualClassWrapper) {
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

				this.dualClassWrapper = new DualClassWrapper(
					new Web3Wrapper(null, 'source', infuraProvider, live),
					aToken.custodian
				);

				// check initial balance here

				if (this.relayerClient) this.relayerClient.subscribeOrderHistory(this.makerAddress);
			}
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
				// compute available balance by remove amounts from open orders

				// cancel all live orders

				this.createOrderBookFromNav();

				if (this.relayerClient) {
					this.relayerClient.subscribeOrderBook(
						this.tokens[0].code + '|' + CST.TOKEN_WETH
					);
					this.relayerClient.subscribeOrderBook(
						this.tokens[1].code + '|' + CST.TOKEN_WETH
					);
				}
			},
			userOrder => {
				// adjust balance for each order update
				if (userOrder.type === CST.DB_TERMINATE)
					delete this.liveOrders[userOrder.pair][userOrder.orderHash];
				else this.liveOrders[userOrder.pair][userOrder.orderHash] = userOrder;
			},
			(method, orderHash, error) => util.logError(method + ' ' + orderHash + ' ' + error)
		);
		this.relayerClient.onOrderBook(
			orderBookSnapshot => this.handleOrderBookUpdate(orderBookSnapshot),
			(method, pair, error) => util.logError(method + ' ' + pair + ' ' + error)
		);

		this.relayerClient.onConnection(
			() => util.logDebug('connected'),
			() => util.logDebug('reconnecting')
		);
		this.relayerClient.connectToRelayer();
	}
}

const marketMaker = new MarketMaker();
export default marketMaker;
