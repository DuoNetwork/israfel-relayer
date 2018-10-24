import WebSocket from 'ws';
import * as CST from '../common/constants';
import { IWsRequest, IWsResponse, IWsSequenceResponse } from '../common/types';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';
import util from './util';

class SequenceUtil {
	public sequence: { [pair: string]: number } = {};

	public wss: WebSocket.Server | null = null;

	public handleMessage(ws: WebSocket, m: string) {
		util.logDebug('received: ' + m);
		const req: IWsRequest = JSON.parse(m);
		const res: IWsResponse = {
			status: CST.WS_INVALID_REQ,
			channel: req.channel || ''
		};
		if (
			!req.channel ||
			!req.method ||
			req.channel !== CST.DB_SEQUENCE ||
			!CST.SUPPORTED_PAIRS.includes(req.method)
		) {
			try {
				ws.send(JSON.stringify(res));
			} catch (error) {
				util.logDebug(error);
			}

			return;
		}

		const pair = req.method;
		const seqRes: IWsSequenceResponse = {
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			pair: pair,
			sequence: ++this.sequence[pair]
		};
		redisUtil.set(`${CST.DB_SEQUENCE}|${pair}`, this.sequence[pair] + '');
		ws.send(JSON.stringify(seqRes));
	}

	public async startServer() {
		this.wss = new WebSocket.Server({ port: CST.ID_SERVICE_PORT });

		for (const pair of CST.SUPPORTED_PAIRS) {
			const seq = Number(await redisUtil.get(`${CST.DB_SEQUENCE}|${pair}`));
			dynamoUtil.updateStatus(pair, seq);
			this.sequence[pair] = seq;
		}

		setInterval(async () => {
			for (const pair in this.sequence)
				await dynamoUtil.updateStatus(pair, this.sequence[pair]);
		}, 15000);

		if (this.wss)
			this.wss.on('connection', ws => {
				util.logInfo('new connection');
				ws.on('message', message => this.handleMessage(ws, message.toString()));
			});
	}
}

const sequenceUtil = new SequenceUtil();
export default sequenceUtil;
