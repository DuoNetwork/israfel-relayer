// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';

import { Web3Wrapper } from '@0x/web3-wrapper';
import { BigNumber } from 'bignumber.js';
import util from '../../../duo-admin/src/utils/util';
import { Wallet } from '../common/types';
import orderUtil from './orderUtil';
import Web3Util from './Web3Util';

// jest.mock('web3-utils');
jest.mock('@0x/subproviders', () => ({
	MetamaskSubprovider: jest.fn(),
	MnemonicWalletSubprovider: jest.fn()
}));

jest.mock('@0x/json-schemas', () => ({
	schemas: {},
	SchemaValidator: jest.fn(() => ({
		validate: jest.fn(() => ({
			valid: true
		}))
	}))
}));

jest.mock('0x.js', () => ({
	ContractWrappers: jest.fn(() => ({
		exchange: {
			matchOrdersAsync: jest.fn(),
			getFilledTakerAssetAmountAsync: jest.fn(),
			validateOrderFillableOrThrowAsync: jest.fn(() => Promise.resolve(true))
		},
		erc20Token: {
			setUnlimitedAllowanceAsync: jest.fn(),
			setUnlimitedProxyAllowanceAsync: jest.fn(),
			getAllowanceAsync: jest.fn(),
			getProxyAllowanceAsync: jest.fn(),
			getBalanceAsync: jest.fn(),
			transferAsync: jest.fn(),
			transferFromAsync: jest.fn()
		},
		etherToken: {
			depositAsync: jest.fn(),
			withdrawAsync: jest.fn()
		}
	})),
	Web3ProviderEngine: jest.fn(
		() =>
			({
				addProvider: jest.fn(),
				start: jest.fn()
			} as any)
	),
	RPCSubprovider: jest.fn(),
	BigNumber: BigNumber,
	BlockParamLiteral: {
		Latest: 'latest'
	},
	orderHashUtils: {
		getOrderHashHex: jest.fn(() => 'orderHash')
	},
	signatureUtils: {
		isValidSignatureAsync: jest.fn(() => Promise.resolve(true))
	}
}));

jest.mock('@0x/contract-addresses', () => ({
	getContractAddressesForNetworkOrThrow: jest.fn(() => ({
		erc20Proxy: '0xf1ec01d6236d3cd881a0bf0130ea25fe4234003e',
		erc721Proxy: '0x2a9127c745688a165106c11cd4d647d2220af821',
		zrxToken: '0x2002d3812f58e35f0ea1ffbf80a75a38c32175fa',
		etherToken: '0xd0a1e359811322d97991e03f863a0c30c2cf029c',
		exchange: '0x35dd2932454449b14cee11a94d3674a936d5d7b2',
		assetProxyOwner: '0x2c824d2882baa668e0d5202b1e7f2922278703f8',
		forwarder: '0x17992e4ffb22730138e4b62aaa6367fa9d3699a6',
		orderValidator: '0xb389da3d204b412df2f75c6afb3d0a7ce0bc283d'
	}))
}));

jest.mock('@0x/web3-wrapper', () => ({
	Web3Wrapper: jest.fn(() => ({
		getProvider: jest.fn(() => 'provider'),
		toBaseUnitAmount: jest.fn(value => value * 1e18),
		getAvailableAddressesAsync: jest.fn(() => Promise.resolve(['addr1', 'addr2'])),
		getNetworkIdAsync: jest.fn(() => Promise.resolve(42)),
		getBalanceInWeiAsync: jest.fn(),
		awaitTransactionSuccessAsync: jest.fn(),
		getTransactionReceiptIfExistsAsync: jest.fn()
	})),
	toBaseUnitAmount: jest.fn(value => value * 1e18)
}));

jest.mock('web3-eth', () => {
	return jest.fn().mockImplementation(() => {
		return {
			getGasPrice: jest.fn(() => 1000000000),
			getTransactionCount: jest.fn(() => 10)
		};
	});
});
jest.mock('web3-eth-accounts', () => {
	return jest.fn().mockImplementation(() => {
		return {
			recover: jest.fn()
		};
	});
});
jest.mock('web3-eth-personal', () => {
	return jest.fn().mockImplementation(() => {
		return {
			sign: jest.fn()
		};
	});
});

test('constructor, with window, metaMask', () => {
	const window = {
		web3: {
			currentProvider: 'provider'
		}
	} as any;
	const testWeb3Util = new Web3Util(window, false, 'mnemonic', false);
	expect(testWeb3Util.wallet).toMatchSnapshot();
});

test('constructor, with window, metaMask, live', () => {
	const window = {
		web3: {
			currentProvider: 'provider'
		}
	} as any;
	const testWeb3Util = new Web3Util(window, true, 'mnemonic', false);
	expect(testWeb3Util.wallet).toMatchSnapshot();
});

test('constructor, no window, local', () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', true);
	expect(testWeb3Util.wallet).toMatchSnapshot();
});

test('constructor, no window, non local', () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	expect(testWeb3Util.wallet).toMatchSnapshot();
});

test('constructor, no window, non local, live', () => {
	const testWeb3Util = new Web3Util(null, true, 'mnemonic', false);
	expect(testWeb3Util.wallet).toMatchSnapshot();
});

test('constructor, no window, non local, no mnemonic', () => {
	const testWeb3Util = new Web3Util(null, false, '', false);
	expect(testWeb3Util.wallet).toMatchSnapshot();
});

test('getTokenByCode', () => {
	const window = {
		web3: {
			currentProvider: 'provider'
		}
	} as any;
	const testWeb3Util = new Web3Util(window, false, 'mnemonic', false);
	testWeb3Util.tokens = [{ code: 'code' }] as any;
	expect(testWeb3Util.getTokenByCode('code')).toMatchSnapshot();
});

test('getProvider', () => {
	const window = {
		web3: {
			currentProvider: 'provider'
		}
	} as any;
	const testWeb3Util = new Web3Util(window, false, 'mnemonic', false);
	expect(testWeb3Util.getProvider()).toMatchSnapshot();
});

test('getGasPrice', () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	expect(testWeb3Util.getGasPrice()).toMatchSnapshot();
});

test('getTransactionCount', () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	expect(testWeb3Util.getTransactionCount('addr')).toMatchSnapshot();
});

test('getAvailableAddresses', async () => {
	const window = {
		web3: {
			currentProvider: 'provider'
		}
	} as any;
	const testWeb3Util = new Web3Util(window, false, 'mnemonic', false);
	expect(await testWeb3Util.getAvailableAddresses()).toMatchSnapshot();
});

test('matchOrders', async () => {
	const window = {
		web3: {
			currentProvider: 'provider'
		}
	} as any;
	const testWeb3Util = new Web3Util(window, false, 'mnemonic', false);
	const leftOrder = { leftOrder: 'leftOrder' } as any;
	const rightOrder = { rightOrder: 'rightOrder' } as any;

	await testWeb3Util.matchOrders(leftOrder, rightOrder, 'senderAddr');
	expect(
		(testWeb3Util.contractWrappers.exchange.matchOrdersAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('getFilledTakerAssetAmount', async () => {
	const window = {
		web3: {
			currentProvider: 'provider'
		}
	} as any;
	const testWeb3Util = new Web3Util(window, false, 'mnemonic', false);
	await testWeb3Util.getFilledTakerAssetAmount('orderHash');
	expect(
		(testWeb3Util.contractWrappers.exchange.getFilledTakerAssetAmountAsync as jest.Mock).mock
			.calls
	).toMatchSnapshot();
});

test('web3PersonalSign, reject', async () => {
	const window = {
		web3: {
			currentProvider: 'provider'
		}
	} as any;
	const testWeb3Util = new Web3Util(window, false, 'mnemonic', false);
	testWeb3Util.wallet = Wallet.None;
	try {
		await testWeb3Util.web3PersonalSign('account', 'message');
	} catch (err) {
		expect(err).toMatchSnapshot();
	}
});

test('web3PersonalSign', async () => {
	const window = {
		web3: {
			currentProvider: 'provider'
		}
	} as any;
	const testWeb3Util = new Web3Util(window, false, 'mnemonic', false);
	await testWeb3Util.web3PersonalSign('account', 'message');
	expect((testWeb3Util.web3Personal.sign as jest.Mock).mock.calls).toMatchSnapshot();
});

test('web3AccountsRecover, no web3Accounts', async () => {
	const window = {
		web3: {
			currentProvider: 'provider'
		}
	} as any;
	const testWeb3Util = new Web3Util(window, false, 'mnemonic', false);
	testWeb3Util.web3Accounts = null;
	expect(await testWeb3Util.web3AccountsRecover('message', 'signature')).toMatchSnapshot();
});

test('web3AccountsRecover', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	await testWeb3Util.web3AccountsRecover('message', 'signature');
	expect((testWeb3Util.web3Accounts.recover as jest.Mock).mock.calls).toMatchSnapshot();
});

test('setTokens', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	const tokens = [
		{
			custodian: 'custodian',
			address: 'address',
			code: 'code1',
			denomination: 1,
			precisions: {
				WETH: 0.0001
			},
			feeSchedules: {
				WETH: {
					minimum: 0.1,
					rate: 0
				}
			}
		},
		{
			custodian: 'custodian',
			address: 'address',
			code: 'code2',
			denomination: 1,
			precisions: {
				WETH: 0.0001
			},
			feeSchedules: {
				WETH: {
					minimum: 0.1,
					rate: 0
				}
			}
		}
	];
	await testWeb3Util.setTokens(tokens);
	expect(testWeb3Util.tokens).toMatchSnapshot();
});

test('getCurrentAddress', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	expect(await testWeb3Util.getCurrentAddress()).toMatchSnapshot();
});

test('getCurrentNetwork', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	expect(await testWeb3Util.getCurrentNetwork()).toMatchSnapshot();
});

const signedOrder = {
	senderAddress: 'senderAddress',
	makerAddress: 'makerAddress',
	takerAddress: 'takerAddress',
	makerFee: '0',
	takerFee: '0',
	makerAssetAmount: '123000000000000000000',
	takerAssetAmount: '456000000000000000000',
	makerAssetData: 'makerAssetData',
	takerAssetData: 'takerAssetData',
	salt: '789',
	exchangeAddress: 'exchangeAddress',
	feeRecipientAddress: 'feeRecipientAddress',
	expirationTimeSeconds: '1234567890',
	signature: 'signature'
};
test('validateOrder', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	expect(
		await testWeb3Util.validateOrder(orderUtil.parseSignedOrder(signedOrder))
	).toMatchSnapshot();
});

test('getTokenAddressFromCode', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	expect(await testWeb3Util.getTokenAddressFromCode('WETH')).toMatchSnapshot();
});

test('getTokenAddressFromCode, other token', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenByCode = jest.fn(() => ({
		address: 'otherTokenAddress'
	}));
	expect(await testWeb3Util.getTokenAddressFromCode('code')).toMatchSnapshot();
});

test('setUnlimitedTokenAllowance, no tokenAddress', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	try {
		await testWeb3Util.setUnlimitedTokenAllowance('code', 'account', 'spender');
	} catch (err) {
		expect(err).toMatchSnapshot();
	}
});

test('setUnlimitedTokenAllowance, with spender', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenAddressFromCode = jest.fn(() => 'tokenAddress');
	await testWeb3Util.setUnlimitedTokenAllowance('code', 'account', 'spender');
	expect(
		(testWeb3Util.contractWrappers.erc20Token.setUnlimitedAllowanceAsync as jest.Mock).mock
			.calls
	).toMatchSnapshot();
});

test('setUnlimitedTokenAllowance, no spender', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenAddressFromCode = jest.fn(() => 'tokenAddress');
	await testWeb3Util.setUnlimitedTokenAllowance('code', 'account');
	expect(
		(testWeb3Util.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync as jest.Mock).mock
			.calls
	).toMatchSnapshot();
});

test('getTokenAllowance, no tokenAddress', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	expect(await testWeb3Util.getTokenAllowance('code', 'ownerAddr', 'spender')).toMatchSnapshot();
});

test('getTokenAllowance, with spender', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenAddressFromCode = jest.fn(() => 'tokenAddress');
	Web3Util.fromWei = jest.fn();
	await testWeb3Util.getTokenAllowance('code', 'ownerAddr', 'spender');
	expect(
		(testWeb3Util.contractWrappers.erc20Token.getAllowanceAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('getTokenAllowance, no spender', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenAddressFromCode = jest.fn(() => 'tokenAddress');
	Web3Util.fromWei = jest.fn();
	await testWeb3Util.getTokenAllowance('code', 'ownerAddr');
	expect(
		(testWeb3Util.contractWrappers.erc20Token.getProxyAllowanceAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('getEthBalance', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	Web3Util.fromWei = jest.fn();
	await testWeb3Util.getEthBalance('address');
	expect(
		(testWeb3Util.web3Wrapper.getBalanceInWeiAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('getTokenBalance, with tokenAddress', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenAddressFromCode = jest.fn(() => 'tokenAddress');
	Web3Util.fromWei = jest.fn();
	await testWeb3Util.getTokenBalance('code', 'address');
	expect(
		(testWeb3Util.contractWrappers.erc20Token.getBalanceAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('getTokenBalance, no tokenAddress', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenAddressFromCode = jest.fn(() => '');
	Web3Util.fromWei = jest.fn();

	expect(await testWeb3Util.getTokenBalance('code', 'address')).toMatchSnapshot();
});

test('wrapEther', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.contractAddresses = {
		etherToken: 'etherTokenAddress'
	} as any;
	Web3Wrapper.toWei = jest.fn(() => 10000000000000000000);
	await testWeb3Util.wrapEther(1, 'address');
	expect(
		(testWeb3Util.contractWrappers.etherToken.depositAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('unwrapEther', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.contractAddresses = {
		etherToken: 'etherTokenAddress'
	} as any;
	Web3Wrapper.toWei = jest.fn(() => 10000000000000000000);
	await testWeb3Util.unwrapEther(1, 'address');
	expect(
		(testWeb3Util.contractWrappers.etherToken.withdrawAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('validateOrderFillable', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	expect(
		await testWeb3Util.validateOrderFillable(orderUtil.parseSignedOrder(signedOrder))
	).toBeTruthy();
});

test('isValidPair, codes.length wrong', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	expect(await testWeb3Util.isValidPair('code1|code2|code3')).toBeFalsy();
});

test('isValidPair, no token', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenByCode = jest.fn(() => '');
	expect(await testWeb3Util.isValidPair('code1|code2')).toBeFalsy();
});

test('isValidPair, inValidPair1', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenByCode = jest.fn(() => ({}));
	expect(await testWeb3Util.isValidPair('code1|code2')).toBeFalsy();
});

test('isValidPair, inValidPair2', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenByCode = jest.fn(() => ({
		precisions: {
			code2: 0.1
		}
	}));
	expect(await testWeb3Util.isValidPair('code1|code2')).toBeFalsy();
});

test('isValidPair, inValidPair3', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	util.getUTCNowTimestamp = jest.fn(() => 1234567890000);
	testWeb3Util.getTokenByCode = jest.fn(() => ({
		precisions: {
			code2: 0.1
		},
		feeSchedules: {
			code2: {}
		},
		maturity: 123456
	}));
	expect(await testWeb3Util.isValidPair('code1|code2')).toBeFalsy();
});

test('isValidPair, validPair', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenByCode = jest.fn(() => ({
		precisions: {
			code2: 0.1
		},
		feeSchedules: {
			code2: {}
		}
	}));
	expect(await testWeb3Util.isValidPair('code1|code2')).toBeTruthy();
});

test('awaitTransactionSuccessAsync', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	await testWeb3Util.awaitTransactionSuccessAsync('txHash');
	expect(
		(testWeb3Util.web3Wrapper.awaitTransactionSuccessAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('getTransactionReceipt', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	await testWeb3Util.getTransactionReceipt('txHash');
	expect(
		(testWeb3Util.web3Wrapper.getTransactionReceiptIfExistsAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('tokenTransfer, sneder = from', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenAddressFromCode = jest.fn(() => '0xtokenAddr');
	Web3Wrapper.toBaseUnitAmount = jest.fn();
	await testWeb3Util.tokenTransfer('code', 'fromAddr', 'toAddr', 'fromAddr', 1);
	expect(
		(testWeb3Util.contractWrappers.erc20Token.transferAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('tokenTransfer, sneder != from', async () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	testWeb3Util.getTokenAddressFromCode = jest.fn(() => '0xtokenAddr');
	Web3Wrapper.toBaseUnitAmount = jest.fn();
	await testWeb3Util.tokenTransfer('code', 'fromAddr', 'toAddr', 'senderAddr', 1);
	expect(
		(testWeb3Util.contractWrappers.erc20Token.transferFromAsync as jest.Mock).mock.calls
	).toMatchSnapshot();
});
