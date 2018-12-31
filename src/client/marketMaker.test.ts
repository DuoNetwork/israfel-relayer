// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';

import marketMaker from './marketMaker';

const obSide = [
	{
		price: 0.001,
		balance: 10,
		count: 1
	},
	{
		price: 0.0015,
		balance: 20,
		count: 2
	},
	{
		price: 0.002,
		balance: 30,
		count: 3
	}
];
test('getSideTotalLiquidity', () => {
	expect(marketMaker.getSideTotalLiquidity(obSide, 1)).toMatchSnapshot();
});
