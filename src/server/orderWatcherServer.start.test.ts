// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';

import { OrderWatcher } from '0x.js';
import dynamoUtil from '../utils/dynamoUtil';
import Web3Util from '../utils/Web3Util';
import orderWatcherServer from './orderWatcherServer';

jest.mock('../utils/Web3Util', () =>
	jest.fn(() => ({
		setTokens: jest.fn(),
		getProvider: jest.fn(() => 'provider')
	}))
);

jest.mock('0x.js', () => ({
	OrderWatcher: jest.fn(() => ({
		getStats: jest.fn(() => ({
			orderCount: 10
		}))
	}))
}));

it('startServer', async () => {
	orderWatcherServer.initializeData = jest.fn(() => Promise.resolve());
	dynamoUtil.scanTokens = jest.fn(() =>
		Promise.resolve([
			{
				custodian: 'custodian',
				address: 'address',
				code: 'code',
				denomination: 0.0001,
				precisions: {
					WETH: 0.001
				},
				feeSchedules: {
					WETH: {
						minimum: 0,
						rate: 0.01
					}
				}
			}
		])
	);
	await orderWatcherServer.startServer({ env: 'dev' } as any);
	expect((OrderWatcher as any).mock.calls).toMatchSnapshot();
	expect((Web3Util as any).mock.calls).toMatchSnapshot();
	expect((orderWatcherServer.initializeData as jest.Mock).mock.calls).toMatchSnapshot();
	expect(
		((orderWatcherServer.web3Util as any).setTokens as jest.Mock).mock.calls
	).toMatchSnapshot();
});

it('startServer, server', async () => {
	orderWatcherServer.initializeData = jest.fn(() => Promise.resolve());
	orderWatcherServer.pairs = ['pair1', 'pair2'];
	dynamoUtil.scanTokens = jest.fn(() =>
		Promise.resolve([
			{
				custodian: 'custodian',
				address: 'address',
				code: 'code',
				denomination: 0.0001,
				precisions: {
					WETH: 0.001
				},
				feeSchedules: {
					WETH: {
						minimum: 0,
						rate: 0.01
					}
				}
			}
		])
	);
	dynamoUtil.updateStatus = jest.fn();
	global.setInterval = jest.fn();
	await orderWatcherServer.startServer({ env: 'live', server: true } as any);

	expect((dynamoUtil.updateStatus as any).mock.calls).toMatchSnapshot();
	expect((global.setInterval as any).mock.calls).toMatchSnapshot();
	(global.setInterval as jest.Mock).mock.calls[0][0]();
	expect((dynamoUtil.updateStatus as jest.Mock).mock.calls).toMatchSnapshot();
});
