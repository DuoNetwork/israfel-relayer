import { BigNumber } from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import { TransactionReceiptWithDecodedLogs } from 'ethereum-types';
import { IOption } from '../common/types';
import Web3Util from './Web3Util1';

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

	public async setTokenAllowance(option: IOption): Promise<TransactionReceiptWithDecodedLogs> {
		if (!this.web3Util) throw new Error('error');
		const TxHash = await this.web3Util.contractWrappers.erc20Token.setAllowanceAsync(
			this.web3Util.getTokenAddressFromName(option.token),
			this.makers[option.maker],
			option.spender
				? this.makers[option.spender]
				: this.web3Util.contractWrappers.exchange.getContractAddress(),
			Web3Wrapper.toBaseUnitAmount(new BigNumber(option.amount), 18)
		);
		return await this.web3Util.web3Wrapper.awaitTransactionSuccessAsync(TxHash);
	}
}
const assetUtil = new AssetUtil();
export default assetUtil;
