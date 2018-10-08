import { CollectionReference } from '@google-cloud/firestore';
import WebSocket from 'ws';
import * as CST from './constants';
import firebaseUtil from './firebaseUtil';
import relayerUtil from './relayerUtil';
import {
	IDuoOrder,
	// IOrderBookSnapshotWs,
	IUpdateResponseWs,
	WsChannelMessageTypes,
	WsChannelName,
	WsChannelResposnseTypes
} from './types';
import util from './util';

// Global state
const mainAsync = async () => {
	firebaseUtil.init();
	await relayerUtil.init();

	// WebSocket server
	const wss = new WebSocket.Server({ port: 8080 });
	wss.on('connection', ws => {
		console.log('Standard relayer API (WS) listening on port 8080!');
		ws.on('message', async message => {
			console.log('received: %s', message);
			const parsedMessage = JSON.parse(message.toString());
			const type = parsedMessage.type;
			const channelName = parsedMessage.channel.name;
			console.log(channelName);
			if (channelName === WsChannelName.Order)
				if (type === WsChannelMessageTypes.Add) {
					util.log('add new order');
					ws.send(JSON.stringify(await relayerUtil.handleAddorder(parsedMessage)));
				} else if (type === WsChannelMessageTypes.Cancel)
					ws.send(
						JSON.stringify(
							await relayerUtil.handleCancel(
								parsedMessage.payload.orderHash,
								parsedMessage.channel.marketId
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

	// Listen to DB and return updates to client
	const orderListener = firebaseUtil.getRef(`/${CST.DB_ORDERS}|ZRX-WETH`);
	(orderListener as CollectionReference).onSnapshot(docs => {
		console.log('receive DB updates, to generate delta...');
		const changedOrders = docs.docChanges.map(dc => dc.doc.data() as IDuoOrder);
		const [bidOrderBookDelta, askOrderBookDelta] = relayerUtil.aggrOrderBook(changedOrders, 'ZRX-WETH');
		console.log('snapshot bid changes size is ', bidOrderBookDelta.length);
		console.log('snapshot ask changes size is ', askOrderBookDelta.length);
		relayerUtil.applyChangeOrderBook(bidOrderBookDelta, askOrderBookDelta);
		console.log('update relayer orderbook');
		const currentTimestamp = Date.now();
		const orderBookUpdate: IUpdateResponseWs = {
			type: WsChannelResposnseTypes.Update,
			lastTimestamp: relayerUtil.now,
			currentTimestamp: currentTimestamp,
			channel: {
				name: WsChannelName.Orderbook,
				marketId: 'ZRX-WETH'
			},
			bids: bidOrderBookDelta,
			asks: askOrderBookDelta
		};
		relayerUtil.now = currentTimestamp;
		wss.clients.forEach(client => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify(orderBookUpdate));
				console.log('broadcast new updates!');
			}
		});
	});
};
mainAsync().catch(console.error);
