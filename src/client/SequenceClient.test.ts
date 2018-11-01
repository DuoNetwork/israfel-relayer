import * as CST from '../common/constants';
import SequenceClient from './SequenceClient';

class BasicSequenceClient extends SequenceClient {
	public sequenceMethods = ['method'];
	public handleSequenceResponse = jest.fn();
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
		testClient.handleMessage(
			JSON.stringify({
				channel: 'channel',
				status: CST.WS_OK
			})
		)
	).toBeFalsy();
	expect(
		testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: 'status'
			})
		)
	).toBeFalsy();
	expect(
		testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: 'status'
			})
		)
	).toBeFalsy();
	expect(
		testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK
			})
		)
	).toBeFalsy();
	expect(
		testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 0
			})
		)
	).toBeFalsy();
	expect(
		testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 1
			})
		)
	).toBeFalsy();
	expect(
		testClient.handleMessage(
			JSON.stringify({
				channel: CST.DB_SEQUENCE,
				status: CST.WS_OK,
				sequence: 1,
				method: 'method'
			})
		)
	).toBeFalsy();
	expect(
		testClient.handleMessage(
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
		testClient.handleMessage(
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
	testClient.handleMessage(
		JSON.stringify({
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			sequence: 1,
			method: 'method'
		})
	);
	expect(testClient.handleSequenceResponse.mock.calls).toMatchSnapshot();
});
