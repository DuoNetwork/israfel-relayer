import Redis from 'ioredis';
import { Constants, IOrderBookSnapshotUpdate, ITrade, Util } from '../../../israfel-common/src';
import { IOrderQueueItem } from '../common/types';

class RedisUtil {
	public redisPub: Redis.Redis | null = null;
	public redisSub: Redis.Redis | null = null;
	private handleOrderBookUpdate: (
		channel: string,
		orderBookUpdate: IOrderBookSnapshotUpdate
	) => any = () => ({});
	private handleOrderUpdate: (
		channel: string,
		orderQueueItem: IOrderQueueItem
	) => any = () => ({});
	private handleTradeUpdate: (channel: string, trade: ITrade) => any = () => ({});

	public init(redisKey: { host: string; password: string; servername: string }) {
		this.redisPub = new Redis(6379, redisKey.host, {
			password: redisKey.password,
			tls: { servername: redisKey.servername }
		});
		this.redisSub = new Redis(6379, redisKey.host, {
			password: redisKey.password,
			tls: { servername: redisKey.servername }
		});
		this.redisSub.on('message', (channel, message) => this.onMessage(channel, message));
		this.redisSub.on('pmessage', (pattern, channel, message) =>
			this.onMessage(channel, message, pattern)
		);
	}

	public onMessage(channel: string, message: string, pattern: string = '') {
		Util.logDebug(pattern + channel + message);
		const type = channel.split('|')[0];
		switch (type) {
			case Constants.DB_ORDER_BOOKS:
				this.handleOrderBookUpdate(channel, JSON.parse(message));
				break;
			case Constants.DB_ORDERS:
				this.handleOrderUpdate(channel, JSON.parse(message));
				break;
			case Constants.DB_TRADES:
				this.handleTradeUpdate(channel, JSON.parse(message));
				break;
			default:
				break;
		}
	}

	public onOrderBookUpdate(
		handleOrderBookUpdate: (channel: string, orderBookUpdate: IOrderBookSnapshotUpdate) => any
	) {
		this.handleOrderBookUpdate = handleOrderBookUpdate;
	}
	public onOrderUpdate(
		handleOrderUpdate: (channel: string, orderQueueItem: IOrderQueueItem) => any
	) {
		this.handleOrderUpdate = handleOrderUpdate;
	}

	public onTradeUpdate(handleTradeUpdate: (channel: string, trade: ITrade) => any) {
		this.handleTradeUpdate = handleTradeUpdate;
	}

	public publish(channel: string, msg: string) {
		if (this.redisPub) return this.redisPub.publish(channel, msg);
		return Promise.resolve(0);
	}

	public increment(key: string) {
		if (this.redisPub) return this.redisPub.incr(key);
		return Promise.resolve(0);
	}

	public set(key: string, value: string) {
		if (this.redisPub) return this.redisPub.set(key, value);
		return Promise.resolve('');
	}

	public get(key: string) {
		if (this.redisPub) return this.redisPub.get(key);
		return Promise.resolve('');
	}

	public hashSet(key: string, field: string, value: string) {
		if (this.redisPub) return this.redisPub.hset(key, field, value);
		return Promise.resolve(0);
	}

	public hashGet(key: string, field: string): Promise<string | null> {
		if (this.redisPub) return this.redisPub.hget(key, field);
		return Promise.resolve('');
	}

	public async hashMultiGet(key: string, ...fields: string[]) {
		if (this.redisPub) {
			const values: Array<string | null> = await this.redisPub.hmget(key, ...fields);
			const output: { [field: string]: string | null } = {};
			fields.forEach((f, i) => (output[f] = values[i]));
			return output;
		}
		return Promise.resolve({});
	}

	public hashGetAll(key: string): Promise<any> {
		if (this.redisPub) return this.redisPub.hgetall(key);
		return Promise.resolve({});
	}

	public hashDelete(key: string, field: string) {
		if (this.redisPub) return this.redisPub.hdel(key, field);
		return 0;
	}

	public hashDeleteAll(key: string) {
		if (this.redisPub) return this.redisPub.del(key);
		return Promise.resolve(0);
	}

	public subscribe(channel: string) {
		if (!this.redisSub) return false;
		this.redisSub.subscribe(channel);
		return true;
	}

	public patternSubscribe(pattern: string) {
		if (!this.redisSub) return false;
		this.redisSub.psubscribe(pattern);
		return true;
	}

	public unsubscribe(channel: string) {
		if (!this.redisSub) return false;
		this.redisSub.unsubscribe(channel);
		return true;
	}

	public patternUnsubscribe(pattern: string) {
		if (!this.redisSub) return false;
		this.redisSub.punsubscribe(pattern);
		return true;
	}

	public push(key: string, ...values: string[]) {
		if (this.redisPub) return this.redisPub.lpush(key, values);
		return 0;
	}

	public putBack(key: string, ...values: string[]) {
		if (this.redisPub) return this.redisPub.rpush(key, values);
		return 0;
	}

	public pop(key: string) {
		if (this.redisPub) return this.redisPub.rpop(key);
		return Promise.resolve('');
	}

	public getQueueLength(key: string) {
		if (this.redisPub) return this.redisPub.llen(key);
		return Promise.resolve(0);
	}
}

const redisUtil = new RedisUtil();
export default redisUtil;
