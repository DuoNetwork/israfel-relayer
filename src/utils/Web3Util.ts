import {
	assetDataUtils,
	BigNumber,
	ContractWrappers,
	generatePseudoRandomSalt,
	orderHashUtils,
	signatureUtils,
	SignedOrder,
	SignerType
} from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import { RPCSubprovider, SignerSubprovider, Web3ProviderEngine } from '@0xproject/subproviders';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import Web3 from 'web3';
import * as CST from '../common/constants';
import { IRawOrder, IStringSignedOrder,  } from '../common/types';
import util from './util';

export enum Wallet {
	None,
	MetaMask,
	Ledger
}

export default class Web3Util {
	public contractWrappers: ContractWrappers;
	public web3Wrapper: Web3Wrapper;
	public wallet: Wallet = Wallet.None;

	constructor(window: any, live: boolean) {
		if (window && typeof window.web3 !== 'undefined') {
			const providerEngine = new Web3ProviderEngine();
			providerEngine.addProvider(new SignerSubprovider(window.web3.currentProvider));
			providerEngine.addProvider(
				new RPCSubprovider(live ? CST.PROVIDER_INFURA_MAIN : CST.PROVIDER_INFURA_KOVAN)
			);
			providerEngine.start();
			this.web3Wrapper = new Web3Wrapper(providerEngine);
			this.wallet = Wallet.MetaMask;
		} else {
			this.web3Wrapper = new Web3Wrapper(
				new Web3.providers.HttpProvider(
					live ? CST.PROVIDER_INFURA_MAIN : CST.PROVIDER_INFURA_KOVAN
				)
			);
			this.wallet = Wallet.None;
		}

		this.contractWrappers = new ContractWrappers(this.web3Wrapper.getProvider(), {
			networkId: live ? CST.NETWORK_ID_MAIN : CST.NETWORK_ID_KOVAN
		});
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
		const order = {
			senderAddress: relayerAddr,
			makerAddress: userAddr,
			takerAddress: relayerAddr,
			makerFee: new BigNumber(0),
			takerFee: new BigNumber(0),
			makerAssetAmount: Web3Wrapper.toBaseUnitAmount(new BigNumber(makerAmt), 18),
			takerAssetAmount: Web3Wrapper.toBaseUnitAmount(new BigNumber(takerAmt), 18),
			makerAssetData: assetDataUtils.encodeERC20AssetData(makerAssetAddr),
			takerAssetData: assetDataUtils.encodeERC20AssetData(takerAssetAddr),
			salt: generatePseudoRandomSalt(),
			exchangeAddress: this.contractWrappers.exchange.getContractAddress(),
			feeRecipientAddress: relayerAddr,
			expirationTimeSeconds: new BigNumber(expInSeconds)
		};

		const orderHash = orderHashUtils.getOrderHashHex(order);
		const signature = await signatureUtils.ecSignOrderHashAsync(
			this.web3Wrapper.getProvider(),
			orderHash,
			order.makerAddress,
			SignerType.Metamask
		);
		return {
			orderHash: orderHash,
			signedOrder: { ...order, signature }
		};
	}

	public static getRandomFutureDateInSeconds = () => {
		return new BigNumber(Date.now() + CST.TEN_MINUTES_MS).div(CST.ONE_SECOND_MS).ceil();
	};

	public static stringToBN = (value: string): BigNumber => {
		return new BigNumber(value);
	};

	public static fromWei = (value: BigNumber | string): number => {
		return Number(Web3Wrapper.toUnitAmount(new BigNumber(value), 18).valueOf());
	};

	public static toWei = (value: BigNumber | string): number => {
		return Number(Web3Wrapper.toWei(new BigNumber(value)).valueOf());
	};

	public static assetDataToTokenName = (assetData: string): string => {
		const tokenAddr = assetDataUtils.decodeERC20AssetData(assetData).tokenAddress;
		return CST.TOKEN_MAPPING[tokenAddr];
	};

	public static getSideFromSignedOrder = (
		order: SignedOrder | IStringSignedOrder,
		pair: string
	): string => {
		return Web3Util.assetDataToTokenName(order.takerAssetData) === pair.split('-')[0]
			? CST.DB_BID
			: CST.DB_ASK;
	};

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
				return this.contractWrappers.exchange.getZRXTokenAddress();
			case CST.TOKEN_WETH:
				const ethTokenAddr = this.contractWrappers.etherToken.getContractAddressIfExists();
				if (!ethTokenAddr) {
					util.logInfo('no eth token address');
					return '';
				} else return ethTokenAddr;

			default:
				util.logInfo('no such token found');
				return '';
		}
	}

	public setAllUnlimitedAllowance(tokenAddr: string, addrs: string[]): Array<Promise<string>> {
		return addrs.map(address =>
			this.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(tokenAddr, address)
		);
	}

	public async setBaseQuoteAllowance(
		baseTokenAddr: string,
		quoteTokenAddr: string,
		addrs: string[]
	): Promise<void> {
		const responses = await Promise.all(
			this.setAllUnlimitedAllowance(quoteTokenAddr, addrs).concat(
				this.setAllUnlimitedAllowance(baseTokenAddr, addrs)
			)
		);
		await Promise.all(responses.map(tx => this.web3Wrapper.awaitTransactionSuccessAsync(tx)));
	}
}
