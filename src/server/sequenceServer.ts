import WebSocket from 'ws';
import * as CST from '../common/constants';
import { IWsRequest, IWsResponse, IWsSequenceResponse } from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import redisUtil from '../utils/redisUtil';
import util from '../utils/util';

class SequenceServer {
	private wss: WebSocket.Server | null = null;
	private connectionCount: number = 0;
	public sequence: { [pair: string]: number } = {};

	public handleMessage(ws: WebSocket, m: string) {
		util.logDebug('received: ' + m);
		const req: IWsRequest = JSON.parse(m);
		const res: IWsResponse = {
			status: CST.WS_INVALID_REQ,
			channel: req.channel || '',
			method: req.method || ''
		};
		if (
			!req.channel ||
			!req.method ||
			req.channel !== CST.DB_SEQUENCE ||
			!CST.SUPPORTED_PAIRS.includes(req.method)
		) {
			util.safeWsSend(ws, JSON.stringify(res));
			return;
		}

		const pair = req.method;
		const seqRes: IWsSequenceResponse = {
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			method: pair,
			sequence: ++this.sequence[pair]
		};
		redisUtil.set(`${CST.DB_SEQUENCE}|${pair}`, this.sequence[pair] + '');
		util.safeWsSend(ws, JSON.stringify(seqRes));
	}

	public async startServer() {
		for (const pair of CST.SUPPORTED_PAIRS) {
			const seq = Number(await redisUtil.get(`${CST.DB_SEQUENCE}|${pair}`));
			dynamoUtil.updateStatus(pair, 0, seq);
			this.sequence[pair] = seq;
		}

		setInterval(async () => {
			for (const pair in this.sequence)
				await dynamoUtil.updateStatus(pair, this.connectionCount, this.sequence[pair]);
		}, 15000);

		this.wss = new WebSocket.Server({ port: CST.SEQUENCE_PORT });
		if (this.wss)
			this.wss.on('connection', ws => {
				util.logInfo('new connection');
				this.connectionCount++;
				ws.on('message', message => this.handleMessage(ws, message.toString()));
				ws.on('close', () => {
					util.logInfo('connection close');
					this.connectionCount = Math.max(this.connectionCount - 1, 0);
				});
			});
	}
}

const sequenceServer = new SequenceServer();
export default sequenceServer;
