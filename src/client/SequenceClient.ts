import WebSocket from 'ws';
import * as CST from '../common/constants';
import {
	ISequenceCacheItem,
	IWsOrderRequest,
	IWsOrderResponse,
	IWsOrderSequenceResponse,
	IWsResponse
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import util from '../utils/util';

export default abstract class SequenceClient {
	public sequenceWsClient: WebSocket | null = null;
	public abstract handleSequenceResponse(
		res: IWsOrderSequenceResponse,
		cacheItem: ISequenceCacheItem
	): any;
	public sequenceMethods: string[] = [];
	public requestCache: { [methodPairOrderHash: string]: ISequenceCacheItem } = {};

	public getCacheKey(re: IWsOrderRequest | IWsOrderResponse) {
		return `${re.method}|${re.pair}|${re.orderHash}`;
	}

	public handleTimeout(cacheKey: string) {
		util.logError(cacheKey);
		return;
	}

	public async handleMessage(m: string) {
		util.logDebug('received: ' + m);
		const res: IWsResponse = JSON.parse(m);
		if (res.channel !== CST.DB_SEQUENCE || res.status !== CST.WS_OK) return false;

		const osRes = res as IWsOrderSequenceResponse;
		const { sequence, method, pair, orderHash } = osRes;
		if (!this.sequenceMethods.includes(method)) return false;
		if (!sequence || !pair || !orderHash) return false;

		const cacheKey = this.getCacheKey(osRes);
		util.logDebug(cacheKey);
		const cacheItem = this.requestCache[cacheKey];
		if (!cacheItem) {
			util.logDebug('request id does not exist');
			return false;
		}

		delete this.requestCache[cacheKey];
		clearTimeout(cacheItem.timeout);
		cacheItem.liveOrder.currentSequence = sequence;

		try {
			await this.handleSequenceResponse(osRes, cacheItem);
			return true;
		} catch (error) {
			// failed to persist, add back to cache for next retry
			cacheItem.timeout = setTimeout(() => this.handleTimeout(cacheKey), 30000);
			this.requestCache[cacheKey] = cacheItem;
			this.requestSequence(res.method, res.pair, cacheItem.liveOrder.orderHash);
			return false;
		}
	}

	private reconnect(server: boolean) {
		if (this.sequenceWsClient) {
			this.sequenceWsClient.removeAllListeners();
			this.sequenceWsClient.terminate();
		}
		this.connectToSequenceServer(server);
	}

	public async connectToSequenceServer(server: boolean) {
		let url = `ws://13.251.115.119:8000`;
		if (server) {
			const sequenceService = await dynamoUtil.getServices(CST.DB_SEQUENCE);
			if (!sequenceService.length) {
				util.logInfo('no sequence service config, exit');
				return;
			}
			util.logInfo('loaded sequence service config');
			util.logInfo(sequenceService[0]);
			url = sequenceService[0].url;
		}

		this.sequenceWsClient = new WebSocket(url);

		this.sequenceWsClient.on('open', () =>
			util.logInfo(`connected to sequence service at ${url}`)
		);
		this.sequenceWsClient.on('message', m => this.handleMessage(m.toString()));
		this.sequenceWsClient.on('error', (error: Error) => {
			util.logError(error);
			this.reconnect(server);
		});
		this.sequenceWsClient.on('close', (code: number, reason: string) => {
			util.logError('connection closed ' + code + ' ' + reason);
			this.reconnect(server);
		});

		return;
	}

	public requestSequence(method: string, pair: string, orderHash: string) {
		if (this.sequenceWsClient) {
			util.logDebug(`request sequence for ${method}|${pair}|${orderHash}`);
			const requestSequence: IWsOrderRequest = {
				method: method,
				channel: CST.DB_SEQUENCE,
				pair: pair,
				orderHash: orderHash
			};
			util.safeWsSend(this.sequenceWsClient, JSON.stringify(requestSequence));
		}
	}
}
