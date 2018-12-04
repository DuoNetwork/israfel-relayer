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
		'live',
		'debug',
		'token=token',
		'amount=123',
		'maker=456',
		'spender=789',
		'dummy=dummy',
		'server'
	];
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
