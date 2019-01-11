// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';

import { BigNumber } from '0x.js';
import { Wallet } from '../common/types';
import Web3Util from './Web3Util';

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
			new BigNumber(123),
			new BigNumber(456),
			1234567890,
			'exchangeAddr'
		)
	).toMatchSnapshot();
});

test('toChecksumAddress', () => {
	const addr = '0xf474e7E554D98a580282726434d1281aA273E87F';
	expect(Web3Util.toChecksumAddress(addr.toLowerCase())).toEqual(addr);
});

test('createRawOrder, cannot sign', async () => {
	const web3Util = new Web3Util(null, false, '', false);
	// console.log(web3Util);
	web3Util.wallet = Wallet.None;
	try {
		await web3Util.createRawOrder(
			'pair',
			'userAddr',
			'makerAssetAddr',
			'takerAssetAddr',
			new BigNumber(1),
			new BigNumber(2),
			1234567890
		);
	} catch (err) {
		expect(err).toMatchSnapshot();
	}
});

// test('createRawOrder', async () => {
// 	const web3Util = new Web3Util(null, false, '', false);
// 	// console.log(web3Util);
// 	web3Util.wallet = Wallet.MetaMask;
// 	Web3Util.createRawOrderWithoutSalt = jest.fn(() => ({
// 		exchangeAddress: '0x2d6e2fE8233CD5C181f3bdC9EEBd12A1208a7061',
// 		expirationTimeSeconds: '1234567890',
// 		feeRecipientAddress: '0x9472021c8CBFe19F4f2720FC29AA65CBd0822a16',
// 		makerAddress: '0x08cb8054201a9FdfE63fbdB1b3028E12d284D0dD',
// 		makerAssetAmount: '123000000000000000000',
// 		makerAssetData:
// 			'0xf47261b00000000000000000000000000000000000000000000000000000d327e5a0bb51',
// 		makerFee: '0',
// 		salt: '0',
// 		senderAddress: '0x0000000000000000000000000000000000000000',
// 		takerAddress: '0x0000000000000000000000000000000000000000',
// 		takerAssetAmount: '456000000000000000000',
// 		takerAssetData:
// 			'0xf47261b0000000000000000000000000000000000000000000000000000112d20ac31b51',
// 		takerFee: '0'
// 	}));
// 	// Web3Util.createRawOrderWithoutSalt = jest.fn(() => );
// 	jest.mock('0x.js', async () => ({
// 		generatePseudoRandomSalt: jest.fn(() => 1234567890),
// 		orderHashUtils: {
// 			getOrderHashHex: jest.fn(() => 'orderHash')
// 		},
// 		signatureUtils: {
// 			ecSignOrderAsync: jest.fn(() => Promise.resolve({} as any))
// 		}
// 	}));

// 	jest.mock('@0x/web3-wrapper', () => ({
// 		Web3Wrapper: jest.fn(() => ({
// 			getProvider: jest.fn(() => 'provider'),
// 			toBaseUnitAmount: jest.fn(value => value * 1e18)
// 		}))
// 	}));
// 	const res = await web3Util.createRawOrder(
// 		'aETH|WETH',
// 		'0x2d6e2fE8233CD5C181f3bdC9EEBd12A1208a7061',
// 		'0x9472021c8CBFe19F4f2720FC29AA65CBd0822a16',
// 		'0x08cb8054201a9FdfE63fbdB1b3028E12d284D0dD',
// 		new BigNumber(1),
// 		new BigNumber(2),
// 		1234567890
// 	);
// 	console.log(res);
// });
