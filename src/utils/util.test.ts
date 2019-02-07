import * as CST from '../common/constants';
import util from './util';

test('isNumber() return true for numbers', () => {
	expect(util.isNumber(5)).toBe(true);
	expect(util.isNumber(5.0)).toBe(true);
});

test('isNumber() return true for empty string and null', () => {
	expect(util.isNumber('')).toBe(true);
	expect(util.isNumber(null)).toBe(true);
});

test('isNumber() return true for number strings', () => {
	expect(util.isNumber('5')).toBe(true);
	expect(util.isNumber('5.0')).toBe(true);
});

test('isNumber() return false for other strings', () => {
	expect(util.isNumber('5.0s')).toBe(false);
	expect(util.isNumber('test')).toBe(false);
	expect(util.isNumber('NaN')).toBe(false);
});

test('isNumber() return false for undefined, infinity, NaN', () => {
	expect(util.isNumber(undefined)).toBe(false);
	expect(util.isNumber(Infinity)).toBe(false);
	expect(util.isNumber(NaN)).toBe(false);
});

test('{}, null, undefined is empty', () => {
	expect(util.isEmptyObject({})).toBe(true);
	expect(util.isEmptyObject(null)).toBe(true);
	expect(util.isEmptyObject(undefined)).toBe(true);
});

test('{test: true} is not empty', () => {
	expect(util.isEmptyObject({ test: true })).toBe(false);
});

test('round', () => {
	expect(util.round('12345')).toMatchSnapshot();
	expect(util.round('12345.000')).toMatchSnapshot();
	expect(util.round('12345.1234567')).toMatchSnapshot();
	expect(util.round('12345.123456789')).toMatchSnapshot();
	expect(util.round('0.123456789123456789')).toMatchSnapshot();
	expect(util.round('12345.123456789123456789')).toMatchSnapshot();
});

test('parseOptions', () => {
	const command = [
		'npm',
		'run',
		'tool',
		'env=live',
		'debug',
		'token=token',
		'tokens=token1,token2',
		'dummy=dummy',
		'server'
	];
	expect(util.parseOptions(command)).toMatchSnapshot();
});

test('parseOptions defaults', () => {
	const command = ['npm', 'run', 'tool', 'env=', 'debug', 'token=', 'dummy=dummy', 'server'];
	expect(util.parseOptions(command)).toMatchSnapshot();
});

test('safeWsSend', () => {
	const ws = {
		send: jest.fn()
	};
	expect(util.safeWsSend(ws as any, 'message')).toBeTruthy();
	ws.send = jest.fn(() => {
		throw new Error('error');
	});
	expect(util.safeWsSend(ws as any, 'message')).toBeFalsy();
});

test('getDates', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	expect(util.getDates(4, 1, 'days', 'YYYY-MM-DD')).toMatchSnapshot();
});

test('getExpiryTimeStamp', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1544519089000);
	expect(util.getExpiryTimestamp(false)).toBe(1544601600000);
	expect(util.getExpiryTimestamp(true)).toBe(1545984000000);
	util.getUTCNowTimestamp = jest.fn(() => 1544493600000);
	expect(util.getExpiryTimestamp(false)).toBe(1544515200000);
	util.getUTCNowTimestamp = jest.fn(() => 1556668800000);
	expect(util.getExpiryTimestamp(true)).toBe(1559289600000);
	util.getUTCNowTimestamp = jest.fn(() => 1564617600000);
	expect(util.getExpiryTimestamp(true)).toBe(1567152000000);
	util.getUTCNowTimestamp = jest.fn(() => 1546041600000);
	expect(util.getExpiryTimestamp(true)).toBe(1548403200000);
	util.getUTCNowTimestamp = jest.fn(() => 1546214400000);
	expect(util.getExpiryTimestamp(true)).toBe(1548403200000);
});

test('sleep', async () => {
	global.setTimeout = jest.fn(resolve => resolve()) as any;
	await util.sleep(1);
	expect((global.setTimeout as jest.Mock).mock.calls).toMatchSnapshot();
});

test('formatFixedNumber', () => {
	expect(util.formatFixedNumber(123.456789, 0)).toBe('123.456789');
	expect(util.formatFixedNumber(123.456789, 0.5)).toBe('123.5');
});

test('log debug', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	console.log = jest.fn();

	util.logLevel = CST.LOG_DEBUG;
	util.logError('error');
	util.logInfo('info');
	util.logDebug('debug');
	expect((console.log as jest.Mock).mock.calls).toMatchSnapshot();
});

test('log info', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	console.log = jest.fn();

	util.logLevel = CST.LOG_INFO;
	util.logError('error');
	util.logInfo('info');
	util.logDebug('debug');
	expect((console.log as jest.Mock).mock.calls).toMatchSnapshot();
});

test('log error', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	console.log = jest.fn();

	util.logLevel = CST.LOG_ERROR;
	util.logError('error');
	util.logInfo('info');
	util.logDebug('debug');
	expect((console.log as jest.Mock).mock.calls).toMatchSnapshot();
});
