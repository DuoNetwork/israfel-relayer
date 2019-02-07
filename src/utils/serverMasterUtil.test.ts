import child_process from 'child_process';
import { Constants, Util } from '../../../israfel-common/src';
import dynamoUtil from './dynamoUtil';
import osUtil from './osUtil';
import serverMasterUtil from './serverMasterUtil';

test('retry after long enought time', () => {
	const launchMock = jest.fn();
	const launchOriginal = serverMasterUtil.launchTokenPair;
	serverMasterUtil.launchTokenPair = launchMock;
	child_process.exec = jest.fn() as any;
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	global.setTimeout = jest.fn();
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: Util.getUTCNowTimestamp() - (30000 + 1),
		failCount: 2,
		instance: undefined as any
	};
	serverMasterUtil.retry(
		'tool',
		{
			server: false,
			debug: false,
			live: false
		} as any,
		'token'
	);
	expect(serverMasterUtil.subProcesses['token']).toMatchSnapshot();
	expect((global.setTimeout as jest.Mock).mock.calls).toMatchSnapshot();
	(global.setTimeout as jest.Mock).mock.calls[0][0]();
	expect(launchMock.mock.calls).toMatchSnapshot();
	serverMasterUtil.launchTokenPair = launchOriginal;
});

test('retry within short time', () => {
	child_process.exec = jest.fn() as any;
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: Util.getUTCNowTimestamp() - (30000 - 1),
		failCount: 2,
		instance: undefined as any
	};
	serverMasterUtil.retry(
		'tool',
		{
			env: Constants.DB_DEV,
			debug: false,
			live: false
		} as any,
		'token'
	);
	expect(serverMasterUtil.subProcesses['token']).toMatchSnapshot();
});

test('launchTokenPair fail win32', () => {
	osUtil.isWindows = jest.fn(() => true);
	child_process.exec = jest.fn() as any;
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.retry = jest.fn();
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: 0,
		failCount: 0,
		instance: undefined as any
	};
	serverMasterUtil.launchTokenPair('tool', 'token', {
		env: Constants.DB_DEV,
		debug: false,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
	expect((serverMasterUtil.retry as jest.Mock).mock.calls).toMatchSnapshot();
});

test('launchTokenPair success win 32', () => {
	osUtil.isWindows = jest.fn(() => true);
	const execOn = jest.fn();
	child_process.exec = jest.fn(() => {
		return {
			on: execOn
		};
	}) as any;
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.retry = jest.fn();
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: 5,
		failCount: 0,
		instance: undefined as any
	};
	serverMasterUtil.retry = jest.fn();
	serverMasterUtil.launchTokenPair('tool', 'token', {
		env: Constants.DB_DEV,
		debug: false,
		live: false,
		server: true
	} as any);
	expect(((child_process.exec as any) as jest.Mock).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
	expect(execOn.mock.calls).toMatchSnapshot();
	execOn.mock.calls[0][1]();
	execOn.mock.calls[0][1](1);
	expect((serverMasterUtil.retry as jest.Mock).mock.calls).toMatchSnapshot();
});

test('launchTokenPair debug win32', () => {
	osUtil.isWindows = jest.fn(() => true);
	child_process.exec = jest.fn() as any;
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: 0,
		failCount: 0,
		instance: undefined as any
	};
	serverMasterUtil.launchTokenPair('tool', 'token', {
		env: Constants.DB_DEV,
		debug: true,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
});

test('launchTokenPair fail not win32', () => {
	osUtil.isWindows = jest.fn(() => false);
	child_process.exec = jest.fn() as any;
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.retry = jest.fn();
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: 0,
		failCount: 0,
		instance: undefined as any
	};
	serverMasterUtil.launchTokenPair('tool', 'token', {
		env: Constants.DB_LIVE,
		debug: false,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
	expect((serverMasterUtil.retry as jest.Mock).mock.calls).toMatchSnapshot();
});

test('launchTokenPair success not win32', () => {
	osUtil.isWindows = jest.fn(() => false);
	child_process.exec = jest.fn(() => {
		return {
			on: jest.fn()
		};
	}) as any;
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.retry = jest.fn();
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: 5,
		failCount: 0,
		instance: undefined as any
	};
	serverMasterUtil.launchTokenPair('tool', 'token', {
		env: Constants.DB_LIVE,
		debug: false,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
	expect(
		(serverMasterUtil.subProcesses['token'].instance.on as jest.Mock).mock.calls
	).toMatchSnapshot();
});

test('launchTkenPair debug not win32', () => {
	osUtil.isWindows = jest.fn(() => false);
	child_process.exec = jest.fn() as any;
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: 0,
		failCount: 0,
		instance: undefined as any
	};
	serverMasterUtil.launchTokenPair('tool', 'token', {
		env: Constants.DB_LIVE,
		debug: true,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
});

test('startLaunching', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	child_process.exec = jest.fn() as any;
	const option = {
		env: 'test',
		tokens: ['test', 'test1'],
		token: 'test',
		maker: 123,
		spender: 123,
		amount: 123,
		debug: true,
		server: true
	};
	dynamoUtil.scanTokens = jest.fn(() =>
		Promise.resolve([
			{
				code: 'test'
			}
		] as any)
	);
	Util.sleep = jest.fn();
	Util.logInfo = jest.fn();
	const startServer = jest.fn(() => true);
	await serverMasterUtil.startLaunching('test', option, startServer);
	expect(startServer.mock.calls).toMatchSnapshot();
});

test('startLaunching invalid token', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	child_process.exec = jest.fn() as any;
	const option = {
		env: 'test',
		tokens: ['test', 'test1'],
		token: 'test',
		maker: 123,
		spender: 123,
		amount: 123,
		debug: true,
		server: true
	};
	dynamoUtil.scanTokens = jest.fn(() => Promise.resolve([]));
	Util.sleep = jest.fn();
	Util.logInfo = jest.fn();
	const startServer = jest.fn(() => true);
	try {
		await serverMasterUtil.startLaunching('test', option, startServer);
		expect(false).toBeTruthy();
	} catch (error) {
		expect(error).toMatchSnapshot();
	}
});

test('startLaunching tokens', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	child_process.exec = jest.fn() as any;
	const option = {
		env: 'test',
		tokens: ['test', 'test1'],
		token: '',
		maker: 123,
		spender: 123,
		amount: 123,
		debug: true,
		server: true
	};
	dynamoUtil.scanTokens = jest.fn(() =>
		Promise.resolve([
			{
				code: 'test'
			},
			{
				code: 'test2'
			}
		] as any)
	);
	Util.sleep = jest.fn();
	Util.logInfo = jest.fn();
	const startServer = jest.fn(() => true);
	serverMasterUtil.launchTokenPair = jest.fn();
	await serverMasterUtil.startLaunching('test', option, startServer);
	expect((serverMasterUtil.launchTokenPair as jest.Mock).mock.calls).toMatchSnapshot();
});

test('startLaunching no tokens', async () => {
	Util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	child_process.exec = jest.fn() as any;
	const option = {
		env: 'test',
		tokens: [],
		token: '',
		maker: 123,
		spender: 123,
		amount: 123,
		debug: true,
		server: true
	};
	dynamoUtil.scanTokens = jest.fn(() =>
		Promise.resolve([
			{
				code: 'test'
			}
		] as any)
	);
	Util.sleep = jest.fn();
	Util.logInfo = jest.fn();
	const startServer = jest.fn(() => true);
	serverMasterUtil.launchTokenPair = jest.fn();
	await serverMasterUtil.startLaunching('test', option, startServer);
	expect((serverMasterUtil.launchTokenPair as jest.Mock).mock.calls).toMatchSnapshot();
});
