import {
	assetDataUtils,
	BigNumber,
	ContractWrappers,
	generatePseudoRandomSalt,
	Order,
	orderHashUtils,
	RPCSubprovider,
	signatureUtils,
	SignedOrder,
	SignerType,
	Web3ProviderEngine
} from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import { MnemonicWalletSubprovider } from '@0xproject/subproviders';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
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

	constructor(window: any, live: boolean, mnemonic: string) {
		if (window && typeof window.web3 !== 'undefined') {
			this.web3Wrapper = new Web3Wrapper(window.web3.currentProvider);
			this.wallet = Wallet.MetaMask;
		} else {
			const infura = require('../keys/infura.json');
			const pe = new Web3ProviderEngine();
			pe.addProvider(
				new RPCSubprovider(
					(live ? CST.PROVIDER_INFURA_MAIN : CST.PROVIDER_INFURA_KOVAN) +
						'/' +
						infura.token
				)
			);
			if (!window && mnemonic) {
				const mnemonicWallet = new MnemonicWalletSubprovider({
					mnemonic: mnemonic,
					baseDerivationPath: CST.BASE_DERIVATION_PATH
				});
				pe.addProvider(mnemonicWallet);
			}
			pe.start();
			this.web3Wrapper = new Web3Wrapper(pe);
			this.wallet = window ? Wallet.None : Wallet.Local;
		}

		this.contractWrappers = new ContractWrappers(this.web3Wrapper.getProvider(), {
			networkId: live ? CST.NETWORK_ID_MAIN : CST.NETWORK_ID_KOVAN
		});
	}

	public onWeb3AccountUpdate(onUpdate: (addr: string, network: number) => any) {
		if (this.wallet !== Wallet.MetaMask) return;

		const store = (this.web3Wrapper.getProvider() as any).publicConfigStore;
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
			this.contractWrappers.exchange.getContractAddress()
		);
		order.salt = generatePseudoRandomSalt();

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
