import dynamoUtil from '../utils/dynamoUtil';
import orderPersistenceUtil from '../utils/orderPersistenceUtil';
import redisUtil from '../utils/redisUtil';
import orderPersistenceServer from './orderPersistanceServer';

test('startServer, server', async () => {
	dynamoUtil.updateStatus = jest.fn();
	redisUtil.getQueueLength = jest.fn(() => Promise.resolve(10));
	global.setInterval = jest.fn();
	global.setTimeout = jest.fn();

	let result = false;
	orderPersistenceUtil.processOrderQueue = jest.fn(() => Promise.resolve(result));
	await orderPersistenceServer.startServer({ server: true } as any);

	expect((global.setInterval as jest.Mock).mock.calls).toMatchSnapshot();

	await (global.setInterval as jest.Mock).mock.calls[0][0]();
	expect((redisUtil.getQueueLength as jest.Mock).mock.calls).toMatchSnapshot();
	expect((dynamoUtil.updateStatus as jest.Mock).mock.calls).toMatchSnapshot();
	result = true;

	await (global.setTimeout as jest.Mock).mock.calls[0][0]();
	expect((global.setTimeout as jest.Mock).mock.calls).toMatchSnapshot();
});

test('startServer, no server', async () => {
	dynamoUtil.updateStatus = jest.fn();
	redisUtil.getQueueLength = jest.fn(() => Promise.resolve(10));
	global.setInterval = jest.fn();
	global.setTimeout = jest.fn();

	await orderPersistenceServer.startServer({ server: false } as any);

	expect(dynamoUtil.updateStatus as jest.Mock).not.toBeCalled();
	expect(redisUtil.getQueueLength as jest.Mock).not.toBeCalled();
	expect(global.setInterval as jest.Mock).not.toBeCalled();
});
