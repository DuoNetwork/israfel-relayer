import WebSocket from 'ws';
import * as CST from '../common/constants';
import { IRequestId } from '../common/types';
import redisUtil from './redisUtil';
import util from './util';

class SequenceUtil {
	public id: { [key: string]: number } = {};

	public wss: WebSocket.Server | null = null;

	public init() {
		this.wss = new WebSocket.Server({ port: CST.ID_SERVICE_PORT });
	}

	public async startServer() {
		for (const pair of CST.SUPPORTED_PAIRS)
			this.id[pair] = Number(await redisUtil.get(`${pair}|${CST.DB_SEQUENCE}`));

		if (this.wss)
			this.wss.on('connection', ws => {
				util.logInfo('Standard order id service on port 8000!');
				ws.on('message', async message => {
					util.logInfo('received: ' + message);
					const parsedMessage: IRequestId = JSON.parse(message.toString());
					const pair = parsedMessage.pair;
					// const type = parsedMessage.type;
					util.logInfo('received request from ip ' + parsedMessage.ip);

					ws.send(JSON.stringify({ id: this.id[pair] + 1, requestId: parsedMessage.requestId }));

					this.id[pair] = this.id[pair]  + 1;
					redisUtil.set(`${pair}|${CST.DB_SEQUENCE}`, this.id[pair] + '');
				});
			});
	}
}

const sequenceUtil = new SequenceUtil();
export default sequenceUtil;
