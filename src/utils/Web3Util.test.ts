import { BigNumber } from '0x.js';
import Web3Util from './Web3Util';

test('fromWei', () => {
	const input = new BigNumber(1000000000000000000);
	expect(Web3Util.fromWei(input).valueOf()).toEqual(1);
	expect(Web3Util.fromWei(input, 17).valueOf()).toEqual(10);
	const input1 = '1000000000000000000';
	expect(Web3Util.fromWei(input1).valueOf()).toEqual(1);
	expect(Web3Util.fromWei(input1, 17).valueOf()).toEqual(10);
});
