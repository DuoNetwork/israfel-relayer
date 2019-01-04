// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
// import util from '../utils/util';
import DualClassWrapper from '../../../duo-contract-wrapper/src/DualClassWrapper';
import * as CST from '../common/constants';
import marketMaker from './marketMaker';

const userOrders = [
	{
		account: 'account',
		pair: 'aETH',
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
		pair: 'bETH',
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
		pair: 'aETH',
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
		pair: 'bETH',
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
		pair: 'aETH',
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
	expect(web3Util.setUnlimitedTokenAllowance as jest.MatcherUtils).not.toBeCalled();
	expect(web3Util.awaitTransactionSuccessAsync as jest.MatcherUtils).not.toBeCalled();
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

test('maintainBalance, isMaintainingBalance', async () => {
	marketMaker.isMaintainingBalance = true;
	const web3Util = {
		getGasPrice: jest.fn(() => 9000000000),
		tokenTransfer: jest.fn(() => Promise.resolve()),
		awaitTransactionSuccessAsync: jest.fn(() => Promise.resolve())
	} as any;

	const dualClassWrapper = {
		getStates: jest.fn(() =>
			Promise.resolve({
				resetPrice: 100,
				beta: 1,
				alpha: 1
			})
		),
		createRaw: jest.fn(() => Promise.resolve()),
		redeemRaw: jest.fn(() => Promise.resolve()),
		wrapEther: jest.fn(() => Promise.resolve())
	} as any;
	await marketMaker.maintainBalance(web3Util, dualClassWrapper);
	expect(web3Util.getGasPrice as jest.Mock).not.toBeCalled();
	expect(web3Util.tokenTransfer as jest.Mock).not.toBeCalled();
	expect(web3Util.awaitTransactionSuccessAsync as jest.Mock).not.toBeCalled();
	expect(dualClassWrapper.getStates as jest.Mock).not.toBeCalled();
	expect(dualClassWrapper.createRaw as jest.Mock).not.toBeCalled();
	expect(dualClassWrapper.redeemRaw as jest.Mock).not.toBeCalled();
	expect(dualClassWrapper.wrapEther as jest.Mock).not.toBeCalled();
});

const custodianStates = {
	resetPrice: 100,
	beta: 1,
	alpha: 1,
	createCommRate: 0.01,
	redeemCommRate: 0.01
};
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
		getStates: jest.fn(() =>
			Promise.resolve({
				resetPrice: 100,
				beta: 1,
				alpha: 1,
				createCommRate: 0.01
			})
		),
		createRaw: jest.fn(() => Promise.resolve('createRawHash')),
		redeemRaw: jest.fn(() => Promise.resolve('redeemRawHash')),
		wrapEther: jest.fn(() => Promise.resolve('wrapEtherHash'))
	} as any;
	marketMaker.tokenBalances = [11, 50, 50];
	await marketMaker.maintainBalance(web3Util, dualClassWrapper);
	expect(marketMaker.tokenBalances).toMatchSnapshot();
	expect((dualClassWrapper.createRaw as jest.Mock).mock.calls).toMatchSnapshot();
	expect(web3Util.getGasPrice as jest.Mock).toBeCalled();
	expect(web3Util.awaitTransactionSuccessAsync as jest.Mock).toBeCalled();
	expect(web3Util.tokenTransfer as jest.Mock).not.toBeCalled();
	expect(dualClassWrapper.redeemRaw as jest.Mock).not.toBeCalled();
	expect(dualClassWrapper.wrapEther as jest.Mock).not.toBeCalled();
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
	expect((dualClassWrapper.redeemRaw as jest.Mock).mock.calls).toMatchSnapshot();
	expect((web3Util.wrapEther as jest.Mock).mock.calls).toMatchSnapshot();
	expect(web3Util.getGasPrice as jest.Mock).toBeCalled();
	expect(web3Util.awaitTransactionSuccessAsync as jest.Mock).toBeCalled();
	expect(web3Util.tokenTransfer as jest.Mock).not.toBeCalled();
	expect(dualClassWrapper.createRaw as jest.Mock).not.toBeCalled();
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
	expect((web3Util.tokenTransfer as jest.Mock).mock.calls).toMatchSnapshot();
	expect(web3Util.wrapEther as jest.Mock).not.toBeCalled();
	expect(web3Util.getGasPrice as jest.Mock).toBeCalled();
	expect(web3Util.awaitTransactionSuccessAsync as jest.Mock).toBeCalled();
	expect(dualClassWrapper.redeemRaw as jest.Mock).not.toBeCalled();
	expect(dualClassWrapper.createRaw as jest.Mock).not.toBeCalled();
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
	expect((web3Util.tokenTransfer as jest.Mock).mock.calls).toMatchSnapshot();
	expect(web3Util.wrapEther as jest.Mock).not.toBeCalled();
	expect(web3Util.getGasPrice as jest.Mock).toBeCalled();
	expect(web3Util.awaitTransactionSuccessAsync as jest.Mock).toBeCalled();
	expect(dualClassWrapper.redeemRaw as jest.Mock).not.toBeCalled();
	expect(dualClassWrapper.createRaw as jest.Mock).not.toBeCalled();
});

test('initialize, no a token', async () => {
	const web3Util = {
		getTokenByCode: jest.fn(() => null),
		tokens: tokens,
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
		tokens: tokens,
		getTokenBalance: jest.fn(() => Promise.resolve(10))
	} as any;
	const relayerClient = {
		web3Util: web3Util,
		subscribeOrderBook: jest.fn(() => Promise.resolve())
	} as any;

	relayerClient.web3Util.tokens.find = jest.fn(() => null);

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

	relayerClient.web3Util.tokens.find = jest.fn(() => tokens[1]);
	marketMaker.checkAllowance = jest.fn(() => Promise.resolve());
	marketMaker.maintainBalance = jest.fn(() => Promise.resolve());
	await marketMaker.initialize(relayerClient, option);

	expect((relayerClient.web3Util.getTokenByCode as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerClient.web3Util.getTokenBalance as jest.Mock).mock.calls).toMatchSnapshot();
	expect((relayerClient.subscribeOrderHistory as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleOrderHistory', async () => {
	marketMaker.isInitialized = true;
	const dualClassWrapper = {} as any;
	const relayerClient = {
		subscribeOrderBook: jest.fn(() => Promise.resolve())
	} as any;
	marketMaker.tokens = tokens;
	marketMaker.tokenBalances = [100, 100, 100];
	marketMaker.cancelOrders = jest.fn(() => Promise.resolve());
	marketMaker.createOrderBookFromNav = jest.fn(() => Promise.resolve());
	await marketMaker.handleOrderHistory(relayerClient, dualClassWrapper, userOrders);
	expect(marketMaker.tokenBalances).toMatchSnapshot();
	for (const mockCall of (marketMaker.cancelOrders as jest.Mock).mock.calls)
		expect(mockCall.slice(1)).toMatchSnapshot();
	expect((relayerClient.subscribeOrderBook as jest.Mock).mock.calls).toMatchSnapshot();
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
			'bETH|WETH': { version: 1, pair: 'bETH', bids: [], asks: [] }
		}
	} as any;
	expect(marketMaker.canMakeOrder(relayerClient, 'aETH|WETH')).toBeFalsy();
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
			'bETH|WETH': { version: 1, pair: 'bETH', bids: [], asks: [] }
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
			'bETH|WETH': { version: 1, pair: 'bETH', bids: [], asks: [] }
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

test('makeOrders, no need to create', async () => {
	marketMaker.isMakingOrders = false;
	marketMaker.tokens = tokens;
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
				bids: [
					{
						price: 0.0015,
						balance: 20,
						count: 1
					},
					{
						price: 0.0014,
						balance: 20,
						count: 1
					},
					{
						price: 0.0013,
						balance: 20,
						count: 1
					},
					{
						price: 0.0012,
						balance: 20,
						count: 1
					}
				],
				asks: [
					{
						price: 0.0016,
						balance: 20,
						count: 1
					},
					{
						price: 0.0017,
						balance: 20,
						count: 1
					},
					{
						price: 0.0018,
						balance: 20,
						count: 1
					},
					{
						price: 0.0019,
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
						price: 0.0015,
						balance: 20,
						count: 1
					},
					{
						price: 0.0014,
						balance: 20,
						count: 1
					},
					{
						price: 0.0013,
						balance: 20,
						count: 1
					},
					{
						price: 0.0012,
						balance: 20,
						count: 1
					}
				],
				asks: [
					{
						price: 0.0016,
						balance: 20,
						count: 1
					},
					{
						price: 0.0017,
						balance: 20,
						count: 1
					},
					{
						price: 0.0018,
						balance: 20,
						count: 1
					},
					{
						price: 0.0019,
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
	// expect(marketMaker.takeOneSideOrders as jest.Mock).not.toBeCalled();
	// expect(marketMaker.cancelOrders as jest.Mock).not.toBeCalled();
});
