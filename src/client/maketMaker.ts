// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import DualClassWrapper from '../../../duo-contract-wrapper/src/DualClassWrapper';
import Web3Wrapper from '../../../duo-contract-wrapper/src/Web3Wrapper';
import Web3Util from '../../../israfel-relayer/src/utils/Web3Util';
import * as CST from '../common/constants';
import {
	IAccounts,
	ICreateOrderBook,
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
	public lastAcceptedPrice: { [key: string]: number } = { price: 0, time: 0 };
	public expectedMidPrice: { [key: string]: number } = {};

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

	public async startMakingOrders(pair: string) {
		util.logInfo(`start anlayzing new orderBookSnapshot`);
		if (!this.dualClassWrapper) {
			util.logDebug(`no dualClassWrapper initiated`);
			return;
		}

		const states = await this.dualClassWrapper.getStates();
		if (
			states.lastPrice !== this.lastAcceptedPrice.price ||
			states.lastPriceTime !== this.lastAcceptedPrice.time
		) {
			this.lastAcceptedPrice.price = states.lastPrice;
			this.lastAcceptedPrice.time = states.lastPriceTime;
			this.expectedMidPrice[this.tokens[0].code] = util.round(states.navA / states.lastPrice);
			this.expectedMidPrice[this.tokens[1].code] = util.round(states.navB / states.lastPrice);
		}

		let bidAmountToCreate = 0;
		let askAmountToCreate = 0;
		let numOfBidOrdersToPlace = 0;
		let numOfAskOrdersToPlace = 0;
		let existingBidPrices = this.orderBookSnapshots[pair].bids.map(bid => bid.price);
		let existingAskPrices = this.orderBookSnapshots[pair].asks.map(ask => ask.price);
		let currentAskLevels = this.orderBookSnapshots[pair].asks.length;
		let currentBidLevels = this.orderBookSnapshots[pair].bids.length;

		if (!currentBidLevels && !currentAskLevels) {
			util.logDebug(`no bids and asks, need to create whole new orderBook`);
			askAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
			bidAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
			numOfBidOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;
			numOfAskOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;
		} else if (!currentBidLevels && currentAskLevels) {
			util.logInfo(`no bids ,have asks`);
			const bestAskPrice = this.orderBookSnapshots[pair].asks[0].price;
			const totalLiquidity = this.getSideTotalLiquidity(this.orderBookSnapshots[pair].asks);
			util.logDebug(
				`best ask price is ${bestAskPrice} with totalLiquilidty ${totalLiquidity}`
			);

			if (bestAskPrice > this.expectedMidPrice.price) {
				askAmountToCreate = CST.MIN_SIDE_LIQUIDITY - totalLiquidity;
				bidAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
				numOfBidOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;
				numOfAskOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS - currentAskLevels;
			} else if (bestAskPrice <= this.expectedMidPrice.price) {
				util.logDebug(`ask side liquidity not enough, take all and recreate orderBook`);
				// take one side
				await this.takeOneSideOrders(
					pair,
					false,
					this.orderBookSnapshots[pair].asks.filter(
						ask => ask.price <= this.expectedMidPrice.price
					)
				);

				bidAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
				numOfBidOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;

				currentAskLevels = this.orderBookSnapshots[pair].asks.filter(
					ask => ask.price > this.expectedMidPrice.price
				).length;
				const totalAskLiquidity = this.getSideTotalLiquidity(
					this.orderBookSnapshots[pair].asks.filter(
						ask => ask.price > this.expectedMidPrice.price
					)
				);
				askAmountToCreate = this.getSideAmtToCreate(currentAskLevels, totalAskLiquidity);
				numOfAskOrdersToPlace = Math.max(3 - currentAskLevels, 1);
				existingAskPrices = existingAskPrices.filter(
					price => price > this.expectedMidPrice.price
				);
			}
		} else if (!currentAskLevels && currentBidLevels) {
			util.logInfo(`no asks, have bids`);
			const bestBidPrice = this.orderBookSnapshots[pair].bids[0].price;
			const totalLiquidity = this.getSideTotalLiquidity(this.orderBookSnapshots[pair].bids);
			util.logDebug(
				`best bid price is ${bestBidPrice} with totalLiquilidty ${totalLiquidity}`
			);

			if (bestBidPrice < this.expectedMidPrice.price) {
				bidAmountToCreate = CST.MIN_SIDE_LIQUIDITY - totalLiquidity;
				askAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
				numOfBidOrdersToPlace = 3 - currentBidLevels;
				numOfAskOrdersToPlace = 3;
			} else if (bestBidPrice >= this.expectedMidPrice.price) {
				util.logDebug(`bid side liquidity not enough, take all and recreate orderBook`);
				// take all
				await this.takeOneSideOrders(
					pair,
					true,
					this.orderBookSnapshots[pair].bids.filter(
						bid => bid.price >= this.expectedMidPrice.price
					)
				);
				askAmountToCreate = CST.MIN_SIDE_LIQUIDITY;
				numOfAskOrdersToPlace = CST.MIN_ORDER_BOOK_LEVELS;

				currentBidLevels = this.orderBookSnapshots[pair].bids.filter(
					bod => bod.price < this.expectedMidPrice.price
				).length;
				const totalBidLiquidity = this.getSideTotalLiquidity(
					this.orderBookSnapshots[pair].bids.filter(
						bid => bid.price < this.expectedMidPrice.price
					)
				);

				bidAmountToCreate = this.getSideAmtToCreate(currentBidLevels, totalBidLiquidity);
				numOfBidOrdersToPlace = Math.max(3 - currentBidLevels, 1);
				existingBidPrices = existingBidPrices.filter(
					price => price < this.expectedMidPrice.price
				);
			}
		} else {
			util.logInfo(`have both asks and have bids`);
			const bestBidPrice = this.orderBookSnapshots[pair].bids[0].price;
			const bestAskPrice = this.orderBookSnapshots[pair].asks[0].price;
			let totalBidLiquidity = this.getSideTotalLiquidity(this.orderBookSnapshots[pair].bids);
			let totalAskLiquidity = this.getSideTotalLiquidity(this.orderBookSnapshots[pair].asks);
			if (this.expectedMidPrice.price > bestAskPrice) {
				await this.takeOneSideOrders(
					pair,
					false,
					this.orderBookSnapshots[pair].asks.filter(
						ask => ask.price <= this.expectedMidPrice.price
					)
				);

				currentAskLevels = this.orderBookSnapshots[pair].asks.filter(
					ask => ask.price > this.expectedMidPrice.price
				).length;

				totalAskLiquidity = this.getSideTotalLiquidity(
					this.orderBookSnapshots[pair].asks.filter(
						ask => ask.price > this.expectedMidPrice.price
					)
				);
				existingAskPrices = existingAskPrices.filter(
					price => price > this.expectedMidPrice.price
				);
			} else if (this.expectedMidPrice.price < bestBidPrice) {
				await this.takeOneSideOrders(
					pair,
					true,
					this.orderBookSnapshots[pair].bids.filter(
						bid => bid.price >= this.expectedMidPrice.price
					)
				);

				currentBidLevels = this.orderBookSnapshots[pair].bids.filter(
					bid => bid.price < this.expectedMidPrice.price
				).length;
				totalBidLiquidity = this.getSideTotalLiquidity(
					this.orderBookSnapshots[pair].bids.filter(
						bid => bid.price < this.expectedMidPrice.price
					)
				);
				existingBidPrices = existingBidPrices.filter(
					price => price < this.expectedMidPrice.price
				);
			}

			askAmountToCreate = this.getSideAmtToCreate(currentAskLevels, totalAskLiquidity);
			bidAmountToCreate = this.getSideAmtToCreate(currentBidLevels, totalBidLiquidity);
			numOfBidOrdersToPlace = Math.max(3 - currentBidLevels, 1);
			numOfAskOrdersToPlace = Math.max(3 - currentAskLevels, 1);
		}

		util.logInfo(`bidAmountToCreate: ${bidAmountToCreate} numOfBidOrdersToPlace: ${numOfBidOrdersToPlace}
		askAmountToCreate: ${askAmountToCreate} numOfAskOrdersToPlace: ${numOfAskOrdersToPlace}`);

		if (askAmountToCreate > 0 && numOfAskOrdersToPlace > 0)
			await this.createDualTokenOrderBook({
				pair: pair,
				isBid: false,
				midPrice: this.expectedMidPrice.price,
				totalSize: askAmountToCreate,
				numOfOrders: numOfAskOrdersToPlace,
				existingPriceLevel: existingAskPrices
			});
		if (bidAmountToCreate > 0 && numOfBidOrdersToPlace)
			await this.createDualTokenOrderBook({
				pair: pair,
				isBid: true,
				midPrice: this.expectedMidPrice.price,
				totalSize: bidAmountToCreate,
				numOfOrders: numOfBidOrdersToPlace,
				existingPriceLevel: existingBidPrices
			});
		this.isMakingOrder = false;
	}

	public async createDualTokenOrderBook(createOrderBook: ICreateOrderBook) {
		if (!this.relayerClient) {
			util.logDebug('no relayer client, ignore');
			return;
		}

		const {
			pair,
			isBid,
			midPrice,
			totalSize,
			numOfOrders,
			existingPriceLevel
		} = createOrderBook;

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
				try {
					await this.relayerClient.addOrder(
						this.makerAddress,
						pair,
						price,
						isBid ? bidAmt : askAmt,
						isBid,
						util.getExpiryTimestamp(false)
					);
					createdOrder++;
					i++;
					util.sleep(1000);
				} catch (error) {
					util.logDebug('failed to add order');
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
		if (!this.relayerClient) {
			util.logDebug('no relayer client, ignore');
			return;
		}
		console.log('take one side');
		for (const orderLevel of orderBookSide) {
			util.logDebug(
				`taking an  ${isSideBid ? 'bid' : 'ask'} order with price ${
					orderLevel.price
				} amount ${orderLevel.balance}`
			);
			await this.relayerClient.addOrder(
				this.makerAddress,
				pair,
				orderLevel.price,
				orderLevel.balance,
				!isSideBid,
				util.getExpiryTimestamp(false)
			);
			util.sleep(1000);
		}
	}

	public async handleOrderBookUpdate(orderBookSnapshot: IOrderBookSnapshot) {
		this.orderBookSnapshots[orderBookSnapshot.pair] = orderBookSnapshot;
		if (
			!this.isMakingOrder &&
			(this.orderBookSnapshots[orderBookSnapshot.pair].bids.length <
				CST.MIN_ORDER_BOOK_LEVELS ||
				this.orderBookSnapshots[orderBookSnapshot.pair].asks.length <
					CST.MIN_ORDER_BOOK_LEVELS ||
				this.getSideTotalLiquidity(this.orderBookSnapshots[orderBookSnapshot.pair].asks) <
					CST.MIN_SIDE_LIQUIDITY ||
				this.getSideTotalLiquidity(this.orderBookSnapshots[orderBookSnapshot.pair].bids) <
					CST.MIN_SIDE_LIQUIDITY)
		) {
			this.isMakingOrder = true;
			await this.startMakingOrders(orderBookSnapshot.pair);
		}
	}

	public async startProcessing(option: IOption) {
		const mnemonic = require('../keys/mnemomicBot.json');
		const live = option.env === CST.DB_LIVE;
		const web3Util = new Web3Util(null, live, mnemonic[option.token], false);
		this.makerAddress = (await web3Util.getAvailableAddresses())[0];
		this.relayerClient = new RelayerClient(web3Util, option.env);

		this.relayerClient.onInfoUpdate(tokens => {
			if (!this.dualClassWrapper) {
				const aToken = tokens.find(t => t.code === option.token);
				if (!aToken) return;
				const bToken = tokens.find(
					t => t.code !== aToken.code && t.custodian === aToken.custodian
				);
				if (!bToken) return;
				this.tokens = [aToken, bToken];
				this.expectedMidPrice = {
					[aToken.code]: 0,
					[bToken.code]: 0
				};
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

				if (this.relayerClient) {
					this.relayerClient.subscribeOrderBook(
						this.tokens[0].code + '|' + CST.TOKEN_WETH
					);
					this.relayerClient.subscribeOrderBook(
						this.tokens[1].code + '|' + CST.TOKEN_WETH
					);
					this.relayerClient.subscribeOrderHistory(this.makerAddress);
				}
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
			},
			userOrder => {
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
