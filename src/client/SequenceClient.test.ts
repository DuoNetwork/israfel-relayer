import SequenceClient from './SequenceClient';

class BasicSequenceClient extends SequenceClient {
	public handleSequenceMessage(m: string) {
		return m;
	}
}

const testClient = new BasicSequenceClient();

test('requestSequence', () => {
	const ws = {
		send: jest.fn()
	}
	testClient.sequenceWsClient = ws as any;
	testClient.requestSequence('method', 'pair', '0xOrderHash');
	expect((ws.send as jest.Mock).mock.calls).toMatchSnapshot();
});
