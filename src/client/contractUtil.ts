// import moment from 'moment';
import DualClassWrapper from '../../../duo-contract-wrapper/src/DualClassWrapper';
import Web3Wrapper from '../../../duo-contract-wrapper/src/Web3Wrapper';
import Web3Util from '../../../israfel-relayer/src/utils/Web3Util';
import * as CST from '../common/constants';
import { IAccounts, IDualClassStates, IOption } from '../common/types';
import util from '../utils/util';

export class ContractUtil {
	public dualClassCustodianWrapper: DualClassWrapper;
	public web3Wrapper: Web3Wrapper;
	public web3Util: Web3Util;

	constructor(web3Util: Web3Util, web3Wrapper: Web3Wrapper, option: IOption) {
		this.web3Wrapper = web3Wrapper;
		this.web3Util = web3Util;
		const { type, tenor } = util.getContractTypeAndTenor(option.token);
		this.dualClassCustodianWrapper = new DualClassWrapper(
			web3Wrapper,
			web3Wrapper.contractAddresses.Custodians[type][tenor].custodian.address
		);
	}

	private getMainAccount(): IAccounts {
		const faucetAccount = require('../keys/faucetAccount.json');

		return {
			address: faucetAccount.publicKey,
			privateKey: faucetAccount.privateKey
		};
	}

	public async estimateDualTokenCreateAmt(ethAmount: number): Promise<number[]> {
		if (!this.dualClassCustodianWrapper || ethAmount <= 0) {
			util.logDebug(`no dualClassWrapper initiated`);
			return [];
		}
		const states: IDualClassStates = await this.dualClassCustodianWrapper.getStates();
		const tokenValueB =
			(((1 - states.createCommRate) * states.resetPrice) / (1 + states.alpha)) * ethAmount;
		const tokenValueA = states.alpha * tokenValueB;
		return [tokenValueA, tokenValueB];
	}

	public async checkBalance(
		pair: string,
		tokenIndex: number,
		addresses: string[]
	): Promise<string[]> {
		const [code1, code2] = pair.split('|');

		for (const address of addresses) {
			const faucetAccount: IAccounts = this.getMainAccount();
			// ethBalance
			const ethBalance = await this.web3Util.getEthBalance(address);
			util.logInfo(`the ethBalance of ${address} is ${ethBalance}`);
			if (ethBalance < CST.MIN_ETH_BALANCE) {
				util.logDebug(
					`the address ${address} current eth balance is ${ethBalance}, make transfer...`
				);

				await this.web3Wrapper.ethTransferRaw(
					faucetAccount.address,
					faucetAccount.privateKey,
					address,
					util.round(CST.MIN_ETH_BALANCE),
					await this.web3Util.getTransactionCount(faucetAccount.address)
				);
			}

			// wEthBalance
			const wEthBalance = await this.web3Util.getTokenBalance(code2, address);
			if (wEthBalance < CST.MIN_WETH_BALANCE) {
				util.logDebug(
					`the address ${address} current weth balance is ${wEthBalance}, wrapping...`
				);
				const amtToWrap = CST.MIN_WETH_BALANCE - wEthBalance + 0.1;

				if (ethBalance < amtToWrap)
					await this.web3Wrapper.ethTransferRaw(
						faucetAccount.address,
						faucetAccount.privateKey,
						address,
						CST.MIN_ETH_BALANCE,
						await this.web3Util.getTransactionCount(faucetAccount.address)
					);

				util.logDebug(`start wrapping for ${address} with amt ${amtToWrap}`);
				await this.web3Util.wrapEther(util.round(amtToWrap), address);
			}

			// wETHallowance
			const wethAllowance = await this.web3Util.getProxyTokenAllowance(code2, address);
			util.logDebug(`tokenAllowande of token ${code2} is ${wethAllowance}`);
			if (wethAllowance <= 0) {
				util.logDebug(
					`the address ${address} token allowance of ${code2} is 0, approvaing.....`
				);
				await this.web3Util.setUnlimitedTokenAllowance(code2, address);
			}

			// tokenBalance
			const tokenBalance = await this.web3Util.getTokenBalance(code1, address);
			util.logDebug(`the ${code1} tokenBalance of ${address} is ${tokenBalance}`);
			const accountsBot: IAccounts[] = require('../keys/accountsBot.json');
			const account = accountsBot.find(a => a.address === address);
			const gasPrice = Math.max(
				await this.web3Util.getGasPrice(),
				CST.DEFAULT_GAS_PRICE * Math.pow(10, 9)
			);
			if (tokenBalance < CST.MIN_TOKEN_BALANCE) {
				util.logDebug(
					`the address ${address} current token balance of ${code1} is ${tokenBalance}, need create more tokens...`
				);

				const tokenAmtToCreate = await this.estimateDualTokenCreateAmt(
					ethBalance - CST.MIN_ETH_BALANCE - 0.1
				);
				if (tokenAmtToCreate[tokenIndex] + tokenBalance <= CST.MIN_TOKEN_BALANCE)
					await this.web3Wrapper.ethTransferRaw(
						faucetAccount.address,
						faucetAccount.privateKey,
						address,
						CST.MIN_ETH_BALANCE,
						await this.web3Util.getTransactionCount(faucetAccount.address)
					);

				util.logDebug(`creating token ${code1}`);
				if (account)
					await this.dualClassCustodianWrapper.createRaw(
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
			} else if (tokenBalance >= CST.MAX_TOKEN_BALANCE) {
				util.logDebug(
					`the address ${address} current token balance of ${code1} is ${tokenBalance}, need redeem back...`
				);
				if (account) {
					const states: IDualClassStates = await this.dualClassCustodianWrapper.getStates();
					await this.dualClassCustodianWrapper.redeemRaw(
						address,
						account.privateKey,
						tokenBalance - CST.MAX_TOKEN_BALANCE,
						(tokenBalance - CST.MAX_TOKEN_BALANCE) / states.alpha,
						gasPrice,
						CST.REDEEM_GAS
					);
				}
			}

			const tokenAllowance = await this.web3Util.getProxyTokenAllowance(code1, address);
			util.logInfo(`tokenAllowande of token ${code1} is ${tokenAllowance}`);
			if (tokenAllowance <= 0) {
				util.logInfo(
					`the address ${address} token allowance of ${code1} is 0, approvaing.....`
				);
				await this.web3Util.setUnlimitedTokenAllowance(code1, address);
			}
		}

		return addresses;
	}
}
