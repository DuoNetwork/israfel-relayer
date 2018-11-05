import * as CST from '../common/constants';
import SequenceClient from './SequenceClient';

class BasicSequenceClient extends SequenceClient {
	public sequenceMethods = ['method'];
	public handleSequenceResponse = jest.fn(() => Promise.resolve());
}

const testClient = new BasicSequenceClient();

test('requestSequence', () => {
	const ws = {
		send: jest.fn()
	};
	testClient.sequenceWsClient = ws as any;
	testClient.requestSequence('method', 'pair', '0xOrderHash');
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});

test('handleMessage invalid response', async () => {
	expect(
		await testClient.handleMessage(
			JSON.stringify({
				channel: 'channel',
				status: CST.WS_OK
			})
		)
	).toBeFalsy();
	expect(
		await testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: 'status'
			})
		)
	).toBeFalsy();
	expect(
		await testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: 'status'
			})
		)
	).toBeFalsy();
	expect(
		await testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK
			})
		)
	).toBeFalsy();
	expect(
		await testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 0
			})
		)
	).toBeFalsy();
	expect(
		await testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 1
			})
		)
	).toBeFalsy();
	expect(
		await testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 1,
				method: 'method'
			})
		)
	).toBeFalsy();
	expect(
		await testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 1,
				method: 'method',
				pair: 'pair'
			})
		)
	).toBeFalsy();
	expect(
		await testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 1,
				method: 'method',
				pair: 'pair',
				orderHash: '0xOrderHash'
			})
		)
	).toBeFalsy();
	testClient.requestCache = {
		'method|pair|0xOrderHash': {
			liveOrder: {
				orderHash: '0xOrderHash'
			}
		}
	} as any;
	await testClient.handleMessage(
		JSON.stringify({
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			sequence: 1,
			method: 'method',
			pair: 'pair',
			orderHash: '0xOrderHash'
		})
	);
	expect(testClient.requestCache).toEqual({});
	expect(testClient.handleSequenceResponse.mock.calls).toMatchSnapshot();
});

test('handleSequenceResponse failed', async () => {
	testClient.handleSequenceResponse = jest.fn(() => Promise.reject());
	testClient.requestCache = {
		'method|pair|0xOrderHash': {
			liveOrder: {
				orderHash: '0xOrderHash'
			}
		}
	} as any;
	await testClient.handleMessage(
		JSON.stringify({
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			sequence: 1,
			method: 'method',
			pair: 'pair',
			orderHash: '0xOrderHash'
		})
	);
	expect(testClient.requestCache).toMatchSnapshot();
});
