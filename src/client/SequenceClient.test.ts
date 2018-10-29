import SequenceClient from './SequenceClient';

class BasicSequenceClient extends SequenceClient {
	public handleSequenceMessage(m: string) {
		return m;
	}
}

const testClient = new BasicSequenceClient();

test('requestSequence', () => {
	expect(testClient.requestSequence('method', 'pair', '0xOrderHash')).toMatchSnapshot();
	const ws = {
		send: jest.fn()
	}
	testClient.sequenceWsClient = ws as any;
	expect(testClient.requestSequence('method', 'pair', '0xOrderHash')).toMatchSnapshot();
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});
