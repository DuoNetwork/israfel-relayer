import redisUtil from './redisUtil';

test('onMessage orderBooks', () => {
	const handleOrderBookUpdate = jest.fn();
	redisUtil.onOrderBookUpdate(handleOrderBookUpdate);
	const handleOrderUpdate = jest.fn();
	redisUtil.onOrderUpdate(handleOrderUpdate);
	const handleTradeUpdate = jest.fn();
	redisUtil.onTradeUpdate(handleTradeUpdate);
	redisUtil.onMessage('orderBooks|any', JSON.stringify('test'));
	expect(handleOrderBookUpdate.mock.calls).toMatchSnapshot();
	expect(handleOrderUpdate).not.toBeCalled();
	expect(handleTradeUpdate).not.toBeCalled();
});

test('onMessage orders', () => {
	const handleOrderBookUpdate = jest.fn();
	redisUtil.onOrderBookUpdate(handleOrderBookUpdate);
	const handleOrderUpdate = jest.fn();
	redisUtil.onOrderUpdate(handleOrderUpdate);
	const handleTradeUpdate = jest.fn();
	redisUtil.onTradeUpdate(handleTradeUpdate);
	redisUtil.onMessage('orders|any', JSON.stringify('test'));
	expect(handleOrderUpdate.mock.calls).toMatchSnapshot();
	expect(handleOrderBookUpdate).not.toBeCalled();
	expect(handleTradeUpdate).not.toBeCalled();
});

test('onMessage trades', () => {
	const handleOrderBookUpdate = jest.fn();
	redisUtil.onOrderBookUpdate(handleOrderBookUpdate);
	const handleOrderUpdate = jest.fn();
	redisUtil.onOrderUpdate(handleOrderUpdate);
	const handleTradeUpdate = jest.fn();
	redisUtil.onTradeUpdate(handleTradeUpdate);
	redisUtil.onMessage('trades|any', JSON.stringify('test'));
	expect(handleOrderUpdate).not.toBeCalled();
	expect(handleOrderBookUpdate).not.toBeCalled();
	expect(handleTradeUpdate.mock.calls).toMatchSnapshot();
});

test('onMessage anything else', () => {
	const handleOrderBookUpdate = jest.fn();
	redisUtil.onOrderBookUpdate(handleOrderBookUpdate);
	const handleOrderUpdate = jest.fn();
	redisUtil.onOrderUpdate(handleOrderUpdate);
	redisUtil.onMessage('any', JSON.stringify('test'));
	expect(handleOrderUpdate).not.toBeCalled();
	expect(handleOrderBookUpdate).not.toBeCalled();
});

test('publish', async () => {
	redisUtil.redisPub = null;
	expect(await redisUtil.publish('channel', 'msg')).toBe(0);
	redisUtil.redisPub = {
		publish: jest.fn()
	} as any;
	await redisUtil.publish('channel', 'msg');
	expect(((redisUtil.redisPub as any).publish as jest.Mock).mock.calls).toMatchSnapshot();
});

test('increment', async () => {
	redisUtil.redisPub = null;
	expect(await redisUtil.increment('key')).toBe(0);
	redisUtil.redisPub = {
		incr: jest.fn()
	} as any;
	await redisUtil.increment('key');
	expect(((redisUtil.redisPub as any).incr as jest.Mock).mock.calls).toMatchSnapshot();
});

test('set', async () => {
	redisUtil.redisPub = null;
	expect(await redisUtil.set('key', 'value')).toBe('');
	redisUtil.redisPub = {
		set: jest.fn()
	} as any;
	await redisUtil.set('key', 'value');
	expect(((redisUtil.redisPub as any).set as jest.Mock).mock.calls).toMatchSnapshot();
});

test('get', async () => {
	redisUtil.redisPub = null;
	expect(await redisUtil.get('key')).toBe('');
	redisUtil.redisPub = {
		get: jest.fn()
	} as any;
	await redisUtil.get('key');
	expect(((redisUtil.redisPub as any).get as jest.Mock).mock.calls).toMatchSnapshot();
});

test('hashSet', async () => {
	redisUtil.redisPub = null;
	expect(await redisUtil.hashSet('key', 'field', 'value')).toBe(0);
	redisUtil.redisPub = {
		hset: jest.fn()
	} as any;
	await redisUtil.hashSet('key', 'field', 'value');
	expect(((redisUtil.redisPub as any).hset as jest.Mock).mock.calls).toMatchSnapshot();
});

test('hashGet', async () => {
	redisUtil.redisPub = null;
	expect(await redisUtil.hashGet('key', 'field')).toBe('');
	redisUtil.redisPub = {
		hget: jest.fn()
	} as any;
	await redisUtil.hashGet('key', 'field');
	expect(((redisUtil.redisPub as any).hget as jest.Mock).mock.calls).toMatchSnapshot();
});

test('hashMultiGet', async () => {
	redisUtil.redisPub = null;
	expect(await redisUtil.hashMultiGet('key', 'field')).toEqual({});
	redisUtil.redisPub = {
		hmget: jest.fn(() => Promise.resolve([]))
	} as any;
	await redisUtil.hashMultiGet('key', 'field');
	expect(((redisUtil.redisPub as any).hmget as jest.Mock).mock.calls).toMatchSnapshot();
});

test('hashGetAll', async () => {
	redisUtil.redisPub = null;
	expect(await redisUtil.hashGetAll('key')).toEqual({});
	redisUtil.redisPub = {
		hgetall: jest.fn()
	} as any;
	await redisUtil.hashGetAll('key');
	expect(((redisUtil.redisPub as any).hgetall as jest.Mock).mock.calls).toMatchSnapshot();
});

test('hashDelete', async () => {
	redisUtil.redisPub = {
		hdel: jest.fn()
	} as any;
	await redisUtil.hashDelete('key', 'field');
	expect(((redisUtil.redisPub as any).hdel as jest.Mock).mock.calls).toMatchSnapshot();
});

test('subscribe', async () => {
	redisUtil.redisSub = {
		subscribe: jest.fn()
	} as any;
	redisUtil.subscribe('channel');
	expect(((redisUtil.redisSub as any).subscribe as jest.Mock).mock.calls).toMatchSnapshot();
});

test('patternSubscribe', async () => {
	redisUtil.redisSub = {
		psubscribe: jest.fn()
	} as any;
	redisUtil.patternSubscribe('channel');
	expect(((redisUtil.redisSub as any).psubscribe as jest.Mock).mock.calls).toMatchSnapshot();
});

test('unsubscribe', async () => {
	redisUtil.redisSub = {
		unsubscribe: jest.fn()
	} as any;
	redisUtil.unsubscribe('channel');
	expect(((redisUtil.redisSub as any).unsubscribe as jest.Mock).mock.calls).toMatchSnapshot();
});

test('patternUnsubscribe', async () => {
	redisUtil.redisSub = {
		punsubscribe: jest.fn()
	} as any;
	redisUtil.patternUnsubscribe('channel');
	expect(((redisUtil.redisSub as any).punsubscribe as jest.Mock).mock.calls).toMatchSnapshot();
});

test('push', async () => {
	redisUtil.redisPub = {
		lpush: jest.fn()
	} as any;
	await redisUtil.push('key', 'field');
	expect(((redisUtil.redisPub as any).lpush as jest.Mock).mock.calls).toMatchSnapshot();
});

test('putBack', async () => {
	redisUtil.redisPub = {
		rpush: jest.fn()
	} as any;
	await redisUtil.putBack('key', 'field');
	expect(((redisUtil.redisPub as any).rpush as jest.Mock).mock.calls).toMatchSnapshot();
});

test('pop', async () => {
	redisUtil.redisPub = null;
	expect(await redisUtil.pop('key')).toBe('');
	redisUtil.redisPub = {
		rpop: jest.fn()
	} as any;
	await redisUtil.pop('key');
	expect(((redisUtil.redisPub as any).rpop as jest.Mock).mock.calls).toMatchSnapshot();
});

test('getQueueLength', async () => {
	redisUtil.redisPub = null;
	expect(await redisUtil.getQueueLength('key')).toBe(0);
	redisUtil.redisPub = {
		llen: jest.fn()
	} as any;
	await redisUtil.getQueueLength('key');
	expect(((redisUtil.redisPub as any).llen as jest.Mock).mock.calls).toMatchSnapshot();
});
