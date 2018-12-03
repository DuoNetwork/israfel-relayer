import * as CST from '../common/constants';
import dynamoUtil from './dynamoUtil';
import util from './util';

test('scanTokens', async () => {
	let scanOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanTokens()).toMatchSnapshot();
	expect((dynamoUtil.scanData as jest.Mock).mock.calls).toMatchSnapshot();
	scanOutput = {
		Items: [
			{
				[CST.DB_CUSTODIAN]: { S: 'custodian1' },
				[CST.DB_ADDRESS]: { S: 'addr1' },
				[CST.DB_CODE]: { S: 'code1' },
				[CST.DB_DENOMINATION]: { N: '1' },
				[CST.DB_PRECISIONS]: {
					M: {
						WETH: { N: '0.000005' }
					}
				},
				[CST.DB_FEE_SCHEDULES]: {
					M: {
						WETH: {
							M: {
								[CST.DB_RATE]: { N: '0' },
								[CST.DB_MIN]: { N: '1' }
							}
						}
					}
				}
			},
			{
				[CST.DB_CUSTODIAN]: { S: 'custodian2' },
				[CST.DB_ADDRESS]: { S: 'addr2' },
				[CST.DB_CODE]: { S: 'code2' },
				[CST.DB_DENOMINATION]: { N: '10' },
				[CST.DB_PRECISIONS]: {
					M: {
						WETH: { N: '0.000005' }
					}
				},
				[CST.DB_FEE_SCHEDULES]: {
					M: {
						WETH: {
							M: {
								[CST.DB_ASSET]: { S: 'asset' },
								[CST.DB_RATE]: { N: '0' },
								[CST.DB_MIN]: { N: '1' }
							}
						}
					}
				},
				[CST.DB_MATURITY]: { N: 1234567890 }
			}
		]
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanTokens()).toMatchSnapshot();
});

test('updateStatus', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.putData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.updateStatus('someProcess');
	await dynamoUtil.updateStatus('someProcess', 123);
	expect((dynamoUtil.putData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('scanStatus', async () => {
	let scanOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanStatus()).toMatchSnapshot();
	expect((dynamoUtil.scanData as jest.Mock).mock.calls).toMatchSnapshot();
	scanOutput = {
		Items: [
			{
				[CST.DB_PROCESS]: { S: 'tool|code1|code2|hostname' },
				[CST.DB_UPDATED_AT]: { N: '1234567890' },
				[CST.DB_HOSTNAME]: { S: 'hostname' },
				[CST.DB_COUNT]: { N: '123' }
			},
			{
				[CST.DB_PROCESS]: { S: 'tool|tool|hostname' },
				[CST.DB_UPDATED_AT]: { N: '1234567890' },
				[CST.DB_HOSTNAME]: { S: 'hostname' }
			}
		]
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanStatus()).toMatchSnapshot();
});

test('addLiveOrder', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.putData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.addLiveOrder({
		account: '0xAccount',
		pair: 'code1|code2',
		orderHash: '0xOrderHash',
		price: 0.123456789,
		amount: 456,
		balance: 123,
		fill: 234,
		side: CST.DB_BID,
		fee: 1,
		feeAsset: 'feeAsset',
		expiry: 1234567890,
		createdAt: 1111111111,
		initialSequence: 1,
		currentSequence: 1
	});
	expect((dynamoUtil.putData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('updateLiveOrder', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.updateData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.updateLiveOrder({
		account: '0xAccount',
		pair: 'code1|code2',
		orderHash: '0xOrderHash',
		price: 0.123456789,
		amount: 456,
		balance: 123,
		fill: 234,
		side: CST.DB_BID,
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

test('deleteLiveOrder', async () => {
	dynamoUtil.deleteData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.deleteLiveOrder({
		account: '0xAccount',
		pair: 'code1|code2',
		orderHash: '0xOrderHash',
		price: 123,
		amount: 456,
		balance: 123,
		fill: 234,
		side: CST.DB_BID,
		expiry: 1234567890,
		fee: 1,
		feeAsset: 'feeAsset',
		createdAt: 1234560000,
		updatedAt: 1234560000,
		initialSequence: 1,
		currentSequence: 2
	});
	expect((dynamoUtil.deleteData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getLiveOrders', async () => {
	let queryOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getLiveOrders('code1|code2')).toMatchSnapshot();
	expect((dynamoUtil.queryData as jest.Mock).mock.calls).toMatchSnapshot();

	queryOutput = {
		Items: [
			{
				[CST.DB_ACCOUNT]: { S: '0xAccount' },
				[CST.DB_PAIR]: { S: 'code1|code2' },
				[CST.DB_ORDER_HASH]: { S: '0xOrderHash' },
				[CST.DB_PRICE]: {
					N: '123'
				},
				[CST.DB_AMOUNT]: { N: '456' },
				[CST.DB_BALANCE]: { N: '123' },
				[CST.DB_FILL]: { N: '234' },
				[CST.DB_SIDE]: { S: 'side' },
				[CST.DB_EXP]: { N: '1234567890' },
				[CST.DB_FEE]: { N: '1' },
				[CST.DB_FEE_ASSET]: { S: 'feeAsset' },
				[CST.DB_INITIAL_SEQ]: { N: '1' },
				[CST.DB_CURRENT_SEQ]: { N: '2' },
				[CST.DB_CREATED_AT]: { N: '1234560000' },
				[CST.DB_UPDATED_AT]: { N: '1234567890' }
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
	expect(await dynamoUtil.getLiveOrders('code1|code2', 'orderHash')).toMatchSnapshot();
	expect((dynamoUtil.queryData as jest.Mock).mock.calls).toMatchSnapshot();

	queryOutput = {
		Items: [
			{
				[CST.DB_ACCOUNT]: { S: '0xAccount' },
				[CST.DB_PAIR]: { S: 'code1|code2' },
				[CST.DB_ORDER_HASH]: { S: '0xOrderHash' },
				[CST.DB_PRICE]: {
					N: '123'
				},
				[CST.DB_AMOUNT]: { N: '456' },
				[CST.DB_BALANCE]: { N: '123' },
				[CST.DB_FILL]: { N: '234' },
				[CST.DB_SIDE]: { S: 'side' },
				[CST.DB_EXP]: { N: '1234567890' },
				[CST.DB_FEE]: { N: '1' },
				[CST.DB_FEE_ASSET]: { S: 'feeAsset' },
				[CST.DB_INITIAL_SEQ]: { N: '1' },
				[CST.DB_CURRENT_SEQ]: { N: '2' },
				[CST.DB_CREATED_AT]: { N: '1234560000' },
				[CST.DB_UPDATED_AT]: { N: '1234567890' }
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

test('deleteRawOrderSignature', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.updateData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.deleteRawOrderSignature('0xOrderHash');
	expect((dynamoUtil.updateData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('addRawOrder', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.putData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.addRawOrder({
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
	});
	expect((dynamoUtil.putData as jest.Mock).mock.calls).toMatchSnapshot();
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
				[CST.DB_ORDER_HASH]: { S: '0xOrderHash' },
				[CST.DB_PAIR]: { S: 'code1|code2' },
				[CST.DB_0X_SENDER_ADDR]: { S: 'senderAddress' },
				[CST.DB_0X_MAKER_ADDR]: { S: 'makerAddress' },
				[CST.DB_0X_TAKER_ADDR]: { S: 'takerAddress' },
				[CST.DB_0X_MAKER_FEE]: { S: '0' },
				[CST.DB_0X_TAKER_FEE]: { S: '0' },
				[CST.DB_0X_MAKER_ASSET_AMT]: {
					S: '123'
				},
				[CST.DB_0X_TAKER_ASSET_AMT]: {
					S: '456'
				},
				[CST.DB_0X_MAKER_ASSET_DATA]: { S: 'makerAssetData' },
				[CST.DB_0X_TAKER_ASSET_DATA]: { S: 'takerAssetData' },
				[CST.DB_0X_SALT]: { S: '789' },
				[CST.DB_0X_EXCHANGE_ADDR]: { S: 'exchangeAddress' },
				[CST.DB_0X_FEE_RECIPIENT_ADDR]: {
					S: 'feeRecipientAddress'
				},
				[CST.DB_0X_EXPIRATION_TIME_SECONDS]: {
					S: '1234567890'
				},
				[CST.DB_0X_SIGNATURE]: { S: 'signature' },
				[CST.DB_CREATED_AT]: { N: '1234567890' },
				[CST.DB_UPDATED_AT]: { N: '1234567890' }
			}
		]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getRawOrder('0xOrderHash')).toMatchSnapshot();

	queryOutput = {
		Items: [
			{
				[CST.DB_ORDER_HASH]: { S: '0xOrderHash' },
				[CST.DB_PAIR]: { S: 'code1|code2' },
				[CST.DB_0X_SENDER_ADDR]: { S: 'senderAddress' },
				[CST.DB_0X_MAKER_ADDR]: { S: 'makerAddress' },
				[CST.DB_0X_TAKER_ADDR]: { S: 'takerAddress' },
				[CST.DB_0X_MAKER_FEE]: { S: '0' },
				[CST.DB_0X_TAKER_FEE]: { S: '0' },
				[CST.DB_0X_MAKER_ASSET_AMT]: {
					S: '123'
				},
				[CST.DB_0X_TAKER_ASSET_AMT]: {
					S: '456'
				},
				[CST.DB_0X_MAKER_ASSET_DATA]: { S: 'makerAssetData' },
				[CST.DB_0X_TAKER_ASSET_DATA]: { S: 'takerAssetData' },
				[CST.DB_0X_SALT]: { S: '789' },
				[CST.DB_0X_EXCHANGE_ADDR]: { S: 'exchangeAddress' },
				[CST.DB_0X_FEE_RECIPIENT_ADDR]: {
					S: 'feeRecipientAddress'
				},
				[CST.DB_0X_EXPIRATION_TIME_SECONDS]: {
					S: '1234567890'
				},
				[CST.DB_CREATED_AT]: { N: '1234567890' },
				[CST.DB_UPDATED_AT]: { N: '1234567890' }
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
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.putData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.addUserOrder({
		account: '0xAccount',
		pair: 'code1|code2',
		type: 'type',
		status: 'status',
		orderHash: '0xOrderHash',
		price: 0.123456789,
		balance: 123,
		amount: 456,
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

test('getUserOrdersForMonth', async () => {
	let queryOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getUserOrdersForMonth('0xAccount', '1234-56')).toMatchSnapshot();

	queryOutput = {
		Items: [
			{
				[CST.DB_ACCOUNT_YM]: {
					S: '0xAccount|year-month'
				},
				[CST.DB_PAIR_OH_SEQ_STATUS]: { S: 'code1|code2|0xOrderHash|1|status' },
				[CST.DB_TYPE]: { S: 'type' },
				[CST.DB_PRICE]: {
					N: '123'
				},
				[CST.DB_BALANCE]: { N: '123' },
				[CST.DB_AMOUNT]: { N: '456' },
				[CST.DB_FILL]: { N: '234' },
				[CST.DB_SIDE]: { S: 'side' },
				[CST.DB_EXP]: { N: '1234567890' },
				[CST.DB_FEE]: { N: '1' },
				[CST.DB_FEE_ASSET]: { S: 'feeAsset' },
				[CST.DB_INITIAL_SEQ]: { N: '1' },
				[CST.DB_CREATED_AT]: { N: '1234560000' },
				[CST.DB_UPDATED_AT]: { N: '1234567890' },
				[CST.DB_UPDATED_BY]: { S: 'updatedBy' },
				[CST.DB_PROCESSED]: { BOOL: true }
			}
		]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(
		await dynamoUtil.getUserOrdersForMonth('0xAccount', '1234-56', 'code1|code2')
	).toMatchSnapshot();
	expect((dynamoUtil.queryData as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getUserOrders', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 9876543210);
	dynamoUtil.getUserOrdersForMonth = jest.fn(() => Promise.resolve([]));
	await dynamoUtil.getUserOrders('0xAccount', 1000000000);
	expect((dynamoUtil.getUserOrdersForMonth as jest.Mock).mock.calls).toMatchSnapshot();
});
