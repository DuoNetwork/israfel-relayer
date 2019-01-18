import osUtil from './osUtil';

jest.mock('os', () => ({
	hostname: () => 'hostname',
	platform: 'win32'
}));

test('getHostName', () => {
	expect(osUtil.getHostName()).toBe('hostname');
});

test('isWindows', () => {
	expect(osUtil.isWindows()).toBeTruthy();
});
