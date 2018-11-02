import { BigNumber } from '0x.js';
import Web3Util from './Web3Util';

// const testWeb3Util = new Web3Util(null, false, '');

test('fromWei', () => {
	const input = new BigNumber(1000000000000000000);
	expect(Web3Util.fromWei(input).valueOf()).toEqual(1);
	const input1 = '1000000000000000000';
	expect(Web3Util.fromWei(input1).valueOf()).toEqual(1);
});

test('createRawOrderWithoutSalt', async () => {
	expect(
		Web3Util.createRawOrderWithoutSalt(
			'userAddr',
			'relayerAddr',
			'makerAssetAddr',
			'takerAssetAddr',
			123,
			456,
			1234567890,
			'exchangeAddr'
		)
	).toMatchSnapshot();
});
