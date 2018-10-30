import {
	assetDataUtils,
	BigNumber,
	ContractWrappers,
	orderHashUtils,
	signatureUtils,
	SignedOrder
} from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import Web3 from 'web3';
import * as CST from '../common/constants';
import { IStringSignedOrder } from '../common/types';
import infura from '../keys/infura.json';
import util from './util';

export default class Web3Util {
	public contractWrappers: ContractWrappers;
	public web3Wrapper: Web3Wrapper;

	constructor() {
		const provider = new Web3.providers.HttpProvider(
			CST.PROVIDER_INFURA_KOVAN + '/' + infura.token
			// 'http://localhost:8545'
		);
		this.web3Wrapper = new Web3Wrapper(provider);
		this.contractWrappers = new ContractWrappers(provider, {
			networkId: CST.NETWORK_ID_KOVAN
		});
	}

	public getRandomFutureDateInSeconds = () => {
		return new BigNumber(Date.now() + CST.TEN_MINUTES_MS).div(CST.ONE_SECOND_MS).ceil();
	};

	public static stringToBN = (value: string): BigNumber => {
		return new BigNumber(value);
	};

	public static fromWei = (value: BigNumber | string, decimal: number = 18): number => {
		return Number(Web3Wrapper.toUnitAmount(new BigNumber(value), decimal).valueOf());
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
