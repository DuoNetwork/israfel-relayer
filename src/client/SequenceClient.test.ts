import SequenceClient from './SequenceClient';

class BasicSequenceClient extends SequenceClient {
	public handleSequenceMessage(m: string) {
		return m;
	}
}

const testClient = new BasicSequenceClient();

test('requestSequence', () => {
	expect(testClient.requestSequence('pair')).toMatchSnapshot();
	const ws = {
		send: jest.fn()
	}
	testClient.sequenceWsClient = ws as any;
	expect(testClient.requestSequence('pair')).toMatchSnapshot();
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});
