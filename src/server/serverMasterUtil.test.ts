import child_process from 'child_process';
import osUtil from '../utils/osUtil';
import util from '../utils/util';
import serverMasterUtil from './serverMasterUtil';

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
	serverMasterUtil.launchTokenPair('tool', 'token',  {
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
	serverMasterUtil.launchTokenPair('tool', 'token',  {
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
	serverMasterUtil.launchTokenPair('tool', 'token',  {
		debug: false,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
	expect(
		(serverMasterUtil.subProcesses['token'].instance.on as jest.Mock<void>).mock.calls).toMatchSnapshot()
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
	serverMasterUtil.launchTokenPair('tool', 'token',  {
		debug: true,
		live: false
	} as any);
	expect(((child_process.exec as any) as jest.Mock<Promise<void>>).mock.calls).toMatchSnapshot();
	expect(serverMasterUtil.subProcesses).toMatchSnapshot();
});
