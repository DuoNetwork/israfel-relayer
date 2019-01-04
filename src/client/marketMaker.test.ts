// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
// import util from '../utils/util';
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

const tokenBalances: { [key: string]: { [key: string]: number } } = {
	address: {
		WETH: 10,
		aETH: 10,
		bETH: 10
	}
};

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

test('initialize, no a token', async () => {
	const web3Util = {
		getTokenByCode: jest.fn(() => null),
		tokens: tokens,
		getTokenBalance: jest.fn((code, address) => Promise.resolve(tokenBalances[address][code]))
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
		getTokenBalance: jest.fn((code, address) => Promise.resolve(tokenBalances[address][code]))
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
