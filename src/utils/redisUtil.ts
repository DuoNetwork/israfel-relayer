import Redis from 'ioredis';
import * as CST from '../common/constants';
import {  IOrderBookSnapshotUpdate, IOrderQueueItem } from '../common/types';
import util from './util';

class RedisUtil {
	private redisPub: Redis.Redis | null = null;
	private redisSub: Redis.Redis | null = null;
	private handleOrderBookUpdate:
		| ((channel: string, orderBookUpdate: IOrderBookSnapshotUpdate) => any)
		| null = null;
	private handleOrderUpdate:
		| ((channel: string, orderQueueItem: IOrderQueueItem) => any)
		| null = null;

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
		util.logDebug(pattern + channel + message);
		const type = channel.split('|')[0];
		switch (type) {
			case CST.DB_ORDER_BOOKS:
				if (this.handleOrderBookUpdate)
					this.handleOrderBookUpdate(channel, JSON.parse(message));
				break;
			case CST.DB_ORDERS:
				if (this.handleOrderUpdate) this.handleOrderUpdate(channel, JSON.parse(message));
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

	public publish(channel: string, msg: string) {
		if (this.redisPub) return this.redisPub.publish(channel, msg);
		return Promise.resolve(0);
	}

	public increment(key: string) {
		if (this.redisPub) return this.redisPub.incr(key);
		return Promise.reject();
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
		return Promise.resolve(null);
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
		return Promise.resolve(null);
	}

	public hashDelete(key: string, field: string) {
		if (this.redisPub) return this.redisPub.hdel(key, field);
	}

	public subscribe(channel: string) {
		if (this.redisSub) this.redisSub.subscribe(channel);
	}

	public patternSubscribe(pattern: string) {
		if (this.redisSub) this.redisSub.psubscribe(pattern);
	}

	public unsubscribe(channel: string) {
		if (this.redisSub) this.redisSub.unsubscribe(channel);
	}

	public patternUnsubscribe(pattern: string) {
		if (this.redisSub) this.redisSub.punsubscribe(pattern);
	}

	public push(key: string, ...values: string[]) {
		if (this.redisPub) this.redisPub.lpush(key, values);
	}

	public putBack(key: string, ...values: string[]) {
		if (this.redisPub) this.redisPub.rpush(key, values);
	}

	public pop(key: string) {
		if (this.redisPub) return this.redisPub.rpop(key);
		return Promise.resolve('');
	}

	public multi() {
		if (this.redisPub) return this.redisPub.multi({ pipeline: false });
		return Promise.resolve('');
	}

	public exec() {
		if (this.redisPub) return this.redisPub.exec();
		return Promise.resolve('');
	}

	public getQueueLength(key: string) {
		if (this.redisPub) return this.redisPub.llen(key);
		return Promise.resolve(0);
	}
}

const redisUtil = new RedisUtil();
export default redisUtil;
