// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import DualClassWrapper from '../../../duo-contract-wrapper/src/DualClassWrapper';
import * as CST from '../common/constants';
import util from '../utils/util';
import marketMaker from './marketMaker';

const userOrders = [
	{
		account: 'account',
		pair: 'aETH|WETH',
		orderHash: 'orderHash1',
		price: 0.001,
		amount: 10,
		balance: 10,
		matching: 0,
		fill: 0,
		side: 'bid',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 1,
		currentSequence: 1,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'add',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash1'
	},
	{
		account: 'account',
		pair: 'bETH|WETH',
		orderHash: 'orderHash2',
		price: 0.0011,
		amount: 10,
		balance: 12,
		matching: 0,
		fill: 0,
		side: 'bid',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 2,
		currentSequence: 2,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'add',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash2'
	},
	{
		account: 'account',
		pair: 'aETH|WETH',
		orderHash: 'orderHash3',
		price: 0.0013,
		amount: 10,
		balance: 14,
		matching: 0,
		fill: 0,
		side: 'ask',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 3,
		currentSequence: 3,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'add',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash3'
	},
	{
		account: 'account',
		pair: 'bETH|WETH',
		orderHash: 'orderHash4',
		price: 0.0014,
		amount: 10,
		balance: 16,
		matching: 0,
		fill: 0,
		side: 'ask',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 4,
		currentSequence: 4,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'add',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash4'
	},
	{
		account: 'account',
		pair: 'aETH|WETH',
		orderHash: 'orderHash1',
		price: 0.001,
		amount: 10,
		balance: 10,
		matching: 0,
		fill: 0,
		side: 'bid',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 1,
		currentSequence: 5,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'terminate',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash1'
	}
];

const tokens = [
	{
		custodian: '0x56e2727e56F9D6717e462418f822a8FE08Be4711',
		address: 'address',
		code: 'aETH',
		denomination: 0.1,
		precisions: {
			WETH: 0.000005
		},
		feeSchedules: {
			WETH: {
				minimum: 0.1,
				rate: 0
			}
		}
	},
	{
		custodian: '0x56e2727e56F9D6717e462418f822a8FE08Be4711',
		address: 'address',
		code: 'bETH',
		denomination: 0.1,
		precisions: {
			WETH: 0.000005
		},
		feeSchedules: {
			WETH: {
				minimum: 0.1,
				rate: 0
			}
		}
	}
];

const option = {
	env: 'dev',
	tokens: [],
	token: 'aETH',
	maker: 0,
	spender: 1,
	amount: 10,
	debug: true,
	server: false
};

marketMaker.makerAccount = {
	address: 'address',
	privateKey: 'privateKey'
};
test('checkAllowance, already approved', async () => {
	const web3Util = {
		getTokenAllowance: jest.fn(() => Promise.resolve(10000)),
		setUnlimitedTokenAllowance: jest.fn(() => Promise.resolve()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve())
	} as any;

	const dualClassWrapper1 = {
		address: 'custodianAddr'
	} as any;
	marketMaker.tokens = tokens;
	await marketMaker.checkAllowance(web3Util, dualClassWrapper1);
	expect((web3Util.getTokenAllowance as jest.Mock).mock.calls).toMatchSnapshot();
	expect(web3Util.setUnlimitedTokenAllowance as jest.Mock).not.toBeCalled();
	expect(web3Util.awaitTransactionSuccessAsync as jest.Mock).not.toBeCalled();
});

test('checkAllowance, 0 allowance', async () => {
	const web3Util = {
		getTokenAllowance: jest.fn(() => Promise.resolve(0)),
		setUnlimitedTokenAllowance: jest.fn((code: string, addr: string, custodianAddr?: string) =>
			Promise.resolve(`${code}|
	${addr}|${custodianAddr}`)
		),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve())
	} as any;

	const dualClassWrapper1 = {
		address: 'custodianAddr'
	} as any;
	marketMaker.tokens = tokens;
	await marketMaker.checkAllowance(web3Util, dualClassWrapper1);
	expect((web3Util.getTokenAllowance as jest.Mock).mock.calls).toMatchSnapshot();
	expect((web3Util.setUnlimitedTokenAllowance as jest.Mock).mock.calls).toMatchSnapshot();
	expect((web3Util.awaitTransactionSuccessAsync as jest.Mock).mock.calls).toMatchSnapshot();
});

const custodianStates = {
	resetPrice: 130,
	beta: 1,
	alpha: 1,
	createCommRate: 0.01,
	redeemCommRate: 0.01
};

test('maintainBalance, isMaintainingBalance', async () => {
	marketMaker.isMaintainingBalance = true;
	const web3Util = {
		getGasPrice: jest.fn(() => 9000000000),
		tokenTransfer: jest.fn(() => Promise.resolve()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve())
	} as any;

	const dualClassWrapper = {
		getStates: jest.fn(() => Promise.resolve(custodianStates)),
		createRaw: jest.fn(() => Promise.resolve()),
		redeemRaw: jest.fn(() => Promise.resolve()),
		wrapEther: jest.fn(() => Promise.resolve())
	} as any;
	await marketMaker.maintainBalance(web3Util, dualClassWrapper);
	expect(web3Util.getGasPrice).not.toBeCalled();
	expect(web3Util.tokenTransfer).not.toBeCalled();
	expect(web3Util.awaitTransactionSuccessAsync).not.toBeCalled();
	expect(dualClassWrapper.getStates).not.toBeCalled();
	expect(dualClassWrapper.createRaw).not.toBeCalled();
	expect(dualClassWrapper.redeemRaw).not.toBeCalled();
	expect(dualClassWrapper.wrapEther).not.toBeCalled();
	expect(marketMaker.isMaintainingBalance).toBeTruthy();
});

test('maintainBalance, short of token', async () => {
	marketMaker.isMaintainingBalance = false;
	const web3Util = {
		getGasPrice: jest.fn(() => 9000000000),
		tokenTransfer: jest.fn(() => Promise.resolve()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve('txHash')),
		contractAddresses: {
			etherToken: 'wethAddr'
		}
	} as any;

	const dualClassWrapper = {
		getStates: jest.fn(() => Promise.resolve(custodianStates)),
		createRaw: jest.fn(() => Promise.resolve('createRawHash')),
		redeemRaw: jest.fn(() => Promise.resolve('redeemRawHash')),
		wrapEther: jest.fn(() => Promise.resolve('wrapEtherHash'))
	} as any;
	marketMaker.tokenBalances = [11, 50, 50];
	await marketMaker.maintainBalance(web3Util, dualClassWrapper);
	expect(marketMaker.tokenBalances).toMatchSnapshot();
	expect(dualClassWrapper.createRaw.mock.calls).toMatchSnapshot();
	expect(web3Util.getGasPrice).toBeCalledTimes(1);
	expect(web3Util.awaitTransactionSuccessAsync).toBeCalledTimes(1);
	expect(web3Util.tokenTransfer).not.toBeCalled();
	expect(dualClassWrapper.getStates).toBeCalledTimes(1);
	expect(dualClassWrapper.redeemRaw).not.toBeCalled();
	expect(dualClassWrapper.wrapEther).not.toBeCalled();
	expect(marketMaker.isMaintainingBalance).toBeFalsy();
});

test('maintainBalance, surplus of token', async () => {
	marketMaker.isMaintainingBalance = false;
	const web3Util = {
		getGasPrice: jest.fn(() => 9000000000),
		tokenTransfer: jest.fn(() => Promise.resolve()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve('txHash')),
		wrapEther: jest.fn(() => Promise.resolve('wrapTxHash')),
		contractAddresses: {
			etherToken: 'wethAddr'
		}
	} as any;

	const dualClassWrapper = {
		getStates: jest.fn(() => Promise.resolve(custodianStates)),
		createRaw: jest.fn(() => Promise.resolve('createRawHash')),
		redeemRaw: jest.fn(() => Promise.resolve('redeemRawHash')),
		wrapEther: jest.fn(() => Promise.resolve('wrapEtherHash'))
	} as any;
	marketMaker.tokenBalances = [2, 500, 500];
	await marketMaker.maintainBalance(web3Util, dualClassWrapper);
	expect(marketMaker.tokenBalances).toMatchSnapshot();
	expect(dualClassWrapper.redeemRaw.mock.calls).toMatchSnapshot();
	expect(web3Util.wrapEther.mock.calls).toMatchSnapshot();
	expect(web3Util.getGasPrice).toBeCalledTimes(1);
	expect(web3Util.awaitTransactionSuccessAsync).toBeCalledTimes(2);
	expect(web3Util.tokenTransfer).not.toBeCalled();
	expect(dualClassWrapper.createRaw).not.toBeCalled();
});

test('maintainBalance, surplus of weth', async () => {
	marketMaker.isMaintainingBalance = false;
	const web3Util = {
		getGasPrice: jest.fn(() => 9000000000),
		tokenTransfer: jest.fn(() => Promise.resolve('tokenTransferTxHash')),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve('txHash')),
		wrapEther: jest.fn(() => Promise.resolve('wrapTxHash')),
		contractAddresses: {
			etherToken: 'wethAddr'
		}
	} as any;

	const dualClassWrapper = {
		getStates: jest.fn(() => Promise.resolve(custodianStates)),
		createRaw: jest.fn(() => Promise.resolve('createRawHash')),
		redeemRaw: jest.fn(() => Promise.resolve('redeemRawHash')),
		wrapEther: jest.fn(() => Promise.resolve('wrapEtherHash'))
	} as any;
	marketMaker.tokenBalances = [12, 200, 200];
	await marketMaker.maintainBalance(web3Util, dualClassWrapper);
	expect(marketMaker.tokenBalances).toMatchSnapshot();
	expect(web3Util.tokenTransfer.mock.calls).toMatchSnapshot();
	expect(web3Util.wrapEther).not.toBeCalled();
	expect(web3Util.getGasPrice).toBeCalledTimes(1);
	expect(web3Util.awaitTransactionSuccessAsync).toBeCalledTimes(1);
	expect(dualClassWrapper.redeemRaw).not.toBeCalled();
	expect(dualClassWrapper.createRaw).not.toBeCalled();
});

test('maintainBalance, short of weth', async () => {
	marketMaker.isMaintainingBalance = false;
	const web3Util = {
		getGasPrice: jest.fn(() => 9000000000),
		tokenTransfer: jest.fn(() => Promise.resolve('tokenTransferTxHash')),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve('txHash')),
		wrapEther: jest.fn(() => Promise.resolve('wrapTxHash')),
		contractAddresses: {
			etherToken: 'wethAddr'
		}
	} as any;

	const dualClassWrapper = {
		getStates: jest.fn(() => Promise.resolve(custodianStates)),
		createRaw: jest.fn(() => Promise.resolve('createRawHash')),
		redeemRaw: jest.fn(() => Promise.resolve('redeemRawHash')),
		wrapEther: jest.fn(() => Promise.resolve('wrapEtherHash'))
	} as any;
	marketMaker.tokenBalances = [1, 200, 200];
	await marketMaker.maintainBalance(web3Util, dualClassWrapper);
	expect(marketMaker.tokenBalances).toMatchSnapshot();
	expect(web3Util.tokenTransfer.mock.calls).toMatchSnapshot();
	expect(web3Util.wrapEther).not.toBeCalled();
	expect(web3Util.getGasPrice).toBeCalledTimes(1);
	expect(web3Util.awaitTransactionSuccessAsync).toBeCalledTimes(1);
	expect(dualClassWrapper.redeemRaw).not.toBeCalled();
	expect(dualClassWrapper.createRaw).not.toBeCalled();
});

test('initialize, no a token', async () => {
	const web3Util = {
		getTokenByCode: jest.fn(() => null),
		tokens: [],
		getTokenBalance: jest.fn(() => Promise.resolve(10))
	} as any;
	const relayerClient = {
		web3Util: web3Util,
		subscribeOrderBook: jest.fn(() => Promise.resolve())
	} as any;

	try {
		await marketMaker.initialize(relayerClient, option);
		expect(false).toBeTruthy();
	} catch (err) {
		expect(err).toMatchSnapshot();
	}
});

test('initialize, no b token', async () => {
	const web3Util = {
		getTokenByCode: jest.fn(() => 'aETH'),
		tokens: [tokens[0]],
		getTokenBalance: jest.fn(() => Promise.resolve(10))
	} as any;
	const relayerClient = {
		web3Util: web3Util,
		subscribeOrderBook: jest.fn(() => Promise.resolve())
	} as any;

	try {
		await marketMaker.initialize(relayerClient, option);
		expect(false).toBeTruthy();
	} catch (err) {
		expect(err).toMatchSnapshot();
	}
});

test('initialize', async () => {
	const web3Util = {
		getTokenByCode: jest.fn(() => tokens[0]),
		tokens: tokens,
		getTokenBalance: jest.fn(() => Promise.resolve(10))
	} as any;
	const relayerClient = {
		web3Util: web3Util,
		subscribeOrderHistory: jest.fn(() => Promise.resolve())
	} as any;

	marketMaker.checkAllowance = jest.fn(() => Promise.resolve());
	marketMaker.maintainBalance = jest.fn(() => Promise.resolve());
	await marketMaker.initialize(relayerClient, option);

	expect((relayerClient.web3Util.getTokenByCode as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerClient.web3Util.getTokenBalance as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerClient.subscribeOrderHistory as jest.Mock).mock.calls).toMatchSnapshot();
});

test('cancelOrders', async () => {
	const relayerClient = {
		web3Util: {
			web3PersonalSign: jest.fn(() => Promise.resolve('signature'))
		},
		deleteOrder: jest.fn(() => Promise.resolve())
	} as any;
	await marketMaker.cancelOrders(relayerClient, 'aETH|WETH', ['orderHash1', 'orderHash2']);
	expect((relayerClient.web3Util.web3PersonalSign as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerClient.deleteOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistory', async () => {
	const marketMaker1 = Object.assign(
		Object.create(Object.getPrototypeOf(marketMaker)),
		marketMaker
	);
	marketMaker1.isInitialized = true;
	const dualClassWrapper = {} as any;
	const relayerClient = {
		subscribeOrderBook: jest.fn(() => Promise.resolve())
	} as any;
	marketMaker1.tokens = tokens;
	marketMaker1.tokenBalances = [100, 100, 100];
	marketMaker1.cancelOrders = jest.fn(() => Promise.resolve());
	marketMaker1.createOrderBookFromNav = jest.fn(() => Promise.resolve());
	await marketMaker1.handleOrderHistory(relayerClient, dualClassWrapper, userOrders);
	expect(marketMaker1.tokenBalances).toMatchSnapshot();
	for (const mockCall of (marketMaker1.cancelOrders as jest.Mock).mock.calls)
		expect(mockCall.slice(1)).toMatchSnapshot();
	expect((relayerClient.subscribeOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderBookUpdate', async () => {
	const marketMaker2 = Object.assign(
		Object.create(Object.getPrototypeOf(marketMaker)),
		marketMaker
	);
	const dualClassWrapper = {} as any;
	const relayerClient = {} as any;
	marketMaker2.makeOrders = jest.fn(() => Promise.resolve());

	await marketMaker2.handleOrderBookUpdate(dualClassWrapper, relayerClient, {
		pair: 'aETH|WETH'
	} as any);
	expect((marketMaker2.makeOrders as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleUserOrder, terminate, bid', async () => {
	const marketMaker3 = Object.assign(
		Object.create(Object.getPrototypeOf(marketMaker)),
		marketMaker
	);
	marketMaker3.tokens = tokens;
	marketMaker3.tokenBalances = [6, 200, 200];
	marketMaker3.liveBidOrders = [
		[
			{
				account: 'account',
				pair: 'aETH|WETH',
				orderHash: 'orderHash1',
				price: 0.001,
				amount: 10,
				balance: 10,
				matching: 0,
				fill: 0,
				side: 'bid',
				expiry: 1234567890000,
				createdAt: 1234567880000,
				updatedAt: 1234567880000,
				initialSequence: 1,
				currentSequence: 1,
				fee: 0.1,
				feeAsset: 'aETH',
				type: 'add',
				status: 'confirmed',
				updatedBy: 'relayer',
				processed: true,
				transactionHash: 'transactionhash1'
			}
		],
		[]
	];
	const userOrder = {
		account: 'account',
		pair: 'aETH|WETH',
		orderHash: 'orderHash1',
		price: 0.001,
		amount: 10,
		balance: 10,
		matching: 0,
		fill: 0,
		side: 'bid',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 1,
		currentSequence: 1,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'terminate',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash1'
	};
	marketMaker3.maintainBalance = jest.fn(() => Promise.resolve());
	marketMaker3.makeOrders = jest.fn(() => Promise.resolve());
	await marketMaker3.handleUserOrder(userOrder, {} as any, {} as any);
	expect(marketMaker3.tokenBalances).toMatchSnapshot();
	expect(marketMaker3.makeOrders.mock.calls).toMatchSnapshot();
});

test('handleUserOrder, terminate, bid bToken', async () => {
	const marketMaker3 = Object.assign(
		Object.create(Object.getPrototypeOf(marketMaker)),
		marketMaker
	);
	marketMaker3.tokens = tokens;
	marketMaker3.tokenBalances = [6, 200, 200];
	marketMaker3.liveBidOrders = [
		[],
		[
			{
				account: 'account',
				pair: 'bETH|WETH',
				orderHash: 'orderHash1',
				price: 0.001,
				amount: 10,
				balance: 10,
				matching: 0,
				fill: 0,
				side: 'bid',
				expiry: 1234567890000,
				createdAt: 1234567880000,
				updatedAt: 1234567880000,
				initialSequence: 1,
				currentSequence: 1,
				fee: 0.1,
				feeAsset: 'bETH',
				type: 'add',
				status: 'confirmed',
				updatedBy: 'relayer',
				processed: true,
				transactionHash: 'transactionhash1'
			}
		]
	];
	const userOrder = {
		account: 'account',
		pair: 'bETH|WETH',
		orderHash: 'orderHash1',
		price: 0.001,
		amount: 10,
		balance: 10,
		matching: 0,
		fill: 0,
		side: 'bid',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 1,
		currentSequence: 1,
		fee: 0.1,
		feeAsset: 'bETH',
		type: 'terminate',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash1'
	};
	marketMaker3.maintainBalance = jest.fn(() => Promise.resolve());
	marketMaker3.makeOrders = jest.fn(() => Promise.resolve());
	await marketMaker3.handleUserOrder(userOrder, {} as any, {} as any);
	expect(marketMaker3.tokenBalances).toMatchSnapshot();
	expect(marketMaker3.makeOrders.mock.calls).toMatchSnapshot();
});

test('handleUserOrder, terminate, ask', async () => {
	const marketMaker3 = Object.assign(
		Object.create(Object.getPrototypeOf(marketMaker)),
		marketMaker
	);
	marketMaker3.tokens = tokens;
	marketMaker3.tokenBalances = [6, 200, 200];
	marketMaker3.liveAskOrders = [
		[
			{
				account: 'account',
				pair: 'aETH|WETH',
				orderHash: 'orderHash1',
				price: 0.001,
				amount: 10,
				balance: 10,
				matching: 0,
				fill: 0,
				side: 'ask',
				expiry: 1234567890000,
				createdAt: 1234567880000,
				updatedAt: 1234567880000,
				initialSequence: 1,
				currentSequence: 1,
				fee: 0.1,
				feeAsset: 'aETH',
				type: 'add',
				status: 'confirmed',
				updatedBy: 'relayer',
				processed: true,
				transactionHash: 'transactionhash1'
			}
		],
		[]
	];
	const userOrder = {
		account: 'account',
		pair: 'aETH|WETH',
		orderHash: 'orderHash1',
		price: 0.001,
		amount: 10,
		balance: 10,
		matching: 0,
		fill: 0,
		side: 'ask',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 1,
		currentSequence: 1,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'terminate',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash1'
	};
	marketMaker3.maintainBalance = jest.fn(() => Promise.resolve());
	marketMaker3.makeOrders = jest.fn(() => Promise.resolve());
	await marketMaker3.handleUserOrder(userOrder, {} as any, {} as any);
	expect(marketMaker3.tokenBalances).toMatchSnapshot();
	expect(marketMaker3.makeOrders.mock.calls).toMatchSnapshot();
});

test('handleUserOrder, add, bid', async () => {
	const marketMaker3 = Object.assign(
		Object.create(Object.getPrototypeOf(marketMaker)),
		marketMaker
	);
	marketMaker3.tokens = tokens;
	marketMaker3.tokenBalances = [6, 200, 200];
	marketMaker3.liveBidOrders = [[], []];
	const userOrder = {
		account: 'account',
		pair: 'aETH|WETH',
		orderHash: 'orderHash1',
		price: 0.001,
		amount: 10,
		balance: 10,
		matching: 0,
		fill: 0,
		side: 'bid',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 1,
		currentSequence: 1,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'add',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash1'
	};
	marketMaker3.maintainBalance = jest.fn(() => Promise.resolve());
	marketMaker3.makeOrders = jest.fn(() => Promise.resolve());
	await marketMaker3.handleUserOrder(userOrder, {} as any, {} as any);
	expect(marketMaker3.tokenBalances).toMatchSnapshot();
	expect(marketMaker3.makeOrders.mock.calls).toMatchSnapshot();
});

test('handleUserOrder, add, ask', async () => {
	const marketMaker3 = Object.assign(
		Object.create(Object.getPrototypeOf(marketMaker)),
		marketMaker
	);
	marketMaker3.tokens = tokens;
	marketMaker3.tokenBalances = [6, 200, 200];
	marketMaker3.liveAskOrders = [[{
		account: 'account',
		pair: 'aETH|WETH',
		orderHash: 'orderHash2',
		price: 0.001,
		amount: 10,
		balance: 10,
		matching: 0,
		fill: 0,
		side: 'ask',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 1,
		currentSequence: 1,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'add',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash2'
	}], []];
	const userOrder = {
		account: 'account',
		pair: 'aETH|WETH',
		orderHash: 'orderHash1',
		price: 0.001,
		amount: 10,
		balance: 10,
		matching: 0,
		fill: 0,
		side: 'ask',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 1,
		currentSequence: 1,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'add',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash1'
	};
	marketMaker3.maintainBalance = jest.fn(() => Promise.resolve());
	marketMaker3.makeOrders = jest.fn(() => Promise.resolve());
	await marketMaker3.handleUserOrder(userOrder, {} as any, {} as any);
	expect(marketMaker3.tokenBalances).toMatchSnapshot();
	expect(marketMaker3.makeOrders.mock.calls).toMatchSnapshot();
});

test('handleUserOrder, add, cancel too far away', async () => {
	const marketMaker4 = Object.assign(
		Object.create(Object.getPrototypeOf(marketMaker)),
		marketMaker
	);
	marketMaker4.tokens = tokens;
	marketMaker4.tokenBalances = [6, 200, 200];
	marketMaker4.liveBidOrders = [
		[
			{
				account: 'account',
				pair: 'aETH|WETH',
				orderHash: 'orderHash2',
				price: 0.0011,
				amount: 10,
				balance: 10,
				matching: 0,
				fill: 0,
				side: 'bid',
				expiry: 1234567890000
			} as any,
			{
				account: 'account',
				pair: 'aETH|WETH',
				orderHash: 'orderHash3',
				price: 0.0012,
				amount: 10,
				balance: 10,
				matching: 0,
				fill: 0,
				side: 'bid',
				expiry: 1234567890000
			} as any,
			{
				account: 'account',
				pair: 'aETH|WETH',
				orderHash: 'orderHash4',
				price: 0.0014,
				amount: 10,
				balance: 10,
				matching: 0,
				fill: 0,
				side: 'bid',
				expiry: 1234567890000
			} as any,
			{
				account: 'account',
				pair: 'aETH|WETH',
				orderHash: 'orderHash5',
				price: 0.0015,
				amount: 10,
				balance: 10,
				matching: 0,
				fill: 0,
				side: 'bid',
				expiry: 1234567890000
			}
		],
		[]
	];
	const userOrder = {
		account: 'account',
		pair: 'aETH|WETH',
		orderHash: 'orderHash1',
		price: 0.001,
		amount: 10,
		balance: 10,
		matching: 0,
		fill: 0,
		side: 'bid',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 1,
		currentSequence: 1,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'add',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash1'
	};
	marketMaker4.maintainBalance = jest.fn(() => Promise.resolve());
	marketMaker4.makeOrders = jest.fn(() => Promise.resolve());
	marketMaker4.cancelOrders = jest.fn(() => Promise.resolve());
	await marketMaker4.handleUserOrder(userOrder, {} as any, {} as any);
	expect(marketMaker4.tokenBalances).toMatchSnapshot();
	expect(marketMaker4.makeOrders.mock.calls).toMatchSnapshot();
	for (const mockCall of marketMaker4.cancelOrders.mock.calls)
		expect(mockCall.slice(1)).toMatchSnapshot();
});

test('handleUserOrder, update, bid', async () => {
	const marketMaker3 = Object.assign(
		Object.create(Object.getPrototypeOf(marketMaker)),
		marketMaker
	);
	marketMaker3.tokens = tokens;
	marketMaker3.tokenBalances = [6, 200, 200];
	marketMaker3.liveBidOrders = [
		[
			{
				account: 'account',
				pair: 'aETH|WETH',
				orderHash: 'orderHash1',
				price: 0.001,
				amount: 100,
				balance: 80,
				matching: 0,
				fill: 0,
				side: 'bid',
				expiry: 1234567890000,
				createdAt: 1234567880000,
				updatedAt: 1234567880000,
				initialSequence: 1,
				currentSequence: 1,
				fee: 0.1,
				feeAsset: 'aETH',
				type: 'update',
				status: 'confirmed',
				updatedBy: 'relayer',
				processed: true,
				transactionHash: 'transactionhash1'
			}
		],
		[]
	];
	const userOrder = {
		account: 'account',
		pair: 'aETH|WETH',
		orderHash: 'orderHash1',
		price: 0.001,
		amount: 100,
		balance: 40,
		matching: 0,
		fill: 0,
		side: 'bid',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 1,
		currentSequence: 1,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'update',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash1'
	};
	marketMaker3.maintainBalance = jest.fn(() => Promise.resolve());
	marketMaker3.makeOrders = jest.fn(() => Promise.resolve());
	await marketMaker3.handleUserOrder(userOrder, {} as any, {} as any);
	expect(marketMaker3.tokenBalances).toMatchSnapshot();
	expect(marketMaker3.makeOrders.mock.calls).toMatchSnapshot();
});

test('handleUserOrder, update, ask', async () => {
	const marketMaker3 = Object.assign(
		Object.create(Object.getPrototypeOf(marketMaker)),
		marketMaker
	);
	marketMaker3.tokens = tokens;
	marketMaker3.tokenBalances = [6, 200, 200];
	marketMaker3.liveAskOrders = [
		[
			{
				account: 'account',
				pair: 'aETH|WETH',
				orderHash: 'orderHash1',
				price: 0.001,
				amount: 100,
				balance: 80,
				matching: 0,
				fill: 0,
				side: 'ask',
				expiry: 1234567890000,
				createdAt: 1234567880000,
				updatedAt: 1234567880000,
				initialSequence: 1,
				currentSequence: 1,
				fee: 0.1,
				feeAsset: 'aETH',
				type: 'add',
				status: 'confirmed',
				updatedBy: 'relayer',
				processed: true,
				transactionHash: 'transactionhash1'
			}
		],
		[]
	];
	const userOrder = {
		account: 'account',
		pair: 'aETH|WETH',
		orderHash: 'orderHash1',
		price: 0.001,
		amount: 100,
		balance: 40,
		matching: 0,
		fill: 0,
		side: 'ask',
		expiry: 1234567890000,
		createdAt: 1234567880000,
		updatedAt: 1234567880000,
		initialSequence: 1,
		currentSequence: 1,
		fee: 0.1,
		feeAsset: 'aETH',
		type: 'update',
		status: 'confirmed',
		updatedBy: 'relayer',
		processed: true,
		transactionHash: 'transactionhash1'
	};
	marketMaker3.maintainBalance = jest.fn(() => Promise.resolve());
	marketMaker3.makeOrders = jest.fn(() => Promise.resolve());
	await marketMaker3.handleUserOrder(userOrder, {} as any, {} as any);
	expect(marketMaker3.tokenBalances).toMatchSnapshot();
	expect(marketMaker3.makeOrders.mock.calls).toMatchSnapshot();
});

test('canMakeOrder, no orderBookSnapshot', () => {
	marketMaker.tokens = tokens;
	const relayerClient = {
		orderBookSnapshots: {}
	} as any;
	expect(marketMaker.canMakeOrder(relayerClient, 'aETH|WETH')).toBeFalsy();
});

test('canMakeOrder, isSendingOrder', () => {
	marketMaker.tokens = tokens;
	marketMaker.isSendingOrder = true;
	const relayerClient = {
		orderBookSnapshots: {
			'aETH|WETH': {
				version: 1,
				pair: 'aETH|WETH',
				bids: [],
				asks: []
			},
			'bETH|WETH': { version: 1, pair: 'bETH|WETH', bids: [], asks: [] }
		}
	} as any;
	expect(marketMaker.canMakeOrder(relayerClient, 'bETH|WETH')).toBeFalsy();
});

test('canMakeOrder, has pendingOrder', () => {
	marketMaker.tokens = tokens;
	marketMaker.isSendingOrder = true;
	marketMaker.pendingOrders = { orderHash: true };
	const relayerClient = {
		orderBookSnapshots: {
			'aETH|WETH': {
				version: 1,
				pair: 'aETH|WETH',
				bids: [],
				asks: []
			},
			'bETH|WETH': { version: 1, pair: 'bETH|WETH', bids: [], asks: [] }
		}
	} as any;
	expect(marketMaker.canMakeOrder(relayerClient, 'aETH|WETH')).toBeFalsy();
});

test('canMakeOrder', () => {
	marketMaker.tokens = tokens;
	marketMaker.isSendingOrder = false;
	marketMaker.pendingOrders = {};
	const relayerClient = {
		orderBookSnapshots: {
			'aETH|WETH': {
				version: 1,
				pair: 'aETH|WETH',
				bids: [],
				asks: []
			},
			'bETH|WETH': { version: 1, pair: 'bETH|WETH', bids: [], asks: [] }
		}
	} as any;
	expect(marketMaker.canMakeOrder(relayerClient, 'aETH|WETH')).toBeTruthy();
});

test('getEthPrice', () => {
	marketMaker.exchangePrices[CST.API_KRAKEN] = [
		{
			period: 1,
			open: 100,
			high: 200,
			low: 50,
			close: 150,
			volume: 10000,
			source: 'kraken',
			base: 'USD',
			quote: 'ETH',
			timestamp: 1234567890000
		}
	];
	expect(marketMaker.getEthPrice()).toMatchSnapshot();
});

test('getEthPrice, no ETH price', () => {
	marketMaker.exchangePrices[CST.API_KRAKEN] = [];
	expect(marketMaker.getEthPrice()).toMatchSnapshot();
});

test('takeOneSideOrders', async () => {
	const relayerClient = {
		addOrder: jest.fn(() => Promise.resolve('addOrderTxHash'))
	} as any;
	util.getExpiryTimestamp = jest.fn(() => 1234567890000);
	util.sleep = jest.fn(() => Promise.resolve());
	await marketMaker.takeOneSideOrders(relayerClient, 'aETH|WETH', true, [
		{
			price: 0.001,
			balance: 20,
			count: 1
		},
		{
			price: 0.0012,
			balance: 0,
			count: 1
		},
		{
			price: 0.0014,
			balance: 20,
			count: 1
		}
	]);
	expect((relayerClient.addOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('createOrderBookSide', async () => {
	const relayerClient = {
		addOrder: jest.fn(() => Promise.resolve('addOrderTxHash'))
	} as any;
	util.getExpiryTimestamp = jest.fn(() => 1234567890000);
	util.sleep = jest.fn(() => Promise.resolve());
	Math.random = jest.fn(() => 0.5);
	await marketMaker.createOrderBookSide(relayerClient, 'aETH|WETH', 0.0001, true, 4);
	expect((relayerClient.addOrder as jest.Mock).mock.calls).toMatchSnapshot();
});

test('createOrderBookFromNav', async () => {
	const dualClassWrapper = {
		getStates: jest.fn(() => Promise.resolve(custodianStates))
	} as any;
	marketMaker.getEthPrice = jest.fn(() => 100);
	DualClassWrapper.calculateNav = jest.fn(() => [1, 1.2]);
	marketMaker.createOrderBookSide = jest.fn(() => Promise.resolve());
	await marketMaker.createOrderBookFromNav(dualClassWrapper, {} as any);
	expect((marketMaker.createOrderBookSide as jest.Mock).mock.calls).toMatchSnapshot();
});

test('makeOrders, isMakingOrders', async () => {
	marketMaker.isMakingOrders = true;
	marketMaker.getEthPrice = jest.fn(() => 100);
	DualClassWrapper.calculateNav = jest.fn(() => [1, 1.2]);
	marketMaker.createOrderBookSide = jest.fn(() => Promise.resolve());
	marketMaker.takeOneSideOrders = jest.fn(() => Promise.resolve());
	marketMaker.cancelOrders = jest.fn(() => Promise.resolve());
	const relayerClient = {
		orderBookSnapshots: {
			'aETH|WETH': {
				version: 1,
				pair: 'aETH|WETH',
				bids: [],
				asks: []
			},
			'bETH|WETH': { version: 1, pair: 'bETH', bids: [], asks: [] }
		}
	} as any;
	const dualClassWrapper = {
		getStates: jest.fn(() => Promise.resolve(custodianStates))
	} as any;
	await marketMaker.makeOrders(relayerClient, dualClassWrapper, 'aETH');
	expect(dualClassWrapper.getStates as jest.Mock).not.toBeCalled();
	expect(marketMaker.getEthPrice as jest.Mock).not.toBeCalled();
	expect(DualClassWrapper.calculateNav as jest.Mock).not.toBeCalled();
	expect(marketMaker.createOrderBookSide as jest.Mock).not.toBeCalled();
	expect(marketMaker.takeOneSideOrders as jest.Mock).not.toBeCalled();
	expect(marketMaker.cancelOrders as jest.Mock).not.toBeCalled();
});

test('makeOrders, no need to create order', async () => {
	marketMaker.isMakingOrders = false;
	marketMaker.canMakeOrder = jest.fn(() => true);
	marketMaker.tokens = tokens;
	marketMaker.getEthPrice = jest.fn(() => 150);
	DualClassWrapper.calculateNav = jest.fn(() => [1, 1.2]);
	marketMaker.createOrderBookSide = jest.fn(() => Promise.resolve());
	marketMaker.takeOneSideOrders = jest.fn(() => Promise.resolve());
	marketMaker.cancelOrders = jest.fn(() => Promise.resolve());
	const relayerClient = {
		orderBookSnapshots: {
			'aETH|WETH': {
				version: 1,
				pair: 'aETH|WETH',
				bids: [
					{
						price: 0.006405,
						balance: 20,
						count: 1
					},
					{
						price: 0.006305,
						balance: 20,
						count: 1
					},
					{
						price: 0.006205,
						balance: 20,
						count: 1
					},
					{
						price: 0.006105,
						balance: 20,
						count: 1
					}
				],
				asks: [
					{
						price: 0.006605,
						balance: 20,
						count: 1
					},
					{
						price: 0.006705,
						balance: 20,
						count: 1
					},
					{
						price: 0.006805,
						balance: 20,
						count: 1
					},
					{
						price: 0.006905,
						balance: 20,
						count: 1
					}
				]
			},
			'bETH|WETH': {
				version: 1,
				pair: 'bETH',
				bids: [
					{
						price: 0.0087,
						balance: 20,
						count: 1
					},
					{
						price: 0.0086,
						balance: 20,
						count: 1
					},
					{
						price: 0.0085,
						balance: 20,
						count: 1
					},
					{
						price: 0.0084,
						balance: 20,
						count: 1
					}
				],
				asks: [
					{
						price: 0.0088,
						balance: 20,
						count: 1
					},
					{
						price: 0.0089,
						balance: 20,
						count: 1
					},
					{
						price: 0.009,
						balance: 20,
						count: 1
					},
					{
						price: 0.0091,
						balance: 20,
						count: 1
					}
				]
			}
		}
	} as any;
	const dualClassWrapper = {
		getStates: jest.fn(() => Promise.resolve(custodianStates))
	} as any;
	await marketMaker.makeOrders(relayerClient, dualClassWrapper, 'aETH|WETH');
	expect(marketMaker.createOrderBookSide as jest.Mock).not.toBeCalled();
	expect(marketMaker.takeOneSideOrders as jest.Mock).not.toBeCalled();
	expect(marketMaker.cancelOrders as jest.Mock).not.toBeCalled();
});

test('makeOrders, create bid order', async () => {
	marketMaker.isMakingOrders = false;
	marketMaker.canMakeOrder = jest.fn(() => true);
	marketMaker.tokens = tokens;
	marketMaker.getEthPrice = jest.fn(() => 150);
	DualClassWrapper.calculateNav = jest.fn(() => [1, 1.2]);
	marketMaker.createOrderBookSide = jest.fn(() => Promise.resolve());
	marketMaker.takeOneSideOrders = jest.fn(() => Promise.resolve());
	marketMaker.cancelOrders = jest.fn(() => Promise.resolve());
	const relayerClient = {
		orderBookSnapshots: {
			'aETH|WETH': {
				version: 1,
				pair: 'aETH|WETH',
				bids: [
					{
						price: 0.006305,
						balance: 20,
						count: 1
					},
					{
						price: 0.006205,
						balance: 20,
						count: 1
					},
					{
						price: 0.006105,
						balance: 20,
						count: 1
					}
				],
				asks: [
					{
						price: 0.006605,
						balance: 20,
						count: 1
					},
					{
						price: 0.006705,
						balance: 20,
						count: 1
					},
					{
						price: 0.006805,
						balance: 20,
						count: 1
					},
					{
						price: 0.006905,
						balance: 20,
						count: 1
					}
				]
			},
			'bETH|WETH': {
				version: 1,
				pair: 'bETH',
				bids: [
					{
						price: 0.0087,
						balance: 20,
						count: 1
					},
					{
						price: 0.0086,
						balance: 20,
						count: 1
					},
					{
						price: 0.0085,
						balance: 20,
						count: 1
					},
					{
						price: 0.0084,
						balance: 20,
						count: 1
					}
				],
				asks: [
					{
						price: 0.0088,
						balance: 20,
						count: 1
					},
					{
						price: 0.0089,
						balance: 20,
						count: 1
					},
					{
						price: 0.009,
						balance: 20,
						count: 1
					},
					{
						price: 0.0091,
						balance: 20,
						count: 1
					}
				]
			}
		}
	} as any;
	const dualClassWrapper = {
		getStates: jest.fn(() => Promise.resolve(custodianStates))
	} as any;
	await marketMaker.makeOrders(relayerClient, dualClassWrapper, 'aETH|WETH');
	for (const mockCall of (marketMaker.createOrderBookSide as jest.Mock).mock.calls)
		expect(mockCall.slice(1)).toMatchSnapshot();
	expect(marketMaker.takeOneSideOrders as jest.Mock).not.toBeCalled();
	expect(marketMaker.cancelOrders as jest.Mock).not.toBeCalled();
});

test('makeOrders, create ask order', async () => {
	marketMaker.isMakingOrders = false;
	marketMaker.canMakeOrder = jest.fn(() => true);
	marketMaker.tokens = tokens;
	marketMaker.getEthPrice = jest.fn(() => 150);
	DualClassWrapper.calculateNav = jest.fn(() => [1, 1.2]);
	marketMaker.createOrderBookSide = jest.fn(() => Promise.resolve());
	marketMaker.takeOneSideOrders = jest.fn(() => Promise.resolve());
	marketMaker.cancelOrders = jest.fn(() => Promise.resolve());
	const relayerClient = {
		orderBookSnapshots: {
			'aETH|WETH': {
				version: 1,
				pair: 'aETH|WETH',
				bids: [
					{
						price: 0.006305,
						balance: 20,
						count: 1
					},
					{
						price: 0.006205,
						balance: 20,
						count: 1
					},
					{
						price: 0.006105,
						balance: 20,
						count: 1
					},
					{
						price: 0.006095,
						balance: 20,
						count: 1
					}
				],
				asks: [
					{
						price: 0.006705,
						balance: 20,
						count: 1
					},
					{
						price: 0.006805,
						balance: 20,
						count: 1
					},
					{
						price: 0.006905,
						balance: 20,
						count: 1
					}
				]
			},
			'bETH|WETH': {
				version: 1,
				pair: 'bETH',
				bids: [
					{
						price: 0.0087,
						balance: 20,
						count: 1
					},
					{
						price: 0.0086,
						balance: 20,
						count: 1
					},
					{
						price: 0.0085,
						balance: 20,
						count: 1
					},
					{
						price: 0.0084,
						balance: 20,
						count: 1
					}
				],
				asks: [
					{
						price: 0.0088,
						balance: 20,
						count: 1
					},
					{
						price: 0.0089,
						balance: 20,
						count: 1
					},
					{
						price: 0.009,
						balance: 20,
						count: 1
					},
					{
						price: 0.0091,
						balance: 20,
						count: 1
					}
				]
			}
		}
	} as any;
	const dualClassWrapper = {
		getStates: jest.fn(() => Promise.resolve(custodianStates))
	} as any;
	await marketMaker.makeOrders(relayerClient, dualClassWrapper, 'aETH|WETH');
	for (const mockCall of (marketMaker.createOrderBookSide as jest.Mock).mock.calls)
		expect(mockCall.slice(1)).toMatchSnapshot();
	expect(marketMaker.takeOneSideOrders as jest.Mock).not.toBeCalled();
	expect(marketMaker.cancelOrders as jest.Mock).not.toBeCalled();
});

test('makeOrders, arbitrage occurs, take asks', async () => {
	marketMaker.isMakingOrders = false;
	marketMaker.canMakeOrder = jest.fn(() => true);
	marketMaker.tokens = tokens;
	marketMaker.getEthPrice = jest.fn(() => 150);
	DualClassWrapper.calculateNav = jest.fn(() => [1, 1.2]);
	marketMaker.createOrderBookSide = jest.fn(() => Promise.resolve());
	marketMaker.takeOneSideOrders = jest.fn(() => Promise.resolve());
	marketMaker.cancelOrders = jest.fn(() => Promise.resolve());
	const relayerClient = {
		orderBookSnapshots: {
			'aETH|WETH': {
				version: 1,
				pair: 'aETH|WETH',
				bids: [
					{
						price: 0.006405,
						balance: 20,
						count: 1
					},
					{
						price: 0.006305,
						balance: 20,
						count: 1
					},
					{
						price: 0.006205,
						balance: 20,
						count: 1
					},
					{
						price: 0.006105,
						balance: 20,
						count: 1
					}
				],
				asks: [
					{
						price: 0.006605,
						balance: 20,
						count: 1
					},
					{
						price: 0.006705,
						balance: 20,
						count: 1
					},
					{
						price: 0.006805,
						balance: 20,
						count: 1
					},
					{
						price: 0.006905,
						balance: 20,
						count: 1
					}
				]
			},
			'bETH|WETH': {
				version: 1,
				pair: 'bETH',
				bids: [
					{
						price: 0.0084,
						balance: 20,
						count: 1
					},
					{
						price: 0.0083,
						balance: 20,
						count: 1
					},
					{
						price: 0.0082,
						balance: 20,
						count: 1
					},
					{
						price: 0.0081,
						balance: 20,
						count: 1
					}
				],
				asks: [
					{
						price: 0.0085,
						balance: 20,
						count: 1
					},
					{
						price: 0.0084,
						balance: 20,
						count: 1
					},
					{
						price: 0.0083,
						balance: 20,
						count: 1
					},
					{
						price: 0.0082,
						balance: 20,
						count: 1
					}
				]
			}
		}
	} as any;
	const dualClassWrapper = {
		getStates: jest.fn(() => Promise.resolve(custodianStates))
	} as any;
	await marketMaker.makeOrders(relayerClient, dualClassWrapper, 'aETH|WETH');

	expect(marketMaker.createOrderBookSide as jest.Mock).not.toBeCalled();
	for (const mockCall of (marketMaker.takeOneSideOrders as jest.Mock).mock.calls)
		expect(mockCall.slice(1)).toMatchSnapshot();
	for (const mockCall of (marketMaker.cancelOrders as jest.Mock).mock.calls)
		expect(mockCall.slice(1)).toMatchSnapshot();
});

test('makeOrders, arbitrage occurs, take bids', async () => {
	marketMaker.isMakingOrders = false;
	marketMaker.canMakeOrder = jest.fn(() => true);
	marketMaker.tokens = tokens;
	marketMaker.getEthPrice = jest.fn(() => 150);
	DualClassWrapper.calculateNav = jest.fn(() => [1, 1.2]);
	marketMaker.createOrderBookSide = jest.fn(() => Promise.resolve());
	marketMaker.takeOneSideOrders = jest.fn(() => Promise.resolve());
	marketMaker.cancelOrders = jest.fn(() => Promise.resolve());
	const relayerClient = {
		orderBookSnapshots: {
			'aETH|WETH': {
				version: 1,
				pair: 'aETH|WETH',
				bids: [
					{
						price: 0.006405,
						balance: 20,
						count: 1
					},
					{
						price: 0.006305,
						balance: 20,
						count: 1
					},
					{
						price: 0.006205,
						balance: 20,
						count: 1
					},
					{
						price: 0.006105,
						balance: 20,
						count: 1
					}
				],
				asks: [
					{
						price: 0.006605,
						balance: 20,
						count: 1
					},
					{
						price: 0.006705,
						balance: 20,
						count: 1
					},
					{
						price: 0.006805,
						balance: 20,
						count: 1
					},
					{
						price: 0.006905,
						balance: 20,
						count: 1
					}
				]
			},
			'bETH|WETH': {
				version: 1,
				pair: 'bETH',
				bids: [
					{
						price: 0.0091,
						balance: 20,
						count: 1
					},
					{
						price: 0.009,
						balance: 20,
						count: 1
					},
					{
						price: 0.0089,
						balance: 20,
						count: 1
					},
					{
						price: 0.0088,
						balance: 20,
						count: 1
					}
				],
				asks: [
					{
						price: 0.0092,
						balance: 20,
						count: 1
					},
					{
						price: 0.0093,
						balance: 20,
						count: 1
					},
					{
						price: 0.0094,
						balance: 20,
						count: 1
					},
					{
						price: 0.0095,
						balance: 20,
						count: 1
					}
				]
			}
		}
	} as any;
	const dualClassWrapper = {
		getStates: jest.fn(() => Promise.resolve(custodianStates))
	} as any;
	await marketMaker.makeOrders(relayerClient, dualClassWrapper, 'aETH|WETH');
	expect(marketMaker.createOrderBookSide as jest.Mock).not.toBeCalled();
	for (const mockCall of (marketMaker.takeOneSideOrders as jest.Mock).mock.calls)
		expect(mockCall.slice(1)).toMatchSnapshot();
	for (const mockCall of (marketMaker.cancelOrders as jest.Mock).mock.calls)
		expect(mockCall.slice(1)).toMatchSnapshot();
});

test('connectToRelayer', () => {
	const relayerClient = {
		onInfoUpdate: jest.fn(),
		onOrder: jest.fn(),
		onOrderBook: jest.fn(),
		onConnection: jest.fn(),
		connectToRelayer: jest.fn()
	};
	global.setInterval = jest.fn();
	marketMaker.connectToRelayer(relayerClient as any, {} as any);
	expect(relayerClient.onInfoUpdate.mock.calls).toMatchSnapshot();
	expect(relayerClient.onOrder.mock.calls).toMatchSnapshot();
	expect(relayerClient.onOrderBook.mock.calls).toMatchSnapshot();
	expect(relayerClient.onConnection.mock.calls).toMatchSnapshot();
	expect(relayerClient.connectToRelayer).toBeCalledTimes(1);
	expect((global.setInterval as jest.Mock).mock.calls).toMatchSnapshot();
});
