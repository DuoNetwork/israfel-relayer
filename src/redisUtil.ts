// import Redis from 'ioredis';
// import * as CST from '../common/constants';
// import { IOrderBook, ITrade } from '../common/types';
// import util from './util';

// export class RedisUtil {
// 	private redisPub: Redis.Redis | null = null;
// 	private redisSub: Redis.Redis | null = null;
// 	private handleOrderBooksUpdate:
// 		| ((channel: string, orderBooks: { [src: string]: IOrderBook }) => any)
// 		| null = null;
// 	private handleTradesUpdate: ((channel: string, trades: ITrade[]) => any) | null = null;

// 	public init(redisKey: { host: string; password: string; servername: string }) {
// 		this.redisPub = new Redis(6379, redisKey.host, {
// 			password: redisKey.password,
// 			tls: { servername: redisKey.servername }
// 		});
// 		this.redisSub = new Redis(6379, redisKey.host, {
// 			password: redisKey.password,
// 			tls: { servername: redisKey.servername }
// 		});
// 		this.redisSub.on('message', (channel, message) => this.onMessage(channel, message));
// 		this.redisSub.on('pmessage', (pattern, channel, message) =>
// 			this.onMessage(channel, message, pattern)
// 		);
// 	}

// 	public onMessage(channel: string, message: string, pattern: string = '') {
// 		util.logDebug(pattern + channel);
// 		const [type, ...others] = channel.split('|');
// 		switch (type) {
// 			case CST.DB_ORDER_BOOKS:
// 				if (this.handleOrderBooksUpdate)
// 					this.handleOrderBooksUpdate(channel, { [others[0]]: JSON.parse(message) });
// 				break;
// 			case CST.DB_OB_OVERVIEW:
// 			case CST.DB_OB_GLOBAL:
// 				if (this.handleOrderBooksUpdate)
// 					this.handleOrderBooksUpdate(channel, JSON.parse(message));
// 				break;
// 			case CST.DB_TRADES:
// 				if (this.handleTradesUpdate) this.handleTradesUpdate(channel, JSON.parse(message));
// 				break;
// 			default:
// 				break;
// 		}
// 	}

// 	public onOrderBooks(
// 		handleOrderBooksUpdate: (channel: string, orderBooks: { [src: string]: IOrderBook }) => any
// 	) {
// 		this.handleOrderBooksUpdate = handleOrderBooksUpdate;
// 	}

// 	public onTrades(handleTradesUpdate: (channel: string, trades: ITrade[]) => any) {
// 		this.handleTradesUpdate = handleTradesUpdate;
// 	}

// 	public publish(channel: string, msg: string): void {
// 		if (this.redisPub) this.redisPub.publish(channel, msg);
// 	}

// 	public subscribe(channel: string): void {
// 		if (this.redisSub) this.redisSub.subscribe(channel);
// 	}

// 	public patternSubscribe(pattern: string): void {
// 		if (this.redisSub) this.redisSub.psubscribe(pattern);
// 	}

// 	public unsubscribe(channel: string): void {
// 		if (this.redisSub) this.redisSub.unsubscribe(channel);
// 	}

// 	public patternUnsubscribe(pattern: string): void {
// 		if (this.redisSub) this.redisSub.punsubscribe(pattern);
// 	}

// 	public push(key: string, ...values: string[]): void {
// 		if (this.redisSub) this.redisSub.lpush(key, values);
// 	}

// 	public putBack(key: string, ...values: string[]): void {
// 		if (this.redisSub) this.redisSub.rpush(key, values);
// 	}

// 	public async pop(key: string): Promise<string> {
// 		if (this.redisSub) return await this.redisSub.rpop(key);
// 		return '';
// 	}

// 	public async getQueueLength(key: string): Promise<number> {
// 		if (this.redisSub) return this.redisSub.llen(key);
// 		return 0;
// 	}
// }

// const redisUtil = new RedisUtil();
// export default redisUtil;
