import WebSocket from 'ws';
import * as CST from '../common/constants';
import {
	IOption,
	IWsOrderRequest,
	IWsOrderResponse,
	IWsOrderSequenceResponse
} from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import redisUtil from '../utils/redisUtil';
import util from '../utils/util';

class SequenceServer {
	private wss: WebSocket.Server | null = null;
	public sequence: { [pair: string]: number } = {};

	public handleMessage(ws: WebSocket, m: string) {
		util.logDebug('received: ' + m);
		const req: IWsOrderRequest = JSON.parse(m);
		const res: IWsOrderResponse = {
			status: CST.WS_INVALID_REQ,
			channel: req.channel || '',
			method: req.method || '',
			pair: req.pair || '',
			orderHash: req.orderHash || ''
		};
		if (
			req.channel !== CST.DB_SEQUENCE ||
			![CST.DB_ADD, CST.DB_CANCEL, CST.DB_UPDATE].includes(req.method) ||
			!CST.SUPPORTED_PAIRS.includes(req.pair) ||
			!req.orderHash
		) {
			util.safeWsSend(ws, JSON.stringify(res));
			return;
		}

		const pair = req.pair;
		const seqRes: IWsOrderSequenceResponse = {
			channel: CST.DB_SEQUENCE,
			status: CST.WS_OK,
			method: req.method,
			pair: req.pair,
			orderHash: req.orderHash,
			sequence: ++this.sequence[pair]
		};
		redisUtil.set(`${CST.DB_SEQUENCE}|${pair}`, this.sequence[pair] + '');
		util.safeWsSend(ws, JSON.stringify(seqRes));
	}

	public async startServer(option: IOption) {
		for (const pair of CST.SUPPORTED_PAIRS) {
			const seq = Number(await redisUtil.get(`${CST.DB_SEQUENCE}|${pair}`));
			dynamoUtil.updateStatus(pair, 0, seq);
			this.sequence[pair] = seq;
		}

		setInterval(async () => {
			for (const pair in this.sequence)
				await dynamoUtil.updateStatus(
					pair,
					this.wss ? this.wss.clients.size : 0,
					this.sequence[pair]
				);
		}, 15000);

		let port = 8000;
		if (option.server) {
			const sequenceService = await dynamoUtil.getServices(CST.DB_SERVICE, true);
			if (!sequenceService.length) return;
			util.logDebug('loaded sequence service config');
			util.logDebug(sequenceService[0]);
			port = Number(sequenceService[0].url.split(':').slice(-1)[0]);
		}

		this.wss = new WebSocket.Server({ port: port });
		util.logInfo(`started sequence service at port ${port}`);

		if (this.wss)
			this.wss.on('connection', ws => {
				util.logInfo('new connection');
				ws.on('message', message => this.handleMessage(ws, message.toString()));
				ws.on('close', () => util.logInfo('connection close'));
			});
	}
}

const sequenceServer = new SequenceServer();
export default sequenceServer;
