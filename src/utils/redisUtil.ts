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

	public publish(channel: string, msg: string): void {
		if (this.redisPub) this.redisPub.publish(channel, msg);
	}

	public set(key: string, value: string): void {
		if (this.redisSub) this.redisSub.set(key, value);
	}

	public get(key: string): void {
		if (this.redisSub) this.redisSub.get(key);
	}

	public subscribe(channel: string): void {
		if (this.redisSub) this.redisSub.subscribe(channel);
	}

	public patternSubscribe(pattern: string): void {
		if (this.redisSub) this.redisSub.psubscribe(pattern);
	}

	public unsubscribe(channel: string): void {
		if (this.redisSub) this.redisSub.unsubscribe(channel);
	}

	public patternUnsubscribe(pattern: string): void {
		if (this.redisSub) this.redisSub.punsubscribe(pattern);
	}

	public push(key: string, ...values: string[]): void {
		if (this.redisSub) this.redisSub.lpush(key, values);
	}

	public putBack(key: string, ...values: string[]): void {
		if (this.redisSub) this.redisSub.rpush(key, values);
	}

	public async pop(key: string): Promise<string> {
		if (this.redisSub) return await this.redisSub.rpop(key);
		return '';
	}

	public async getQueueLength(key: string): Promise<number> {
		if (this.redisSub) return this.redisSub.llen(key);
		return 0;
	}
}

const redisUtil = new RedisUtil();
export default redisUtil;
