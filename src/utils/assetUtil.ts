import { assetDataUtils, BigNumber, SignedOrder } from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import { TransactionReceiptWithDecodedLogs } from 'ethereum-types';
import * as CST from '../common/constants';
import { IOption, IStringSignedOrder } from '../common/types';
import util from './util';
import Web3Util from './web3Util';

class AssetUtil {
	private web3Util: Web3Util | null = null;
	public makers: string[] = [];
	public taker: string = '';

	public async init(web3Util: Web3Util) {
		this.web3Util = web3Util;
		const [taker, ...makers] = await this.web3Util.web3Wrapper.getAvailableAddressesAsync();
		this.taker = taker;
		this.makers = makers;
	}

	public getRandomMaker(): string {
		const index = Math.floor(Math.random() * Math.floor(this.makers.length));
		return this.makers[index];
	}

	public async approveAllMakers(tokenAddress: string) {
		if (!this.web3Util) return;
		// Allow the 0x ERC20 Proxy to move erc20 token on behalf of makerAccount
		for (const maker of this.makers) {
			const makerZRXApprovalTxHash = await this.web3Util.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
				tokenAddress,
				maker
			);
			await this.web3Util.web3Wrapper.awaitTransactionSuccessAsync(makerZRXApprovalTxHash);
		}
	}

	public assetDataToTokenName(assetData: string): string {
		const tokenAddr = assetDataUtils.decodeERC20AssetData(assetData).tokenAddress;
		return CST.TOKEN_MAPPING[tokenAddr];
	}

	public getSideFromSignedOrder(order: SignedOrder | IStringSignedOrder, pair: string): string {
		return this.assetDataToTokenName(order.takerAssetData) === pair.split('-')[0]
			? CST.DB_BID
			: CST.DB_ASK;
	}

	public getTokenAddressFromName(tokenName: string): string {
		if (!this.web3Util) return '';
		switch (tokenName) {
			case CST.TOKEN_ZRX:
				return this.web3Util.contractWrappers.exchange.getZRXTokenAddress();
			case CST.TOKEN_WETH:
				const ethTokenAddr = this.web3Util.contractWrappers.etherToken.getContractAddressIfExists();
				if (!ethTokenAddr) {
					util.logInfo('no eth token address');
					return '';
				} else return ethTokenAddr;

			default:
				util.logInfo('no such token found');
				return '';
		}
	}

	public async setTokenAllowance(option: IOption): Promise<TransactionReceiptWithDecodedLogs> {
		if (!this.web3Util) throw new Error('error');
		const TxHash = await this.web3Util.contractWrappers.erc20Token.setAllowanceAsync(
			this.getTokenAddressFromName(option.token),
			this.makers[option.maker],
			option.spender
				? this.makers[option.spender]
				: this.web3Util.contractWrappers.exchange.getContractAddress(),
			Web3Wrapper.toBaseUnitAmount(new BigNumber(option.amount), 18)
		);
		return await this.web3Util.web3Wrapper.awaitTransactionSuccessAsync(TxHash);
	}

	public setAllUnlimitedAllowance(tokenAddr: string, addrs: string[]): Array<Promise<string>> {
		return addrs.map(
			address =>
				this.web3Util
					? this.web3Util.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
							tokenAddr,
							address
					)
					: Promise.reject()
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
		await Promise.all(
			responses.map(
				tx =>
					this.web3Util
						? this.web3Util.web3Wrapper.awaitTransactionSuccessAsync(tx)
						: Promise.reject()
			)
		);
	}

	// TODO add from signedOrder to orderHash function
}
const assetUtil = new AssetUtil();
export default assetUtil;
