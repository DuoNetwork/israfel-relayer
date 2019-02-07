import * as Constants from '../../../israfel-common/src/constants';
import Util from '../../../israfel-common/src/Util';
import dynamoUtil from '../utils/dynamoUtil';
import orderMatchingUtil from '../utils/orderMatchingUtil';
import redisUtil from '../utils/redisUtil';
import orderMatchingServer from './orderMatchingServer';

jest.mock('../../../israfel-common/src', () => ({
	Constants: Constants,
	Util: Util,
	Web3Util: jest.fn(() => ({
		getAvailableAddresses: jest.fn(() => Promise.resolve(['addr1', 'addr2', 'addr3'])),
		setTokens: jest.fn()
	}))
}));

import { Web3Util } from '../../../israfel-common/src';

test('startProcessing', async () => {
	global.setTimeout = jest.fn();
	dynamoUtil.scanTokens = jest.fn(() =>
		Promise.resolve([
			{
				custodian: 'custodian',
				address: 'address',
				code: 'code',
				denomination: 0.1,
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
	redisUtil.getQueueLength = jest.fn(() => Promise.resolve(100));
	global.setInterval = jest.fn();
	let result = false;
	orderMatchingUtil.processMatchQueue = jest.fn(() => Promise.resolve(result));

	await orderMatchingServer.startServer({ server: true } as any);
	expect((Web3Util as any).mock.calls).toMatchSnapshot();
	expect((global.setInterval as jest.Mock).mock.calls).toMatchSnapshot();
	await (global.setInterval as jest.Mock).mock.calls[0][0]();
	expect((dynamoUtil.updateStatus as jest.Mock).mock.calls).toMatchSnapshot();
	expect((redisUtil.getQueueLength as jest.Mock).mock.calls).toMatchSnapshot();
	result = true;
	await (global.setTimeout as jest.Mock).mock.calls[0][0]();
	expect((global.setTimeout as jest.Mock).mock.calls).toMatchSnapshot();
});

test('startProcessing, no serveer', async () => {
	dynamoUtil.scanTokens = jest.fn(() =>
		Promise.resolve([
			{
				custodian: 'custodian',
				address: 'address',
				code: 'code',
				denomination: 0.1,
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
	redisUtil.getQueueLength = jest.fn(() => Promise.resolve(100));

	global.setTimeout = jest.fn();
	global.setInterval = jest.fn();
	orderMatchingUtil.processMatchQueue = jest.fn(() => Promise.resolve(false));

	await orderMatchingServer.startServer({ server: false } as any);
	expect(dynamoUtil.updateStatus as jest.Mock).not.toBeCalled();
	expect(redisUtil.getQueueLength as jest.Mock).not.toBeCalled();
	expect(global.setInterval as jest.Mock).not.toBeCalled();
});
