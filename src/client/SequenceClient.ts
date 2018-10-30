import WebSocket from 'ws';
import * as CST from '../common/constants';
import { IWsOrderRequest } from '../common/types';
import util from '../utils/util';

export default abstract class SequenceClient {
	public sequenceWsClient: WebSocket | null = null;
	public abstract handleSequenceMessage(m: string): any;

	private reconnect(live: boolean) {
		if (this.sequenceWsClient) {
			this.sequenceWsClient.removeAllListeners();
			this.sequenceWsClient.terminate();
		}
		this.connectToSequenceServer(live);
	}

	public connectToSequenceServer(live: boolean) {
		this.sequenceWsClient = new WebSocket(
			`${live ? CST.SEQUENCE_URL_LIVE : CST.SEQUENCE_URL_DEV}:${CST.SEQUENCE_PORT}`
		);

		this.sequenceWsClient.on('open', () => util.logInfo('connected to sequence server'));
		this.sequenceWsClient.on('message', m => this.handleSequenceMessage(m.toString()));
		this.sequenceWsClient.on('error', (error: Error) => {
			util.logError(error);
			this.reconnect(live);
		});
		this.sequenceWsClient.on('close', (code: number, reason: string) => {
			util.logError('connection closed ' + code + ' ' + reason);
			this.reconnect(live);
		});
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
