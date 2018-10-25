import WebSocket from 'ws';
import * as CST from '../common/constants';
import util from '../utils/util';

export default abstract class SequenceClient {
	public sequenceWsClient: WebSocket | null = null;
	public abstract handleSequenceMessage(m: string): any;
	public connectToSequenceServer(live: boolean) {
		this.sequenceWsClient = new WebSocket(
			`${live ? CST.SEQUENCE_URL_LIVE : CST.SEQUENCE_URL_DEV}:${CST.SEQUENCE_PORT}`
		);

		this.sequenceWsClient.on('open', () => util.logInfo('connected to sequence server'));
		this.sequenceWsClient.on('message', m => this.handleSequenceMessage(m.toString()));
		this.sequenceWsClient.on('error', (error: Error) => {
			util.logError(error);
			if (this.sequenceWsClient) {
				this.sequenceWsClient.removeAllListeners();
				this.sequenceWsClient.terminate();
			}
			this.connectToSequenceServer(live);
		});
		this.sequenceWsClient.on('close', (code: number, reason: string) => {
			util.logError('connection closed ' + code + ' ' + reason);
			if (this.sequenceWsClient) {
				this.sequenceWsClient.removeAllListeners();
				this.sequenceWsClient.terminate();
			}
			this.connectToSequenceServer(live);
		});
	}
}
