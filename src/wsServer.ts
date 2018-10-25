import { orderHashUtils, SignedOrder } from '0x.js';
import WebSocket from 'ws';
import * as CST from './common/constants';
import {
	ErrorResponseWs,
	ILiveOrder,
	IQueueOrder,
	IWsRequest,
	IWsSequenceResponse,
	WsChannelMessageTypes,
	WsChannelName
} from './common/types';
import dynamoUtil from './utils/dynamoUtil';
import orderUtil from './utils/orderUtil';
import relayerUtil from './utils/relayerUtil';
import util from './utils/util';

class WsServer {
	public wss: WebSocket.Server | null = null;
	public ws: WebSocket | null = null;
	public ip: string = '';
	public pendingRequest: IQueueOrder[] = [];

	public init() {
		relayerUtil.init();
		const port = 8080;
		this.wss = new WebSocket.Server({ port: port });
	}

	public connectToIdService() {
		this.ws = new WebSocket(`${CST.ID_SERVICE_URL}:${CST.ID_SERVICE_PORT}`);

		this.ws.on('open', () => {
			console.log('client connected!');
		});

		this.ws.on('message', m => {
			const receivedMsg: IWsSequenceResponse = JSON.parse(m.toString());
			const sequence = receivedMsg.sequence;
			const orderObj = this.pendingRequest[0];
			delete this.pendingRequest[0];
			if (orderObj.method === WsChannelMessageTypes.Add) {
				relayerUtil.handleAddOrder(
					sequence + '',
					orderObj.pair,
					orderObj.orderHash,
					orderObj.order as SignedOrder
				);
				orderObj.ws.send(
					JSON.stringify({
						method: CST.DB_ADD,
						channel: `${WsChannelName.Order}| ${orderObj.pair}`,
						status: 'success',
						orderHash: orderObj.orderHash,
						message: ''
					})
				);
			} else if (orderObj.method === WsChannelMessageTypes.Cancel) {
				relayerUtil.handleCancel(sequence + '', orderObj.order as ILiveOrder);

				orderObj.ws.send(
					JSON.stringify({
						method: CST.DB_CANCEL,
						channel: `${WsChannelName.Order}| ${orderObj.pair}`,
						status: 'success',
						orderHash: orderObj.orderHash,
						message: ''
					})
				);
			}
		});

		this.ws.on('error', (error: Error) => {
			console.log('client got error! %s', error);
		});

		this.ws.on('close', () => console.log('connection closed!'));
	}

	public startServer() {
		if (this.wss)
			this.wss.on('connection', ws => {
				util.logInfo('Standard relayer API (WS) listening on port 8080!');
				ws.on('message', async message => {
					util.logInfo('received: ' + message);
					const parsedMessage: any = JSON.parse(message.toString());
					// const type = parsedMessage.type;
					const [channelName, pair] = parsedMessage.channel.split('|');
					if (channelName === WsChannelName.Order)
						if (!this.ws)
							ws.send(
								JSON.stringify({
									message: 'id service not available'
								})
							);
						else if (parsedMessage.method === WsChannelMessageTypes.Add) {
							util.logInfo('add new order');

							const signedOrder: SignedOrder = orderUtil.parseSignedOrder(parsedMessage);
							const { signature, ...order } = signedOrder;

							const orderHash = orderHashUtils.getOrderHashHex(order);

							if (await orderUtil.validateOrder(signedOrder, orderHash)) {
								const requestSequence: IWsRequest = {
									method: pair,
									channel: CST.DB_SEQUENCE
								};
								this.ws.send(JSON.stringify(requestSequence));

								this.pendingRequest.push({
									ws: ws,
									pair: pair,
									method: channelName,
									orderHash: orderHash,
									order: signedOrder
								});
							} else
								ws.send(
									JSON.stringify({
										method: CST.DB_ADD,
										channel: `${WsChannelName.Order}| ${pair}`,
										status: 'failed',
										orderHash: orderHash,
										message: ErrorResponseWs.InvalidOrder
									})
								);
						} else if (parsedMessage.method === WsChannelMessageTypes.Cancel) {
							const orderHash = parsedMessage.orderHash;
							let liveOrders: ILiveOrder[] = [];
							try {
								liveOrders = await dynamoUtil.getLiveOrders(pair, orderHash);
							} catch (err) {
								console.log(err);
							}

							if (liveOrders.length < 1)
								ws.send(
									JSON.stringify({
										method: CST.DB_CANCEL,
										channel: `${WsChannelName.Order}| ${pair}`,
										status: 'fail',
										orderHash: orderHash,
										message: 'order does not exist'
									})
								);
							else {
								const requestSequence: IWsRequest = {
									method: pair,
									channel: CST.DB_SEQUENCE
								};

								this.ws.send(JSON.stringify(requestSequence));
								this.pendingRequest.push({
									ws: ws,
									pair: pair,
									method: channelName,
									orderHash: orderHash,
									order: liveOrders[0]
								});
							}
						}
					// TO DO send new orders based on payload Assetpairs
					// else if (type === CST.ORDERBOOK_UPDATE)
					// 	const returnMsg = await relayerUtil.handleUpdate(parsedMessage);
					if (channelName === WsChannelName.Orderbook) {
						console.log('subscribe orderbook');
						ws.send(JSON.stringify(relayerUtil.handleSubscribe(parsedMessage)));
					}
				});
			});

		setInterval(() => dynamoUtil.updateStatus('WS_SERVER'), 10000);
	}
}

const wsServer = new WsServer();
export default wsServer;
