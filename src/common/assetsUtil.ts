import { BigNumber, ContractWrappers } from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import { TransactionReceiptWithDecodedLogs } from 'ethereum-types';
import * as CST from '../constants';
import { providerEngine } from '../providerEngine';
import { IOption } from '../types';
import util from '../util';

class AccountsUtil {
	public contractWrappers: ContractWrappers;
	public web3Wrapper: Web3Wrapper;
	public makers: string[] = [];
	public taker: string = '';

	constructor() {
		this.web3Wrapper = new Web3Wrapper(providerEngine);
		this.contractWrappers = new ContractWrappers(providerEngine, {
			networkId: CST.NETWORK_ID_LOCAL
		});
	}

	public async init() {
		const [taker, ...makers] = await this.web3Wrapper.getAvailableAddressesAsync();
		this.taker = taker;
		this.makers = makers;
	}

	public getRandomMaker(): string {
		const index = Math.floor(Math.random() * Math.floor(this.makers.length));
		return this.makers[index];
	}

	public async approveAllMakers(tokenAddress: string) {
		// Allow the 0x ERC20 Proxy to move erc20 token on behalf of makerAccount
		for (const maker of this.makers) {
			const makerZRXApprovalTxHash = await this.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
				tokenAddress,
				maker
			);
			await this.web3Wrapper.awaitTransactionSuccessAsync(makerZRXApprovalTxHash);
		}
	}

	public getTokenAddressFromName(tokenName: string): string {
		switch (tokenName) {
			case CST.TOKEN_ZRX:
				return this.contractWrappers.exchange.getZRXTokenAddress();
			case CST.TOKEN_WETH:
				const ethTokenAddr = this.contractWrappers.etherToken.getContractAddressIfExists();
				if (!ethTokenAddr) {
					util.log('no eth token address');
					return '';
				} else return ethTokenAddr;

			default:
				util.log('no such token found');
				return '';
		}
	}

	public async setTokenAllowance(option: IOption): Promise<TransactionReceiptWithDecodedLogs> {
		const TxHash = await this.contractWrappers.erc20Token.setAllowanceAsync(
			this.getTokenAddressFromName(option.token),
			this.makers[option.maker],
			option.spender
				? this.makers[option.spender]
				: this.contractWrappers.exchange.getContractAddress(),
			Web3Wrapper.toBaseUnitAmount(new BigNumber(option.amount), 18)
		);
		return await this.web3Wrapper.awaitTransactionSuccessAsync(TxHash);
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
		await Promise.all(
			responses.map(tx => {
				return this.web3Wrapper.awaitTransactionSuccessAsync(tx);
			})
		);
	}

	// TODO add from signedOrder to orderHash function
}
const accountsUtil = new AccountsUtil();
export default accountsUtil;
