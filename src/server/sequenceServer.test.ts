import * as CST from '../common/constants';
import redisUtil from '../utils/redisUtil';
import sequenceServer from './sequenceServer';

test('handleMessage no channel', () => {
	const ws = {
		send: jest.fn()
	} as any;
	const message = JSON.stringify({
		method: 'method',
		channel: ''
	});
	sequenceServer.handleMessage(ws, message);
	expect((ws.send as jest.Mock<void>).mock.calls).toMatchSnapshot();
});

test('handleMessage no method', () => {
	const ws = {
		send: jest.fn()
	} as any;
	const message = JSON.stringify({
		method: '',
		channel: 'channel'
	});
	sequenceServer.handleMessage(ws, message);
	expect((ws.send as jest.Mock<void>).mock.calls).toMatchSnapshot();
});

test('handleMessage invalid channel', () => {
	const ws = {
		send: jest.fn()
	} as any;
	const message = JSON.stringify({
		method: 'pair',
		channel: 'channel'
	});
	sequenceServer.handleMessage(ws, message);
	expect((ws.send as jest.Mock<void>).mock.calls).toMatchSnapshot();
});

test('handleMessage invalid pair', () => {
	const ws = {
		send: jest.fn()
	} as any;
	const message = JSON.stringify({
		method: 'pair',
		channel: CST.DB_SEQUENCE
	});
	sequenceServer.handleMessage(ws, message);
	expect((ws.send as jest.Mock<void>).mock.calls).toMatchSnapshot();
});

test('handleMessage', () => {
	const ws = {
		send: jest.fn()
	} as any;
	const message = JSON.stringify({
		method: CST.SUPPORTED_PAIRS[0],
		channel: CST.DB_SEQUENCE
	});
	redisUtil.set = jest.fn(() => Promise.resolve());
	sequenceServer.sequence[CST.SUPPORTED_PAIRS[0]] = 123;
	sequenceServer.handleMessage(ws, message);
	expect((ws.send as jest.Mock<void>).mock.calls).toMatchSnapshot();
	expect((redisUtil.set as jest.Mock<void>).mock.calls).toMatchSnapshot();
	expect(sequenceServer.sequence).toMatchSnapshot();
});
