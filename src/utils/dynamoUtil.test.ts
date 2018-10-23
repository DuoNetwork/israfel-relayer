import * as CST from '../common/constants';
import dynamoUtil from './dynamoUtil';
import util from './util';

test('updateStatus', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.putData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.updateStatus('someProcess');
	expect((dynamoUtil.putData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
});

test('scanStatus', async () => {
	let scanOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanStatus()).toMatchSnapshot();
	expect((dynamoUtil.scanData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
	scanOutput = {
		Items: [
			{
				[CST.DB_STS_PROCESS]: { S: 'tool|pair' },
				[CST.DB_UPDATED_AT]: { N: '1234567890' },
				[CST.DB_STS_HOSTNAME]: { S: 'hostname' }
			},
			{
				[CST.DB_STS_PROCESS]: { S: 'tool|' },
				[CST.DB_UPDATED_AT]: { N: '1234567890' },
				[CST.DB_STS_HOSTNAME]: { S: 'hostname' }
			}
		]
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanStatus()).toMatchSnapshot();
});

test('updateSequence', async () => {
	dynamoUtil.putData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.updateSequence('pair', 123);
	expect((dynamoUtil.putData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
});

test('scanSequence', async () => {
	let scanOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanSequence()).toMatchSnapshot();
	expect((dynamoUtil.scanData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
	scanOutput = {
		Items: [
			{
				[CST.DB_PAIR]: { S: 'pair' },
				[CST.DB_SEQUENCE]: { N: '123' }
			}
		]
	};
	dynamoUtil.scanData = jest.fn(() => Promise.resolve(scanOutput));
	expect(await dynamoUtil.scanSequence()).toMatchSnapshot();
});

test('addLiveOrder', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.putData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.addLiveOrder({
		pair: 'pair',
		orderHash: '0xOrderHash',
		price: 0.123456789,
		amount: 456,
		side: CST.DB_BID,
		initialSequence: 1,
		currentSequence: 1
	});
	expect((dynamoUtil.putData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
});

test('updateLiveOrder', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.updateData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.updateLiveOrder({
		pair: 'pair',
		orderHash: '0xOrderHash',
		price: 0.123456789,
		amount: 456,
		side: CST.DB_BID,
		createdAt: 1234560000,
		updatedAt: 1234560000,
		initialSequence: 1,
		currentSequence: 2
	});
	expect((dynamoUtil.updateData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
});

test('deleteLiveOrder', async () => {
	dynamoUtil.deleteData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.deleteLiveOrder({
		pair: 'pair',
		orderHash: '0xOrderHash',
		price: 123,
		amount: 456,
		side: CST.DB_BID,
		createdAt: 1234560000,
		updatedAt: 1234560000,
		initialSequence: 1,
		currentSequence: 2
	});
	expect((dynamoUtil.deleteData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
});

test('getLiveOrders', async () => {
	let queryOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getLiveOrders('pair')).toMatchSnapshot();
	expect((dynamoUtil.queryData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();

	queryOutput = {
		Items: [
			{
				[CST.DB_PAIR]: { S: 'pair' },
				[CST.DB_ORDER_HASH]: { S: '0xOrderHash' },
				[CST.DB_PRICE]: {
					N: '123'
				},
				[CST.DB_BALANCE]: { N: '456' },
				[CST.DB_SIDE]: { S: 'side' },
				[CST.DB_INITIAL_SEQ]: { N: '1' },
				[CST.DB_CURRENT_SEQ]: { N: '2' },
				[CST.DB_CREATED_AT]: { N: '1234560000' },
				[CST.DB_UPDATED_AT]: { N: '1234567890' }
			}
		]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getLiveOrders('pair')).toMatchSnapshot();
});

test('deleteRawOrderSignature', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.updateData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.deleteRawOrderSignature('0xOrderHash');
	expect((dynamoUtil.updateData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
});

test('addRawOrder', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	dynamoUtil.putData = jest.fn(() => Promise.resolve({}));
	await dynamoUtil.addRawOrder({
		orderHash: '0xOrderHash',
		signedOrder: {
			senderAddress: 'senderAddress',
			makerAddress: 'makerAddress',
			takerAddress: 'takerAddress',
			makerFee: util.stringToBN('0'),
			takerFee: util.stringToBN('0'),
			makerAssetAmount: util.stringToBN('123'),
			takerAssetAmount: util.stringToBN('456'),
			makerAssetData: 'makerAssetData',
			takerAssetData: 'takerAssetData',
			salt: util.stringToBN('789'),
			exchangeAddress: 'exchangeAddress',
			feeRecipientAddress: 'feeRecipientAddress',
			expirationTimeSeconds: util.stringToBN('1234567890'),
			signature: 'signature'
		}
	});
	expect((dynamoUtil.putData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
});

test('getRawOrder', async () => {
	let queryOutput: { [key: string]: any } = {
		Items: []
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getRawOrder('0xOrderHash')).toBeNull();
	expect((dynamoUtil.queryData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();

	queryOutput = {
		Items: [
			{
				[CST.DB_ORDER_HASH]: { S: '0xOrderHash' },
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
		pair: 'pair',
		type: 'type',
		orderHash: '0xOrderHash',
		price: 0.123456789,
		amount: 456,
		side: 'side',
		sequence: 1,
		createdAt: 1234560000,
		updatedAt: 1234567890,
		updatedBy: 'updatedBy'
	});
	expect((dynamoUtil.putData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
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
				[CST.DB_PAIR_SEQ]: { S: 'pair|1' },
				[CST.DB_TYPE]: { S: 'type' },
				[CST.DB_ORDER_HASH]: { S: '0xOrderHash' },
				[CST.DB_PRICE]: {
					N: '123'
				},
				[CST.DB_BALANCE]: { N: '456' },
				[CST.DB_SIDE]: { S: 'side' },
				[CST.DB_CREATED_AT]: { N: '1234560000' },
				[CST.DB_UPDATED_AT]: { N: '1234567890' },
				[CST.DB_UPDATED_BY]: { S: 'updatedBy' }
			}
		]
	};
	dynamoUtil.queryData = jest.fn(() => Promise.resolve(queryOutput));
	expect(await dynamoUtil.getUserOrdersForMonth('0xAccount', '1234-56', 'pair')).toMatchSnapshot();
	expect((dynamoUtil.queryData as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
});

test('getUserOrders', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 9876543210);
	dynamoUtil.getUserOrdersForMonth = jest.fn(() => Promise.resolve([]));
	await dynamoUtil.getUserOrders('0xAccount', 1000000000);
	expect((dynamoUtil.getUserOrdersForMonth as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
});
