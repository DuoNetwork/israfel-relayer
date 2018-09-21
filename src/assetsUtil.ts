import { BigNumber, ContractWrappers } from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import { TransactionReceiptWithDecodedLogs } from 'ethereum-types';
import * as CST from './constants';
import { providerEngine } from './providerEngine';
import { IOption } from './types';
import util from './util';

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
			default:
				util.log('no such token found');
				return '';
		}
	}

	public async setTokenAllowance(option: IOption): Promise<TransactionReceiptWithDecodedLogs> {
		const TxHash = await this.contractWrappers.erc20Token.setAllowanceAsync(
			this.getTokenAddressFromName(option.token),
			this.makers[option.maker],
			this.makers[option.spender],
			Web3Wrapper.toBaseUnitAmount(new BigNumber(option.amount), 18)
		);
		return await this.web3Wrapper.awaitTransactionSuccessAsync(TxHash);
	}
}
const accountsUtil = new AccountsUtil();
export default accountsUtil;
