// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';

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

test('toChecksumAddress', () => {
	const addr = '0xf474e7E554D98a580282726434d1281aA273E87F';
	expect(Web3Util.toChecksumAddress(addr.toLowerCase())).toEqual(addr);
});
