import util from './util';

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
