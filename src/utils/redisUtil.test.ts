import redisUtil from './redisUtil';

test('onMessage orderBooks', () => {
	const handleOrderBookUpdate = jest.fn();
	redisUtil.onOrderBookUpdate(handleOrderBookUpdate);
	const handleOrderUpdate = jest.fn();
	redisUtil.onOrderUpdate(handleOrderUpdate);
	redisUtil.onMessage('orderBooks|any', JSON.stringify('test'));
	expect(handleOrderBookUpdate.mock.calls).toMatchSnapshot();
	expect(handleOrderUpdate.mock.calls.length).toBe(0);
});

test('onMessage orders', () => {
	const handleOrderBookUpdate = jest.fn();
	redisUtil.onOrderBookUpdate(handleOrderBookUpdate);
	const handleOrderUpdate = jest.fn();
	redisUtil.onOrderUpdate(handleOrderUpdate);
	redisUtil.onMessage('orders|any', JSON.stringify('test'));
	expect(handleOrderUpdate.mock.calls).toMatchSnapshot();
	expect(handleOrderBookUpdate.mock.calls.length).toBe(0);
});

test('onMessage anything else', () => {
	const handleOrderBookUpdate = jest.fn();
	redisUtil.onOrderBookUpdate(handleOrderBookUpdate);
	const handleOrderUpdate = jest.fn();
	redisUtil.onOrderUpdate(handleOrderUpdate);
	redisUtil.onMessage('any', JSON.stringify('test'));
	expect(handleOrderUpdate.mock.calls.length).toBe(0);
	expect(handleOrderBookUpdate.mock.calls.length).toBe(0);
});
