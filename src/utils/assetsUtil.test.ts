import {BigNumber} from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import assetsUtil from './assetsUtil';
import { IOption } from '../common/types';

test('getTokenAddressFromName', async () => {
	expect(assetsUtil.getTokenAddressFromName('ZRX')).toMatchSnapshot();
	expect(assetsUtil.getTokenAddressFromName('WETH')).toMatchSnapshot();
	expect(assetsUtil.getTokenAddressFromName('')).toMatchSnapshot();
});

test('setTokenAllowance', async () => {
	assetsUtil.web3Wrapper.getAvailableAddressesAsync = jest.fn(() =>
		Promise.resolve(['account1', 'account2', 'account3', 'account4'])
	);

	await assetsUtil.init();
	const option: IOption = {
		live: false,
		token: 'ZRX',
		maker: 0,
		spender: 1,
		amount: 0.1,
		debug: false
	};

	Web3Wrapper.toBaseUnitAmount = jest.fn((input: BigNumber, decimal: number) => input.toPower(decimal));
	assetsUtil.contractWrappers.erc20Token.setAllowanceAsync = jest.fn(() =>
		Promise.resolve('orderHash')
	);

	// expect(assetsUtil.setTokenAllowance(option) as jest.Mock<Promise<void>>)
});
