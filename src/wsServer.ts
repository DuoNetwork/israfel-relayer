// import { CollectionReference } from '@google-cloud/firestore';
import WebSocket from 'ws';
// import * as CST from './constants';
// import firebaseUtil from './firebaseUtil';
import dynamoUtil from './dynamoUtil';
import relayerUtil from './relayerUtil';
import {
	// IDuoOrder,
	// IOrderBookSnapshotWs,
	// IUpdateResponseWs,
	IOption,
	WsChannelMessageTypes,
	WsChannelName
	// WsChannelResposnseTypes
} from './types';
import util from './util';

// Global state

class WsServer {
	public wss: WebSocket.Server | null = null;

	public init(tool: string, option: IOption) {
		relayerUtil.init(tool, option);
		const port = 8080;
		this.wss = new WebSocket.Server({ port: port });
	}

	public startServer() {
		if (this.wss)
			this.wss.on('connection', ws => {
				util.logInfo('Standard relayer API (WS) listening on port 8080!');
				ws.on('message', async message => {
					util.logInfo('received: ' + message);
					const parsedMessage = JSON.parse(message.toString());
					const type = parsedMessage.type;
					const channelName = parsedMessage.channel.name;
					if (channelName === WsChannelName.Order)
						if (type === WsChannelMessageTypes.Add) {
							util.logInfo('add new order');
							ws.send(
								JSON.stringify(await relayerUtil.handleAddorder(parsedMessage))
							);
						} else if (type === WsChannelMessageTypes.Cancel)
							ws.send(
								JSON.stringify(
									await relayerUtil.handleCancel(
										parsedMessage.payload.orderHash,
										parsedMessage.channel.pair
									)
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
