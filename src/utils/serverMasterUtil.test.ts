import child_process from 'child_process';
import { DB_DEV, DB_LIVE } from '../common/constants';
import dynamoUtil from './dynamoUtil';
import osUtil from './osUtil';
import serverMasterUtil from './serverMasterUtil';
import util from './util';

test('startLaunching', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
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
		])
	);
	util.sleep = jest.fn();
	util.logInfo = jest.fn();
	const startServer = jest.fn(() => true);
	expect(serverMasterUtil.startLaunching('test', option, startServer)).toMatchSnapshot();
});

test('startLaunching no rawToken', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
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
	dynamoUtil.scanTokens = jest.fn(() => Promise.resolve([{ code: 'default' }]));
	util.sleep = jest.fn();
	util.logInfo = jest.fn();
	const startServer = jest.fn(() => true);
	expect(serverMasterUtil.startLaunching('test', option, startServer)).toMatchSnapshot();
});

test('startLaunching normal', () => {
	child_process.exec = jest.fn() as any;
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	const option = {
		env: 'test',
		tokens: ['test', 'test1'],
		token: 'default',
		maker: 123,
		spender: 123,
		amount: 123,
		debug: true,
		server: true
	};
	dynamoUtil.scanTokens = jest.fn(() =>
		Promise.resolve([
			{
				code: 'default'
			}
		])
	);
	util.sleep = jest.fn();
	util.logInfo = jest.fn();
	const startServer = jest.fn();
	expect(serverMasterUtil.startLaunching('test', option, startServer)).toMatchSnapshot();
});

test('startLaunching Token Length', () => {
	child_process.exec = jest.fn() as any;
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
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
	dynamoUtil.scanTokens = jest.fn(() => Promise.resolve([{ code: 'default' }]));
	util.sleep = jest.fn();
	util.logInfo = jest.fn();
	const startServer = jest.fn(() => true);
	expect(serverMasterUtil.startLaunching('test', option, startServer)).toMatchSnapshot();
});

test('startLaunching Token Length', () => {
	child_process.exec = jest.fn() as any;
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	const option = {
		env: 'test',
		tokens: ['default'],
		token: '',
		maker: 123,
		spender: 123,
		amount: 123,
		debug: true,
		server: true
	};
	dynamoUtil.scanTokens = jest.fn(() => Promise.resolve([{ code: 'default' }]));
	util.sleep = jest.fn();
	util.logInfo = jest.fn();
	const startServer = jest.fn(() => true);
	expect(serverMasterUtil.startLaunching('test', option, startServer)).toMatchSnapshot();
});

test('retry after long enought time', () => {
	child_process.exec = jest.fn() as any;
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: util.getUTCNowTimestamp() - (30000 + 1),
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
});

test('retry within short time', () => {
	child_process.exec = jest.fn() as any;
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: util.getUTCNowTimestamp() - (30000 - 1),
		failCount: 2,
		instance: undefined as any
	};
	serverMasterUtil.retry(
		'tool',
		{
			env: DB_DEV,
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
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.retry = jest.fn();
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: 0,
		failCount: 0,
		instance: undefined as any
	};
	serverMasterUtil.launchTokenPair('tool', 'token', {
		env: DB_DEV,
		debug: false,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
	expect((serverMasterUtil.retry as jest.Mock<void>).mock.calls).toMatchSnapshot();
});

test('launchTokenPair success win 32', () => {
	osUtil.isWindows = jest.fn(() => true);
	child_process.exec = jest.fn(() => {
		return {
			on: jest.fn()
		};
	}) as any;
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.retry = jest.fn();
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: 5,
		failCount: 0,
		instance: undefined as any
	};
	serverMasterUtil.launchTokenPair('tool', 'token', {
		env: DB_DEV,
		debug: false,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
	expect(
		(serverMasterUtil.subProcesses['token'].instance.on as jest.Mock<void>).mock.calls
	).toMatchSnapshot();
});

test('launchTokenPair debug win32', () => {
	osUtil.isWindows = jest.fn(() => true);
	child_process.exec = jest.fn() as any;
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: 0,
		failCount: 0,
		instance: undefined as any
	};
	serverMasterUtil.launchTokenPair('tool', 'token', {
		env: DB_DEV,
		debug: true,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
});

test('launchTokenPair fail not win32', () => {
	osUtil.isWindows = jest.fn(() => false);
	child_process.exec = jest.fn() as any;
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.retry = jest.fn();
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: 0,
		failCount: 0,
		instance: undefined as any
	};
	serverMasterUtil.launchTokenPair('tool', 'token', {
		env: DB_LIVE,
		debug: false,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
	expect((serverMasterUtil.retry as jest.Mock<void>).mock.calls).toMatchSnapshot();
});

test('launchTokenPair success not win32', () => {
	osUtil.isWindows = jest.fn(() => false);
	child_process.exec = jest.fn(() => {
		return {
			on: jest.fn()
		};
	}) as any;
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.retry = jest.fn();
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: 5,
		failCount: 0,
		instance: undefined as any
	};
	serverMasterUtil.launchTokenPair('tool', 'token', {
		env: DB_LIVE,
		debug: false,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
	expect(
		(serverMasterUtil.subProcesses['token'].instance.on as jest.Mock<void>).mock.calls
	).toMatchSnapshot();
});

test('launchTkenPair debug not win32', () => {
	osUtil.isWindows = jest.fn(() => false);
	child_process.exec = jest.fn() as any;
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	serverMasterUtil.subProcesses['token'] = {
		token: 'token',
		lastFailTimestamp: 0,
		failCount: 0,
		instance: undefined as any
	};
	serverMasterUtil.launchTokenPair('tool', 'token', {
		env: DB_LIVE,
		debug: true,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
});
