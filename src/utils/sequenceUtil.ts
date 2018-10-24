import WebSocket from 'ws';
import * as CST from '../common/constants';
import { IRequestId } from '../common/types';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';
import util from './util';

class SequenceUtil {
	private sequence: { [pair: string]: number } = {};

	public wss: WebSocket.Server | null = null;

	public async startServer() {
		this.wss = new WebSocket.Server({ port: CST.ID_SERVICE_PORT });

		for (const pair of CST.SUPPORTED_PAIRS) {
			const seq = Number(await redisUtil.get(`${pair}|${CST.DB_SEQUENCE}`));
			dynamoUtil.updateStatus(pair, seq);
			this.sequence[pair] = seq;
		}

		setInterval(async () => {
			for (const pair in this.sequence)
				await dynamoUtil.updateStatus(pair, this.sequence[pair]);
		}, 15000);

		if (this.wss)
			this.wss.on('connection', ws => {
				util.logInfo(`Standard order sequence service on port ${CST.ID_SERVICE_PORT}!`);
				ws.on('message', message => {
					util.logInfo('received: ' + message);
					const parsedMessage: IRequestId = JSON.parse(message.toString());
					const pair = parsedMessage.pair;
					util.logInfo('received request from ip ' + parsedMessage.ip);

					ws.send(
						JSON.stringify({
							id: ++this.sequence[pair],
							requestId: parsedMessage.requestId
						})
					);

					redisUtil.set(`${pair}|${CST.DB_SEQUENCE}`, this.sequence[pair] + '');
				});
			});
	}
}

const sequenceUtil = new SequenceUtil();
export default sequenceUtil;
