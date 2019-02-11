import { Constants, Util } from '@finbook/israfel-common';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import dynamoUtil from './dynamoUtil';

jest.mock('aws-sdk/clients/dynamodb', () => jest.fn().mockImplementation(() => ({})));
jest.mock('aws-sdk/global', () => ({
	config: {
		update: jest.fn()
	}
}));

import AWS from 'aws-sdk/global';

test('init', async () => {
	await dynamoUtil.init('config' as any, 'env', 't', 'h');
	expect(dynamoUtil.tool).toBe('t');
	expect(dynamoUtil.hostname).toBe('h');
	await dynamoUtil.init('config' as any, 'env');
	expect((DynamoDB as any).mock.calls).toMatchSnapshot();
	expect(dynamoUtil.ddb).toBeTruthy();
	expect(dynamoUtil.env).toBe('env');
	expect(dynamoUtil.tool).toBe('tool');
	expect(dynamoUtil.hostname).toBe('hostname');
	expect((AWS.config.update as jest.Mock).mock.calls).toMatchSnapshot();
});

test('putData no ddb', async () => {
	dynamoUtil.ddb = undefined;
	try {
		await dynamoUtil.putData({} as any);
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('transactPutData no ddb', async () => {
	try {
		await dynamoUtil.transactPutData({} as any);
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('updateData no ddb', async () => {
	try {
		await dynamoUtil.updateData({} as any);
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('queryData no ddb', async () => {
	try {
		await dynamoUtil.queryData({} as any);
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('scanData no ddb', async () => {
	try {
		await dynamoUtil.scanData({} as any);
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('deleteData no ddb', async () => {
	try {
		await dynamoUtil.deleteData({} as any);
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('putData error', async () => {
	const mock = jest.fn((params: any, cb: any) => cb(params));
	dynamoUtil.ddb = {
		putItem: mock
	} as any;
	try {
		await dynamoUtil.putData({} as any);
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('transactPutData error', async () => {
	const mock = jest.fn((params: any, cb: any) => cb(params));
	dynamoUtil.ddb = {
		transactWriteItems: mock
	} as any;
	try {
		await dynamoUtil.transactPutData({} as any);
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('updateData error', async () => {
	const mock = jest.fn((params: any, cb: any) => cb(params));
	dynamoUtil.ddb = {
		updateItem: mock
	} as any;
	try {
		await dynamoUtil.updateData({} as any);
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('queryData error', async () => {
	const mock = jest.fn((params: any, cb: any) => cb(params));
	dynamoUtil.ddb = {
		query: mock
	} as any;
	try {
		await dynamoUtil.queryData({} as any);
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('scanData error', async () => {
	const mock = jest.fn((params: any, cb: any) => cb(params));
	dynamoUtil.ddb = {
		scan: mock
	} as any;
	try {
		await dynamoUtil.scanData({} as any);
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('deleteData error', async () => {
	const mock = jest.fn((params: any, cb: any) => cb(params));
	dynamoUtil.ddb = {
		deleteItem: mock
	} as any;
	try {
		await dynamoUtil.deleteData({} as any);
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('putData', async () => {
	const mock = jest.fn((params: any, cb: any) => params && cb());
	dynamoUtil.ddb = {
		putItem: mock
	} as any;
	await dynamoUtil.putData({} as any);
	expect(mock.mock.calls).toMatchSnapshot();
});

test('transactPutData', async () => {
	const mock = jest.fn((params: any, cb: any) => params && cb());
	dynamoUtil.ddb = {
		transactWriteItems: mock
	} as any;
	await dynamoUtil.transactPutData({} as any);
	expect(mock.mock.calls).toMatchSnapshot();
});

test('updateData', async () => {
	const mock = jest.fn((params: any, cb: any) => params && cb());
	dynamoUtil.ddb = {
		updateItem: mock
	} as any;
	await dynamoUtil.updateData({} as any);
	expect(mock.mock.calls).toMatchSnapshot();
});

test('queryData', async () => {
	const mock = jest.fn((params: any, cb: any) => params && cb());
	dynamoUtil.ddb = {
		query: mock
	} as any;
	await dynamoUtil.queryData({} as any);
	expect(mock.mock.calls).toMatchSnapshot();
});

test('scanData', async () => {
	const mock = jest.fn((params: any, cb: any) => params && cb());
	dynamoUtil.ddb = {
		scan: mock
	} as any;
	await dynamoUtil.scanData({} as any);
	expect(mock.mock.calls).toMatchSnapshot();
});

test('deleteData', async () => {
	const mock = jest.fn((params: any, cb: any) => params && cb());
	dynamoUtil.ddb = {
		deleteItem: mock
	} as any;
	await dynamoUtil.deleteData({} as any);
	expect(mock.mock.calls).toMatchSnapshot();
});

test('scanTokens', async () => {
	let scanOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanTokens()).toEqual([]);
	expect((dynamoUtil.scanData as jest.Mock).mock.calls).toMatchSnapshot();
	scanOutput = {
		Items: [
			{
				[Constants.DB_CUSTODIAN]: { S: 'custodian1' },
				[Constants.DB_ADDRESS]: { S: 'addr1' },
				[Constants.DB_CODE]: { S: 'code1' },
				[Constants.DB_DENOMINATION]: { N: '1' },
				[Constants.DB_PRECISIONS]: {
					M: {
						WETH: { N: '0.000005' }
					}
				},
				[Constants.DB_FEE_SCHEDULES]: {
					M: {
						WETH: {
							M: {
								[Constants.DB_RATE]: { N: '0' },
								[Constants.DB_MIN]: { N: '1' }
							}
						}
					}
				}
			},
			{
				[Constants.DB_CUSTODIAN]: { S: 'custodian2' },
				[Constants.DB_ADDRESS]: { S: 'addr2' },
				[Constants.DB_CODE]: { S: 'code2' },
				[Constants.DB_DENOMINATION]: { N: '10' },
				[Constants.DB_PRECISIONS]: {
					M: {
						WETH: { N: '0.000005' }
					}
				},
				[Constants.DB_FEE_SCHEDULES]: {
					M: {
						WETH: {
							M: {
								[Constants.DB_ASSET]: { S: 'asset' },
								[Constants.DB_RATE]: { N: '0' },
								[Constants.DB_MIN]: { N: '1' }
							}
						}
					}
				},
				[Constants.DB_MATURITY]: { N: 1234567890 }
			},
			{
				[Constants.DB_CUSTODIAN]: { S: 'custodian3' },
				[Constants.DB_ADDRESS]: { S: 'addr3' },
				[Constants.DB_CODE]: { S: 'code3' },
				[Constants.DB_DENOMINATION]: { N: '10' },
				[Constants.DB_PRECISIONS]: {
					M: {
						WETH: { N: '0.000005' }
					}
				},
				[Constants.DB_FEE_SCHEDULES]: {
					M: {
						WETH: {
							M: {
								[Constants.DB_ASSET]: {},
								[Constants.DB_RATE]: { N: '0' },
								[Constants.DB_MIN]: { N: '1' }
							}
						}
					}
				},
				[Constants.DB_MATURITY]: { N: 1234567890 }
			},
			{
				[Constants.DB_CUSTODIAN]: { S: 'custodian4' },
				[Constants.DB_ADDRESS]: { S: 'addr4' },
				[Constants.DB_CODE]: { S: 'code4' },
				[Constants.DB_DENOMINATION]: { N: '10' },
				[Constants.DB_PRECISIONS]: {
					M: {
						WETH: { N: '0.000005' }
					}
				},
				[Constants.DB_FEE_SCHEDULES]: {
					M: {
						WETH: {}
					}
				},
				[Constants.DB_MATURITY]: { N: 1234567890 }
			},
			{
				[Constants.DB_CUSTODIAN]: {},
				[Constants.DB_ADDRESS]: {},
				[Constants.DB_CODE]: {},
				[Constants.DB_DENOMINATION]: { N: '10' },
				[Constants.DB_PRECISIONS]: {},
				[Constants.DB_FEE_SCHEDULES]: {},
				[Constants.DB_MATURITY]: { N: 1234567890 }
			}
		]
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanTokens()).toMatchSnapshot();
});

test('scanIpList', async () => {
	let scanOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanIpList()).toEqual({});
	expect((dynamoUtil.scanData as jest.Mock).mock.calls).toMatchSnapshot();
	scanOutput = {
		Items: [
			{
				[Constants.DB_IP]: { S: 'ip1' },
				[Constants.DB_COLOR]: { S: Constants.DB_WHITE }
			},
			{
				[Constants.DB_IP]: { S: 'ip2' },
				[Constants.DB_COLOR]: { S: Constants.DB_BLACK }
			},
			{
				[Constants.DB_IP]: { S: 'ip3' },
				[Constants.DB_COLOR]: { S: '' }
			},
			{
				[Constants.DB_IP]: { S: '' },
				[Constants.DB_COLOR]: { S: Constants.DB_BLACK }
			}
		]
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanIpList()).toMatchSnapshot();
});

test('updateIpList', async () => {
	dynamoUtil.putData = jest.fn();
	await dynamoUtil.updateIpList('ip', 'color');
	expect((dynamoUtil.putData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('updateStatus', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.putData = jest.fn(() => Promise.resolve());
	await dynamoUtil.updateStatus('someProcess');
	await dynamoUtil.updateStatus('someProcess', 123);
	expect((dynamoUtil.putData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('updateStatus failed', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.putData = jest.fn(() => Promise.reject('putDataError'));
	await dynamoUtil.updateStatus('someProcess');
	expect((dynamoUtil.putData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('scanStatus', async () => {
	let scanOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanStatus()).toEqual([]);
	expect((dynamoUtil.scanData as jest.Mock).mock.calls).toMatchSnapshot();
	scanOutput = {
		Items: [
			{
				[Constants.DB_PROCESS]: { S: 'tool|code1|code2|hostname' },
				[Constants.DB_UPDATED_AT]: { N: '1234567890' },
				[Constants.DB_HOSTNAME]: { S: 'hostname' },
				[Constants.DB_COUNT]: { N: '123' }
			},
			{
				[Constants.DB_PROCESS]: { S: 'tool|tool|hostname' },
				[Constants.DB_UPDATED_AT]: { N: '1234567890' },
				[Constants.DB_HOSTNAME]: { S: 'hostname' }
			},
			{
				[Constants.DB_PROCESS]: {},
				[Constants.DB_UPDATED_AT]: { N: '1234567890' },
				[Constants.DB_HOSTNAME]: {}
			}
		]
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanStatus()).toMatchSnapshot();
});

test('updateLiveOrder', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.updateData = jest.fn(() => Promise.resolve());
	await dynamoUtil.updateLiveOrder({
		account: '0xAccount',
		pair: 'code1|code2',
		orderHash: '0xOrderHash',
		price: 0.123456789,
		amount: 456,
		balance: 123,
		matching: 111,
		fill: 234,
		side: Constants.DB_BID,
		expiry: 1234567890,
		fee: 1,
		feeAsset: 'feeAsset',
		createdAt: 1234560000,
		updatedAt: 1234560000,
		initialSequence: 1,
		currentSequence: 2
	});
	expect((dynamoUtil.updateData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getLiveOrders', async () => {
	let queryOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getLiveOrders('code1|code2')).toEqual([]);
	expect((dynamoUtil.queryData as jest.Mock).mock.calls).toMatchSnapshot();

	queryOutput = {
		Items: [
			{
				[Constants.DB_ACCOUNT]: { S: '0xAccount' },
				[Constants.DB_PAIR]: { S: 'code1|code2' },
				[Constants.DB_ORDER_HASH]: { S: '0xOrderHash' },
				[Constants.DB_PRICE]: {
					N: '123'
				},
				[Constants.DB_AMOUNT]: { N: '456' },
				[Constants.DB_BALANCE]: { N: '123' },
				[Constants.DB_MATCHING]: { N: '111' },
				[Constants.DB_FILL]: { N: '234' },
				[Constants.DB_SIDE]: { S: 'side' },
				[Constants.DB_EXP]: { N: '1234567890' },
				[Constants.DB_FEE]: { N: '1' },
				[Constants.DB_FEE_ASSET]: { S: 'feeAsset' },
				[Constants.DB_INITIAL_SEQ]: { N: '1' },
				[Constants.DB_CURRENT_SEQ]: { N: '2' },
				[Constants.DB_CREATED_AT]: { N: '1234560000' },
				[Constants.DB_UPDATED_AT]: { N: '1234567890' }
			}
		]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getLiveOrders('code1|code2')).toMatchSnapshot();
});

test('getLiveOrders with orderHash', async () => {
	let queryOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getLiveOrders('code1|code2', 'orderHash')).toEqual([]);
	expect((dynamoUtil.queryData as jest.Mock).mock.calls).toMatchSnapshot();

	queryOutput = {
		Items: [
			{
				[Constants.DB_ACCOUNT]: { S: '0xAccount' },
				[Constants.DB_PAIR]: { S: 'code1|code2' },
				[Constants.DB_ORDER_HASH]: { S: '0xOrderHash' },
				[Constants.DB_PRICE]: {
					N: '123'
				},
				[Constants.DB_AMOUNT]: { N: '456' },
				[Constants.DB_BALANCE]: { N: '123' },
				[Constants.DB_MATCHING]: { N: '111' },
				[Constants.DB_FILL]: { N: '234' },
				[Constants.DB_SIDE]: { S: 'side' },
				[Constants.DB_EXP]: { N: '1234567890' },
				[Constants.DB_FEE]: { N: '1' },
				[Constants.DB_FEE_ASSET]: { S: 'feeAsset' },
				[Constants.DB_INITIAL_SEQ]: { N: '1' },
				[Constants.DB_CURRENT_SEQ]: { N: '2' },
				[Constants.DB_CREATED_AT]: { N: '1234560000' },
				[Constants.DB_UPDATED_AT]: { N: '1234567890' }
			}
		]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getLiveOrders('code1|code2', 'orderHash')).toMatchSnapshot();

	queryOutput = {
		Items: [
			{
				[Constants.DB_ACCOUNT]: {},
				[Constants.DB_PAIR]: {},
				[Constants.DB_ORDER_HASH]: {},
				[Constants.DB_PRICE]: {
					N: '123'
				},
				[Constants.DB_AMOUNT]: { N: '456' },
				[Constants.DB_BALANCE]: { N: '123' },
				[Constants.DB_MATCHING]: { N: '111' },
				[Constants.DB_FILL]: { N: '234' },
				[Constants.DB_SIDE]: {},
				[Constants.DB_EXP]: { N: '1234567890' },
				[Constants.DB_FEE]: { N: '1' },
				[Constants.DB_FEE_ASSET]: {},
				[Constants.DB_INITIAL_SEQ]: { N: '1' },
				[Constants.DB_CURRENT_SEQ]: { N: '2' },
				[Constants.DB_CREATED_AT]: { N: '1234560000' },
				[Constants.DB_UPDATED_AT]: { N: '1234567890' }
			}
		]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getLiveOrders('code1|code2', 'orderHash')).toMatchSnapshot();

	queryOutput = {
		Items: [{}, {}]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));

	try {
		await dynamoUtil.getLiveOrders('code1|code2', 'orderHash');
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('getRawOrder', async () => {
	let queryOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getRawOrder('0xOrderHash')).toBeNull();
	expect((dynamoUtil.queryData as jest.Mock).mock.calls).toMatchSnapshot();

	queryOutput = {
		Items: [
			{
				[Constants.DB_ORDER_HASH]: { S: '0xOrderHash' },
				[Constants.DB_PAIR]: { S: 'code1|code2' },
				[Constants.DB_0X_SENDER_ADDR]: { S: 'senderAddress' },
				[Constants.DB_0X_MAKER_ADDR]: { S: 'makerAddress' },
				[Constants.DB_0X_TAKER_ADDR]: { S: 'takerAddress' },
				[Constants.DB_0X_MAKER_FEE]: { S: '0' },
				[Constants.DB_0X_TAKER_FEE]: { S: '0' },
				[Constants.DB_0X_MAKER_ASSET_AMT]: {
					S: '123'
				},
				[Constants.DB_0X_TAKER_ASSET_AMT]: {
					S: '456'
				},
				[Constants.DB_0X_MAKER_ASSET_DATA]: { S: 'makerAssetData' },
				[Constants.DB_0X_TAKER_ASSET_DATA]: { S: 'takerAssetData' },
				[Constants.DB_0X_SALT]: { S: '789' },
				[Constants.DB_0X_EXCHANGE_ADDR]: { S: 'exchangeAddress' },
				[Constants.DB_0X_FEE_RECIPIENT_ADDR]: {
					S: 'feeRecipientAddress'
				},
				[Constants.DB_0X_EXPIRATION_TIME_SECONDS]: {
					S: '1234567890'
				},
				[Constants.DB_0X_SIGNATURE]: { S: 'signature' },
				[Constants.DB_CREATED_AT]: { N: '1234567890' },
				[Constants.DB_UPDATED_AT]: { N: '1234567890' }
			}
		]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getRawOrder('0xOrderHash')).toMatchSnapshot();

	queryOutput = {
		Items: [
			{
				[Constants.DB_ORDER_HASH]: {},
				[Constants.DB_PAIR]: {},
				[Constants.DB_0X_SENDER_ADDR]: {},
				[Constants.DB_0X_MAKER_ADDR]: {},
				[Constants.DB_0X_TAKER_ADDR]: {},
				[Constants.DB_0X_MAKER_FEE]: {},
				[Constants.DB_0X_TAKER_FEE]: {},
				[Constants.DB_0X_MAKER_ASSET_AMT]: {},
				[Constants.DB_0X_TAKER_ASSET_AMT]: {},
				[Constants.DB_0X_MAKER_ASSET_DATA]: {},
				[Constants.DB_0X_TAKER_ASSET_DATA]: {},
				[Constants.DB_0X_SALT]: {},
				[Constants.DB_0X_EXCHANGE_ADDR]: {},
				[Constants.DB_0X_FEE_RECIPIENT_ADDR]: {},
				[Constants.DB_0X_EXPIRATION_TIME_SECONDS]: {},
				[Constants.DB_0X_SIGNATURE]: {},
				[Constants.DB_CREATED_AT]: { N: '1234567890' },
				[Constants.DB_UPDATED_AT]: { N: '1234567890' }
			}
		]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getRawOrder('0xOrderHash')).toMatchSnapshot();

	queryOutput = {
		Items: [
			{
				[Constants.DB_ORDER_HASH]: { S: '0xOrderHash' },
				[Constants.DB_PAIR]: { S: 'code1|code2' },
				[Constants.DB_0X_SENDER_ADDR]: { S: 'senderAddress' },
				[Constants.DB_0X_MAKER_ADDR]: { S: 'makerAddress' },
				[Constants.DB_0X_TAKER_ADDR]: { S: 'takerAddress' },
				[Constants.DB_0X_MAKER_FEE]: { S: '0' },
				[Constants.DB_0X_TAKER_FEE]: { S: '0' },
				[Constants.DB_0X_MAKER_ASSET_AMT]: {
					S: '123'
				},
				[Constants.DB_0X_TAKER_ASSET_AMT]: {
					S: '456'
				},
				[Constants.DB_0X_MAKER_ASSET_DATA]: { S: 'makerAssetData' },
				[Constants.DB_0X_TAKER_ASSET_DATA]: { S: 'takerAssetData' },
				[Constants.DB_0X_SALT]: { S: '789' },
				[Constants.DB_0X_EXCHANGE_ADDR]: { S: 'exchangeAddress' },
				[Constants.DB_0X_FEE_RECIPIENT_ADDR]: {
					S: 'feeRecipientAddress'
				},
				[Constants.DB_0X_EXPIRATION_TIME_SECONDS]: {
					S: '1234567890'
				},
				[Constants.DB_CREATED_AT]: { N: '1234567890' },
				[Constants.DB_UPDATED_AT]: { N: '1234567890' }
			}
		]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getRawOrder('0xOrderHash')).toMatchSnapshot();

	queryOutput = {
		Items: [{}, {}]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	try {
		await dynamoUtil.getRawOrder('0xOrderHash');
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('addUserOrder', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.putData = jest.fn(() => Promise.resolve());
	await dynamoUtil.addUserOrder({
		account: '0xAccount',
		pair: 'code1|code2',
		type: 'type',
		status: 'status',
		orderHash: '0xOrderHash',
		price: 0.123456789,
		balance: 123,
		amount: 456,
		matching: 111,
		fill: 234,
		side: 'side',
		expiry: 1234567890,
		fee: 1,
		feeAsset: 'feeAsset',
		createdAt: 1234560000,
		initialSequence: 1,
		currentSequence: 2,
		updatedBy: 'updatedBy',
		processed: false
	});
	expect((dynamoUtil.putData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('addUserOrder with txHash', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.putData = jest.fn(() => Promise.resolve());
	await dynamoUtil.addUserOrder({
		account: '0xAccount',
		pair: 'code1|code2',
		type: 'type',
		status: 'status',
		orderHash: '0xOrderHash',
		price: 0.123456789,
		balance: 123,
		amount: 456,
		matching: 111,
		fill: 234,
		side: 'side',
		expiry: 1234567890,
		fee: 1,
		feeAsset: 'feeAsset',
		createdAt: 1234560000,
		initialSequence: 1,
		currentSequence: 2,
		updatedBy: 'updatedBy',
		processed: false,
		transactionHash: 'txHash'
	});
	expect((dynamoUtil.putData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getUserOrdersForPairDate', async () => {
	let queryOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(
		await dynamoUtil.getUserOrdersForPairDate('0xAccount', 'code1|code2', '1234-56-78')
	).toEqual([]);

	queryOutput = {
		Items: [
			{
				[Constants.DB_ACCOUNT_PAIR_DATE]: {
					S: '0xAccount|code1|code2|YYYY-MM-DD'
				},
				[Constants.DB_CA_SEQ]: { S: '1234560000|1' },
				[Constants.DB_ORDER_HASH]: { S: '0xOrderHash' },
				[Constants.DB_TYPE]: { S: 'type' },
				[Constants.DB_STATUS]: { S: 'status' },
				[Constants.DB_PRICE]: {
					N: '123'
				},
				[Constants.DB_BALANCE]: { N: '123' },
				[Constants.DB_AMOUNT]: { N: '456' },
				[Constants.DB_MATCHING]: { N: '111' },
				[Constants.DB_FILL]: { N: '234' },
				[Constants.DB_SIDE]: { S: 'side' },
				[Constants.DB_EXP]: { N: '1234567890' },
				[Constants.DB_FEE]: { N: '1' },
				[Constants.DB_FEE_ASSET]: { S: 'feeAsset' },
				[Constants.DB_INITIAL_SEQ]: { N: '1' },
				[Constants.DB_UPDATED_AT]: { N: '1234567890' },
				[Constants.DB_UPDATED_BY]: { S: 'updatedBy' },
				[Constants.DB_PROCESSED]: { BOOL: true }
			},
			{
				[Constants.DB_ACCOUNT_PAIR_DATE]: {
					S: '0xAccount|code1|code2|YYYY-MM-DD'
				},
				[Constants.DB_CA_SEQ]: { S: '1234560000|1' },
				[Constants.DB_ORDER_HASH]: { S: '0xOrderHash' },
				[Constants.DB_TYPE]: { S: 'type' },
				[Constants.DB_STATUS]: { S: 'status' },
				[Constants.DB_PRICE]: {
					N: '123'
				},
				[Constants.DB_BALANCE]: { N: '123' },
				[Constants.DB_AMOUNT]: { N: '456' },
				[Constants.DB_MATCHING]: { N: '111' },
				[Constants.DB_FILL]: { N: '234' },
				[Constants.DB_SIDE]: { S: 'side' },
				[Constants.DB_EXP]: { N: '1234567890' },
				[Constants.DB_FEE]: { N: '1' },
				[Constants.DB_FEE_ASSET]: { S: 'feeAsset' },
				[Constants.DB_INITIAL_SEQ]: { N: '1' },
				[Constants.DB_UPDATED_AT]: { N: '1234567890' },
				[Constants.DB_UPDATED_BY]: { S: 'updatedBy' },
				[Constants.DB_PROCESSED]: { BOOL: true },
				[Constants.DB_TX_HASH]: { S: 'txHash' }
			},
			{
				[Constants.DB_ACCOUNT_PAIR_DATE]: {},
				[Constants.DB_CA_SEQ]: {},
				[Constants.DB_ORDER_HASH]: {},
				[Constants.DB_TYPE]: {},
				[Constants.DB_STATUS]: {},
				[Constants.DB_PRICE]: {
					N: '123'
				},
				[Constants.DB_BALANCE]: { N: '123' },
				[Constants.DB_AMOUNT]: { N: '456' },
				[Constants.DB_MATCHING]: { N: '111' },
				[Constants.DB_FILL]: { N: '234' },
				[Constants.DB_SIDE]: {},
				[Constants.DB_EXP]: { N: '1234567890' },
				[Constants.DB_FEE]: { N: '1' },
				[Constants.DB_FEE_ASSET]: {},
				[Constants.DB_INITIAL_SEQ]: { N: '1' },
				[Constants.DB_UPDATED_AT]: { N: '1234567890' },
				[Constants.DB_UPDATED_BY]: {},
				[Constants.DB_PROCESSED]: { BOOL: true },
				[Constants.DB_TX_HASH]: {}
			}
		]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(
		await dynamoUtil.getUserOrdersForPairDate('0xAccount', 'code1|code2', '1234-56-78')
	).toMatchSnapshot();
	expect((dynamoUtil.queryData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getUserOrders', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 9876543210);
	dynamoUtil.getUserOrdersForPairDate = jest.fn(() => Promise.resolve([]));
	await dynamoUtil.getUserOrders('0xAccount', 'code1|code2', 9000000000);
	expect((dynamoUtil.getUserOrdersForPairDate as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getUserOrders end pair', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 9876543210);
	dynamoUtil.getUserOrdersForPairDate = jest.fn(() => Promise.resolve([]));
	await dynamoUtil.getUserOrders('0xAccount', 'code1|code2', 9000000000, 9876543210);
	expect((dynamoUtil.getUserOrdersForPairDate as jest.Mock).mock.calls).toMatchSnapshot();
});

test('addTrade', async () => {
	dynamoUtil.putData = jest.fn(() => Promise.resolve());
	await dynamoUtil.addTrade({
		pair: 'code1|code2',
		transactionHash: 'txHash',
		taker: {
			orderHash: 'takerOrderHash',
			address: 'takerAddress',
			side: 'takerSide',
			price: 123,
			amount: 456,
			fee: 789
		},
		maker: {
			orderHash: 'makerOrderHash',
			price: 987,
			amount: 654,
			fee: 321
		},
		feeAsset: 'feeAsset',
		timestamp: 1234567890
	});
	expect((dynamoUtil.putData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getTradesForHour', async () => {
	let queryOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getTradesForHour('code1|code2', '1234-56-78-90')).toEqual([]);

	queryOutput = {
		Items: [
			{
				[Constants.DB_PAIR_DATE_HOUR]: {
					S: 'code1|code2|1234-56-78-90'
				},
				[Constants.DB_TS_TX_HASH]: { S: '1234567890|txHash' },
				[Constants.DB_FEE_ASSET]: { S: 'feeAsset' },
				[Constants.DB_TK_OH]: { S: 'takerOrderHash' },
				[Constants.DB_TK_ADDR]: { S: 'takerAddress' },
				[Constants.DB_TK_SIDE]: { S: 'takerSide' },
				[Constants.DB_TK_PX]: { N: '123' },
				[Constants.DB_TK_AMT]: { N: '456' },
				[Constants.DB_TK_FEE]: { N: '789' },
				[Constants.DB_MK_OH]: { S: 'makerOrderHash' },
				[Constants.DB_MK_PX]: { N: '987' },
				[Constants.DB_MK_AMT]: { N: '654' },
				[Constants.DB_MK_FEE]: { N: '321' }
			},
			{
				[Constants.DB_PAIR_DATE_HOUR]: {},
				[Constants.DB_TS_TX_HASH]: {},
				[Constants.DB_FEE_ASSET]: {},
				[Constants.DB_TK_OH]: {},
				[Constants.DB_TK_ADDR]: {},
				[Constants.DB_TK_SIDE]: {},
				[Constants.DB_TK_PX]: { N: '123' },
				[Constants.DB_TK_AMT]: { N: '456' },
				[Constants.DB_TK_FEE]: { N: '789' },
				[Constants.DB_MK_OH]: {},
				[Constants.DB_MK_PX]: { N: '987' },
				[Constants.DB_MK_AMT]: { N: '654' },
				[Constants.DB_MK_FEE]: { N: '321' }
			}
		]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getTradesForHour('code1|code2', '1234-56-78-90')).toMatchSnapshot();
	expect((dynamoUtil.queryData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getTrades', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 9876543210);
	dynamoUtil.getTradesForHour = jest.fn(() => Promise.resolve([]));
	await dynamoUtil.getTrades('code1|code2', 9870000000);
	expect((dynamoUtil.getTradesForHour as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getTrades end', async () => {
	dynamoUtil.getTradesForHour = jest.fn(() => Promise.resolve([]));
	await dynamoUtil.getTrades('code1|code2', 9870000000, 9876543210);
	expect((dynamoUtil.getTradesForHour as jest.Mock).mock.calls).toMatchSnapshot();
});

test('addOrder', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 9876543210);
	dynamoUtil.transactPutData = jest.fn(() => Promise.resolve());
	await dynamoUtil.addOrder(
		{
			account: '0xAccount',
			pair: 'code1|code2',
			orderHash: '0xOrderHash',
			price: 0.123456789,
			amount: 456,
			balance: 123,
			matching: 111,
			fill: 234,
			side: Constants.DB_BID,
			expiry: 1234567890,
			fee: 1,
			feeAsset: 'feeAsset',
			createdAt: 1234560000,
			updatedAt: 1234560000,
			initialSequence: 1,
			currentSequence: 2
		},
		{
			pair: 'code1|code2',
			orderHash: '0xOrderHash',
			signedOrder: {
				senderAddress: 'senderAddress',
				makerAddress: 'makerAddress',
				takerAddress: 'takerAddress',
				makerFee: '0',
				takerFee: '0',
				makerAssetAmount: '123',
				takerAssetAmount: '456',
				makerAssetData: 'makerAssetData',
				takerAssetData: 'takerAssetData',
				salt: '789',
				exchangeAddress: 'exchangeAddress',
				feeRecipientAddress: 'feeRecipientAddress',
				expirationTimeSeconds: '1234567890',
				signature: 'signature'
			}
		} as any
	);
	expect((dynamoUtil.transactPutData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('deleteOrder', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 9876543210);
	dynamoUtil.transactPutData = jest.fn(() => Promise.resolve());
	await dynamoUtil.deleteOrder('code1|code2', '0xOrderHash');
	expect((dynamoUtil.transactPutData as jest.Mock).mock.calls).toMatchSnapshot();
});
