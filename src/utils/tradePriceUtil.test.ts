import { IOrderMatchRequest } from '../common/types';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';
import tradePriceUtil from './tradePriceUtil';

test('subscribeTradeUpdate', () => {
	redisUtil.subscribe = jest.fn();
	redisUtil.onTradeUpdate = jest.fn();
	const handleTradeUpdate = jest.fn();
	tradePriceUtil.subscribeTradeUpdate('pair', handleTradeUpdate);
	expect((redisUtil.subscribe as jest.Mock).mock.calls).toMatchSnapshot();
	expect(redisUtil.onTradeUpdate as jest.Mock).toBeCalledTimes(1);
	expect((redisUtil.onTradeUpdate as jest.Mock).mock.calls[0][0]).toBe(handleTradeUpdate);
});

const orderMatchReq: IOrderMatchRequest = {
	pair: 'code1|code2',
	feeAsset: 'code1',
	bid: {
		orderAmount: 10,
		orderHash: '0xleftHash',
		matchingAmount: 10,
		price: 0.001,
		fee: 0.1
	},
	ask: {
		orderAmount: 10,
		orderHash: '0xrightHash',
		matchingAmount: 10,
		price: 0.001,
		fee: 0.1
	},
	takerSide: 'bid'
};

test('persistTrade', async () => {
	redisUtil.publish = jest.fn(() => Promise.resolve());
	dynamoUtil.addTrade = jest.fn(() => Promise.resolve());
	await tradePriceUtil.persistTrade('txHash', 1234567890000, orderMatchReq, 'takerAddress');
	expect((dynamoUtil.addTrade as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock).mock.calls).toMatchSnapshot();
});

test('persistTrade ask', async () => {
	orderMatchReq.takerSide = 'ask';
	redisUtil.publish = jest.fn(() => Promise.resolve());
	dynamoUtil.addTrade = jest.fn(() => Promise.resolve());
	await tradePriceUtil.persistTrade('txHash', 1234567890000, orderMatchReq, 'takerAddress');
	expect((dynamoUtil.addTrade as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.publish as jest.Mock).mock.calls).toMatchSnapshot();
});
