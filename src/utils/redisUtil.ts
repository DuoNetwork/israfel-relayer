import Redis from 'ioredis';
import * as CST from '../common/constants';
import { IOrderBookUpdate } from '../common/types';
import util from './util';

export class RedisUtil {
	private redisPub: Redis.Redis | null = null;
	private redisSub: Redis.Redis | null = null;
	private handleOrderBookUpdate:
		| ((channel: string, orderBookUpdate: IOrderBookUpdate) => any)
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
		util.logDebug(pattern + channel);
		const type = channel.split('|')[0];
		switch (type) {
			case CST.ORDERBOOK_UPDATE:
				if (this.handleOrderBookUpdate)
					this.handleOrderBookUpdate(channel, JSON.parse(message));
				break;
			default:
				break;
		}
	}

	public onOrderBooks(
		handleOrderBookUpdate: (channel: string, orderBookUpdate: IOrderBookUpdate) => any
	) {
		this.handleOrderBookUpdate = handleOrderBookUpdate;
	}

	public publish(channel: string, msg: string) {
		if (this.redisPub) return this.redisPub.publish(channel, msg);
		return Promise.resolve(0);
	}

	public set(key: string, value: string) {
		if (this.redisSub) return this.redisSub.set(key, value);
		return Promise.resolve('');
	}

	public get(key: string) {
		if (this.redisSub) return this.redisSub.get(key);
		return Promise.resolve('');
	}

	public hashSet(key: string, field: string, value: string) {
		if (this.redisSub) return this.redisSub.hset(key, field, value);
		return Promise.resolve(0);
	}

	public async hashGet(key: string, field: string): Promise<string | null> {
		if (this.redisSub) return this.redisSub.hget(key, field);
		return null;
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
		if (this.redisSub) this.redisSub.lpush(key, values);
	}

	public putBack(key: string, ...values: string[]) {
		if (this.redisSub) this.redisSub.rpush(key, values);
	}

	public pop(key: string) {
		if (this.redisSub) return this.redisSub.rpop(key);
		return Promise.resolve('');
	}

	public multi() {
		if (this.redisSub) return this.redisSub.multi({pipeline: false});
		return Promise.resolve('');
	}

	public exec() {
		if (this.redisSub) return this.redisSub.exec();
		return Promise.resolve('');
	}

	public getQueueLength(key: string) {
		if (this.redisSub) return this.redisSub.llen(key);
		return Promise.resolve(0);
	}
}

const redisUtil = new RedisUtil();
export default redisUtil;
