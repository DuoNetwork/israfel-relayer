// import { ZeroEx } from '0x.js';
import { OrderbookChannelMessageTypes } from '@0xproject/connect/lib/src/types';
// import { BigNumber } from '@0xproject/utils';
// import * as bodyParser from 'body-parser';
// import express from 'express';
// import { connection as WebSocketConnection, server as WebSocketServer } from 'websocket';
import WebSocket from 'ws';
import firebaseUtil from '../firebaseUtil';
import relayerUtil from './relayerUtil';

// Global state
// const clients: any[] = [];
// let socketConnection: WebSocketConnection | undefined;

firebaseUtil.init();

// HTTP Server
// const app = express();
// app.use(bodyParser.json());
// app.get('/v0/orderbook', (req, res) => {
// 	console.log('HTTP: GET orderbook');
// 	const baseTokenAddress = req.param('baseTokenAddress');
// 	const quoteTokenAddress = req.param('quoteTokenAddress');
// 	res.status(201).send(relayerUtil.renderOrderBook(baseTokenAddress, quoteTokenAddress));
// });
// app.post('/v0/order', (req, res) => {
// 	console.log('HTTP: POST order');
// 	const order = req.body;
// 	// orders.push(order);
// 	if (socketConnection !== undefined) {
// 		const message = {
// 			type: 'update',
// 			channel: 'orderbook',
// 			requestId: 1,
// 			payload: order
// 		};
// 		socketConnection.send(JSON.stringify(message));
// 	}
// 	res.status(201).send({});
// });
// app.post('/v0/fees', (req, res) => {
// 	console.log('HTTP: POST fees');
// 	const makerFee = new BigNumber(0).toString();
// 	const takerFee = ZeroEx.toBaseUnitAmount(new BigNumber(10), 18).toString();
// 	console.log(req);
// 	res.status(201).send({
// 		feeRecipient: ZeroEx.NULL_ADDRESS,
// 		makerFee,
// 		takerFee
// 	});
// });
// app.listen(3000, () => console.log('Standard relayer API (HTTP) listening on port 3000!'));

// WebSocket server
const wss = new WebSocket.Server({ port: 8080 });
wss.on('connection', ws => {
	console.log('Standard relayer API (WS) listening on port 8080!');
	ws.on('message', async message => {
		console.log('received: %s', message);
		const parsedMessage = JSON.parse(message.toString());
		const type = parsedMessage.type;
		if (type === OrderbookChannelMessageTypes.Snapshot) {
			const snapshotNeeded = parsedMessage.payload.snapshot;
			if (snapshotNeeded) {
				const returnMsg = await relayerUtil.handleSnapshot(parsedMessage);
				ws.send(JSON.stringify(returnMsg));
				console.log('send orderbook snapshot!');
			} else {
				ws.send('subscribed without orderbook snapshot!');
				console.log('received subscription!');
			}
		} else if (type === OrderbookChannelMessageTypes.Update) {
			const returnMsg = await relayerUtil.handleUpdate(parsedMessage);
			wss.clients.forEach(client => {
				if (client.readyState === WebSocket.OPEN) {
					client.send(JSON.stringify(returnMsg));
					console.log('broadcast new order!');
				}
			});
		}
	});
});
