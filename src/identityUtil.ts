import WebSocket from 'ws';
import * as CST from './constants';
import redisUtil from './redisUtil';
import { IRequestId } from './types';
import util from './util';

class IdentityUtil {
	public id: number = 0;

	public wss: WebSocket.Server | null = null;

	public init() {
		this.wss = new WebSocket.Server({ port: CST.ID_SERVICE_PORT });
	}

	public async startServer() {
		this.id = Number(await redisUtil.get(CST.ORDER_CURRENT_ID));
		if (this.wss)
			this.wss.on('connection', ws => {
				util.logInfo('Standard order id service on port 8000!');
				ws.on('message', async message => {
					util.logInfo('received: ' + message);
					const parsedMessage: IRequestId = JSON.parse(message.toString());
					// const type = parsedMessage.type;
					util.logInfo('received request from ip ' + parsedMessage.ip);

					ws.send(JSON.stringify({id: this.id + 1}));

					this.id ++;
					redisUtil.set(CST.ORDER_CURRENT_ID, this.id + '');
				});
			});
	}
}
const identityUtil = new IdentityUtil();
export default identityUtil;
