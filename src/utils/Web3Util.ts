// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';

import {
	assetDataUtils,
	BigNumber,
	ContractAddresses,
	ContractWrappers,
	generatePseudoRandomSalt,
	Order,
	orderHashUtils,
	RPCSubprovider,
	signatureUtils,
	SignedOrder,
	Web3ProviderEngine
} from '0x.js';
import { getContractAddressesForNetworkOrThrow } from '@0x/contract-addresses';
import { schemas, SchemaValidator } from '@0x/json-schemas';
import { MetamaskSubprovider, PrivateKeyWalletSubprovider } from '@0x/subproviders';
import { Web3Wrapper } from '@0x/web3-wrapper';
import * as CST from '../common/constants';
import { IRawOrder, IStringSignedOrder } from '../common/types';
import util from './util';

export enum Wallet {
	None,
	Local,
	MetaMask,
	Ledger
}

export default class Web3Util {
	public contractWrappers: ContractWrappers;
	public web3Wrapper: Web3Wrapper;
	public wallet: Wallet = Wallet.None;
	public accountIndex: number = 0;
	public networkId: number = CST.NETWORK_ID_KOVAN;
	private rawMetamaskProvider: any = null;
	public contractAddresses: ContractAddresses;

	constructor(window: any, live: boolean, privateKey: string, local: boolean) {
		this.networkId = live ? CST.NETWORK_ID_MAIN : CST.NETWORK_ID_KOVAN;
		if (window && typeof window.web3 !== 'undefined') {
			this.rawMetamaskProvider = window.web3.currentProvider;
			this.web3Wrapper = new Web3Wrapper(
				new MetamaskSubprovider(window.web3.currentProvider)
			);
			this.wallet = Wallet.MetaMask;
		} else {
			const pe = new Web3ProviderEngine();
			if (local) pe.addProvider(new RPCSubprovider(CST.PROVIDER_LOCAL));
			else {
				if (!window && privateKey)
					pe.addProvider(new PrivateKeyWalletSubprovider(privateKey));
				const infura = require('../keys/infura.json');
				pe.addProvider(
					new RPCSubprovider(
						(live ? CST.PROVIDER_INFURA_MAIN : CST.PROVIDER_INFURA_KOVAN) +
							'/' +
							infura.token
					)
				);
			}
			pe.start();
			this.web3Wrapper = new Web3Wrapper(pe);
			this.wallet = local || (!window && privateKey) ? Wallet.Local : Wallet.None;
		}

		this.contractWrappers = new ContractWrappers(this.web3Wrapper.getProvider(), {
			networkId: this.networkId
		});

		this.contractAddresses = getContractAddressesForNetworkOrThrow(this.networkId);
	}

	public onWeb3AccountUpdate(onUpdate: (addr: string, network: number) => any) {
		if (this.wallet !== Wallet.MetaMask) return;

		const store = this.rawMetamaskProvider.publicConfigStore;
		if (store)
			store.on('update', () => {
				onUpdate(
					store.getState().selectedAddress || '',
					Number(store.getState().networkVersion || '')
				);
			});
	}

	public async getCurrentAddress(): Promise<string> {
		const accounts = await this.web3Wrapper.getAvailableAddressesAsync();
		return accounts[this.accountIndex] || CST.DUMMY_ADDR;
	}

	public getCurrentNetwork(): Promise<number> {
		return this.web3Wrapper.getNetworkIdAsync();
	}

	public static createRawOrderWithoutSalt(
		userAddr: string,
		relayerAddr: string,
		makerAssetAddr: string,
		takerAssetAddr: string,
		makerAmt: number,
		takerAmt: number,
		expInSeconds: number,
		exchangeAddr: string
	): Order {
		return {
			senderAddress: CST.DUMMY_ADDR,
			makerAddress: userAddr.toLowerCase(),
			takerAddress: relayerAddr.toLowerCase(),
			makerFee: new BigNumber(0),
			takerFee: new BigNumber(0),
			makerAssetAmount: Web3Wrapper.toBaseUnitAmount(new BigNumber(makerAmt), 18),
			takerAssetAmount: Web3Wrapper.toBaseUnitAmount(new BigNumber(takerAmt), 18),
			makerAssetData: assetDataUtils.encodeERC20AssetData(makerAssetAddr),
			takerAssetData: assetDataUtils.encodeERC20AssetData(takerAssetAddr),
			salt: new BigNumber(0),
			exchangeAddress: exchangeAddr.toLowerCase(),
			feeRecipientAddress: relayerAddr.toLowerCase(),
			expirationTimeSeconds: new BigNumber(expInSeconds)
		};
	}

	public async createRawOrder(
		userAddr: string,
		relayerAddr: string,
		makerAssetAddr: string,
		takerAssetAddr: string,
		makerAmt: number,
		takerAmt: number,
		expInSeconds: number
	): Promise<IRawOrder> {
		if (this.wallet !== Wallet.MetaMask) Promise.reject('cannot sign');
		const order = Web3Util.createRawOrderWithoutSalt(
			userAddr,
			relayerAddr,
			makerAssetAddr,
			takerAssetAddr,
			makerAmt,
			takerAmt,
			expInSeconds,
			this.contractWrappers.exchange.address
		);
		order.salt = generatePseudoRandomSalt();

		const orderHash = orderHashUtils.getOrderHashHex(order);
		const signedOrder = await signatureUtils.ecSignOrderAsync(
			this.web3Wrapper.getProvider(),
			order,
			order.makerAddress
		);
		return {
			orderHash: orderHash,
			signedOrder: signedOrder
		};
	}

	public static stringToBN = (value: string): BigNumber => {
		return new BigNumber(value);
	};

	public static fromWei = (value: BigNumber | string): number => {
		return Number(Web3Wrapper.toUnitAmount(new BigNumber(value), 18).valueOf());
	};

	public static toWei = (value: BigNumber | string): number => {
		return Number(Web3Wrapper.toWei(new BigNumber(value)).valueOf());
	};

	public assetDataToTokenName(assetData: string): string {
		const tokenAddr = assetDataUtils.decodeERC20AssetData(assetData).tokenAddress;
		if (tokenAddr === this.contractAddresses.etherToken) return CST.TOKEN_WETH;
		else if (tokenAddr === this.contractAddresses.zrxToken) return CST.TOKEN_ZRX;
		return ''; // TODO: read from db
	}

	public getSideFromSignedOrder(order: SignedOrder | IStringSignedOrder, pair: string): string {
		return this.assetDataToTokenName(order.takerAssetData) === pair.split('-')[0]
			? CST.DB_BID
			: CST.DB_ASK;
	}

	public static getPriceFromSignedOrder = (order: IStringSignedOrder, side: string): number => {
		const isBid = side === CST.DB_BID;
		return util.round(
			Web3Util.stringToBN(isBid ? order.makerAssetAmount : order.takerAssetAmount)
				.div(isBid ? order.takerAssetAmount : order.makerAssetAmount)
				.valueOf()
		);
	};

	public async validateOrder(signedOrder: SignedOrder): Promise<string> {
		const { orderSchema } = schemas;
		const { signature, ...order } = signedOrder;
		const validator = new SchemaValidator();
		if (!validator.validate(order, orderSchema).valid) {
			util.logDebug('invalid schema ' + JSON.stringify(signedOrder));
			return '';
		}

		const orderHash = orderHashUtils.getOrderHashHex(order);
		const isValidSig = await signatureUtils.isValidSignatureAsync(
			this.web3Wrapper.getProvider(),
			orderHash,
			signature,
			order.makerAddress
		);
		if (!isValidSig) {
			util.logDebug('invalid signature ' + orderHash);
			return '';
		}

		return orderHash;
	}

	public getTokenAddressFromName(tokenName: string): string {
		switch (tokenName) {
			case CST.TOKEN_ZRX:
				return this.contractAddresses.zrxToken;
			case CST.TOKEN_WETH:
				const ethTokenAddr = this.contractAddresses.etherToken;
				if (!ethTokenAddr) {
					util.logInfo('no eth token address');
					return '';
				} else return ethTokenAddr;

			default:
				util.logInfo('no such token found');
				return '';
		}
	}

	public async setUnlimitedTokenAllowance(tokenName: string) {
		let tokenAddress = '';
		if (tokenName === CST.TOKEN_WETH) tokenAddress = this.contractAddresses.etherToken;
		else if (tokenName === CST.TOKEN_ZRX) tokenAddress = this.contractAddresses.zrxToken;
		// TODO: read from DB
		// else if (CST.REVERSE_TOKEN_MAPPING[tokenName])
		// 	tokenAddress = CST.REVERSE_TOKEN_MAPPING[tokenName];
		if (tokenAddress)
			return this.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
				tokenAddress,
				await this.getCurrentAddress()
			);
		return Promise.resolve();
	}

	public async getProxyTokenAllowance(tokenName: string, ownerAddr: string) {
		let tokenAddress = '';
		if (tokenName === CST.TOKEN_WETH) tokenAddress = this.contractAddresses.etherToken;
		else if (tokenName === CST.TOKEN_ZRX) tokenAddress = this.contractAddresses.zrxToken;

		if (tokenAddress)
			return this.contractWrappers.erc20Token.getProxyAllowanceAsync(
				tokenAddress,
				ownerAddr.toLowerCase()
			);
		return Promise.resolve();
	}

	public async setProxyAllowance(tokenAddress: string, amount: number) {
		this.contractWrappers.erc20Token.setProxyAllowanceAsync(
			tokenAddress,
			await this.getCurrentAddress(),
			Web3Wrapper.toWei(new BigNumber(amount))
		);
	}

	public async getEthBalance(address: string) {
		const balance = await this.web3Wrapper.getBalanceInWeiAsync(address);
		util.logInfo('balnace of ' + address + 'is ' + Web3Util.fromWei(balance));
	}

	public async wrapEther(amount: number) {
		return this.contractWrappers.etherToken.depositAsync(
			this.contractAddresses.etherToken,
			Web3Wrapper.toWei(new BigNumber(amount)),
			await this.getCurrentAddress()
		);
	}

	public async unwrapEther(amount: number) {
		return this.contractWrappers.etherToken.withdrawAsync(
			this.contractAddresses.etherToken,
			Web3Wrapper.toWei(new BigNumber(amount)),
			await this.getCurrentAddress()
		);
	}

	public async validateOrderFillable(signedOrder: SignedOrder): Promise<boolean> {
		try {
			await this.contractWrappers.exchange.validateOrderFillableOrThrowAsync(signedOrder, {
				expectedFillTakerTokenAmount: new BigNumber(0)
			});
			return true;
		} catch (err) {
			util.logDebug('invalid order');
			util.logDebug(JSON.stringify(err));
			return false;
		}
	}
}
