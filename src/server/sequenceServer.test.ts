import * as CST from '../common/constants';
import redisUtil from '../utils/redisUtil';
import sequenceServer from './sequenceServer';

test('handleMessage invalid requests', () => {
	const ws = {
		send: jest.fn()
	} as any;
	sequenceServer.handleMessage(
		ws,
		JSON.stringify({
			method: 'add',
			channel: 'channel',
			pair: CST.SUPPORTED_PAIRS[0],
			orderHash: '0xOrderHash'
		})
	);
	sequenceServer.handleMessage(
		ws,
		JSON.stringify({
			method: 'method',
			channel: CST.DB_SEQUENCE,
			pair: CST.SUPPORTED_PAIRS[0],
			orderHash: '0xOrderHash'
		})
	);
	sequenceServer.handleMessage(
		ws,
		JSON.stringify({
			method: 'add',
			channel: CST.DB_SEQUENCE,
			pair: 'pair',
			orderHash: '0xOrderHash'
		})
	);
	sequenceServer.handleMessage(
		ws,
		JSON.stringify({
			method: 'add',
			channel: CST.DB_SEQUENCE,
			pair: CST.SUPPORTED_PAIRS[0],
			orderHash: ''
		})
	);
	expect((ws.send as jest.Mock<void>).mock.calls).toMatchSnapshot();
});

test('handleMessage', () => {
	const ws = {
		send: jest.fn()
	} as any;
	const message = JSON.stringify({
		method: 'add',
		channel: CST.DB_SEQUENCE,
		pair: CST.SUPPORTED_PAIRS[0],
		orderHash: '0xOrderHash'
	});
	redisUtil.set = jest.fn(() => Promise.resolve());
	sequenceServer.sequence[CST.SUPPORTED_PAIRS[0]] = 123;
	sequenceServer.handleMessage(ws, message);
	expect((ws.send as jest.Mock<void>).mock.calls).toMatchSnapshot();
	expect((redisUtil.set as jest.Mock<void>).mock.calls).toMatchSnapshot();
	expect(sequenceServer.sequence).toMatchSnapshot();
});
