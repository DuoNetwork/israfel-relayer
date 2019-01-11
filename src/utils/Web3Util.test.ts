// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';

import { BigNumber } from 'bignumber.js';
import Web3Util from './Web3Util';

// jest.mock('web3-utils');
jest.mock('@0x/subproviders', () => ({
	MetamaskSubprovider: jest.fn(),
	MnemonicWalletSubprovider: jest.fn()
}));

jest.mock('0x.js', () => ({
	ContractWrappers: jest.fn(),
	Web3ProviderEngine: jest.fn(
		() =>
			({
				addProvider: jest.fn(),
				start: jest.fn()
			} as any)
	),
	RPCSubprovider: jest.fn(),
	BigNumber: BigNumber
}));

jest.mock('@0x/contract-addresses', () => ({
	getContractAddressesForNetworkOrThrow: jest.fn()
}));

jest.mock('@0x/web3-wrapper', () => ({
	Web3Wrapper: jest.fn(() => ({
		getProvider: jest.fn(() => 'provider'),
		toBaseUnitAmount: jest.fn(value => value * 1e18)
	})),
	toBaseUnitAmount: jest.fn(value => value * 1e18)
}));

jest.mock('@0x/contract-addresses', () => ({
	getContractAddressesForNetworkOrThrow: jest.fn(() => 'contractAddr')
}));

jest.mock('web3-eth');
jest.mock('web3-eth-accounts');
jest.mock('web3-eth-personal');

test('constructor, with window, metaMask', () => {
	const window = {
		web3: {
			currentProvider: 'provider'
		}
	} as any;
	const testWeb3Util = new Web3Util(window, false, 'mnemonic', false);
	expect(testWeb3Util.wallet).toMatchSnapshot();
});

test('constructor, no window, local', () => {
	const testWeb3Util = new Web3Util(null, false, 'mnemonic', false);
	expect(testWeb3Util.wallet).toMatchSnapshot();
});
