import {BigNumber} from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
// import { IOption } from '../common/types';
import assetUtil from './assetUtil';

test('getTokenAddressFromName', async () => {
	expect(assetUtil.getTokenAddressFromName('ZRX')).toMatchSnapshot();
	expect(assetUtil.getTokenAddressFromName('WETH')).toMatchSnapshot();
	expect(assetUtil.getTokenAddressFromName('')).toMatchSnapshot();
});

test('setTokenAllowance', async () => {
	assetUtil.web3Wrapper.getAvailableAddressesAsync = jest.fn(() =>
		Promise.resolve(['account1', 'account2', 'account3', 'account4'])
	);

	await assetUtil.init();
	// const option: IOption = {
	// 	live: false,
	// 	token: 'ZRX',
	// 	maker: 0,
	// 	spender: 1,
	// 	amount: 0.1,
	// 	debug: false,
	// 	type: 'add'
	// };

	Web3Wrapper.toBaseUnitAmount = jest.fn((input: BigNumber, decimal: number) => input.toPower(decimal));
	assetUtil.contractWrappers.erc20Token.setAllowanceAsync = jest.fn(() =>
		Promise.resolve('orderHash')
	);

	// expect(assetUtil.setTokenAllowance(option) as jest.Mock<Promise<void>>)
});
