import { orderHashUtils, SignedOrder } from '0x.js';
import WebSocket from 'ws';
import * as CST from './common/constants';
import {
	ErrorResponseWs,
	IQueueOrder,
	// IDuoOrder,
	// IOrderBookSnapshotWs,
	// IUpdateResponseWs,
	// IOption,
	WsChannelMessageTypes,
	WsChannelName
	// IAddOrderRequest,
	// IBaseRequest,
	// ICanceleOrderRequest
	// WsChannelResposnseTypes
} from './common/types';
import dynamoUtil from './utils/dynamoUtil';
import orderUtil from './utils/orderUtil';
import relayerUtil from './utils/relayerUtil';
import util from './utils/util';

// Global state

class WsServer {
	public wss: WebSocket.Server | null = null;
	public ws: WebSocket | null = null;
	public ip: string = '';

	public isWaitingId: boolean = false;
	public processingQueue: IQueueOrder[] = [];

	public init() {
		relayerUtil.init();
		const port = 8080;
		this.wss = new WebSocket.Server({ port: port });
	}

	public connectToIdService() {
		this.ws = new WebSocket(`${CST.ID_SERVICE_URL}:${CST.ID_SERVICE_PORT}`);

		// console.log(msg);

		this.ws.on('open', () => {
			console.log('client connected!');
			// numberOfOrdersSent++;
		});

		this.ws.on('message', m => {
			if (this.isWaitingId) {
				const receivedMsg = JSON.parse(m.toString());
				const id = receivedMsg.id;
				const orderObj = this.processingQueue[0];
				delete this.processingQueue[0];
				relayerUtil.handleAddOrder(
					id,
					orderObj.pair,
					orderObj.orderHash,
					orderObj.signedOrder
				);
				orderObj.ws.send(
					JSON.stringify({
						method: CST.DB_TP_ADD,
						channel: `${WsChannelName.Order}| ${orderObj.pair}`,
						status: 'success',
						orderHash: orderObj.orderHash,
						message: ''
					})
				);
				this.isWaitingId = false;
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
						if (parsedMessage.method === WsChannelMessageTypes.Add) {
							util.logInfo('add new order');

							const signedOrder: SignedOrder = orderUtil.toSignedOrder(parsedMessage);
							const { signature, ...order } = signedOrder;

							const orderHash = orderHashUtils.getOrderHashHex(order);

							if (await orderUtil.validateNewOrder(signedOrder, orderHash)) {
								if (this.ws && !this.isWaitingId) {
									this.ws.send(JSON.stringify({ ip: this.ip }));
									this.isWaitingId = true;
									this.processingQueue.push({
										ws,
										pair,
										orderHash,
										signedOrder
									});
								}
							} else
								ws.send(
									JSON.stringify({
										method: CST.DB_TP_ADD,
										channel: `${WsChannelName.Order}| ${pair}`,
										status: 'failed',
										orderHash: orderHash,
										message: ErrorResponseWs.InvalidOrder
									})
								);
						} else if (parsedMessage.method === WsChannelMessageTypes.Cancel)
							ws.send(
								JSON.stringify(
									await relayerUtil.handleCancel(parsedMessage.orderHash, pair)
								)
							);
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

	// Listen to DB and return updates to client
	// for (const pair of CST.TRADING_PAIRS) {
	// 	const orderListener = firebaseUtil.getRef(`/${CST.DB_ORDERS}|${pair}`);
	// 	(orderListener as CollectionReference).onSnapshot(docs => {
	// 		console.log('receive DB updates, to generate delta...');
	// 		const timestamp = Date.now();
	// 		const changedOrders = docs.docChanges.reduce((result: IDuoOrder[], dc) => {
	// 			if (dc.type === 'added') result.push(dc.doc.data() as IDuoOrder);
	// 			// if (dc.type === 'modified')
	// 			// 	return relayerUtil.onModifiedOrder(dc.doc.data() as IDuoOrder);
	// 			if (dc.type === 'removed') {
	// 				const removedOrder = dc.doc.data() as IDuoOrder;
	// 				if (!removedOrder.isValid || removedOrder.isCancelled)
	// 					result.push(relayerUtil.onRemovedOrder(removedOrder));
	// 			}
	// 			return result
	// 		}, []);
	// 		const orderBookDelta = relayerUtil.aggrOrderBook(changedOrders, pair, timestamp);
	// 		const bidOrderBookDelta = orderBookDelta.bids;
	// 		const askOrderBookDelta = orderBookDelta.asks;
	// 		console.log('snapshot bid changes size is ', bidOrderBookDelta.length);
	// 		console.log('snapshot ask changes size is ', askOrderBookDelta.length);

	// 		relayerUtil.applyChangeOrderBook(
	// 			pair,
	// 			timestamp,
	// 			bidOrderBookDelta,
	// 			askOrderBookDelta
	// 		);
	// 		console.log('update relayer orderbook');

	// 		const orderBookUpdate: IUpdateResponseWs = {
	// 			type: WsChannelResposnseTypes.Update,
	// 			lastTimestamp: relayerUtil.now,
	// 			currentTimestamp: timestamp,
	// 			channel: {
	// 				name: WsChannelName.Orderbook,
	// 				pair: 'ZRX-WETH'
	// 			},
	// 			bids: bidOrderBookDelta,
	// 			asks: askOrderBookDelta
	// 		};
	// 		relayerUtil.now = timestamp;
	// 		wss.clients.forEach(client => {
	// 			if (client.readyState === WebSocket.OPEN) {
	// 				client.send(JSON.stringify(orderBookUpdate));
	// 				console.log('broadcast new updates!');
	// 			}
	// 		});
	// 	});
	// }
}

const wsServer = new WsServer();
export default wsServer;
