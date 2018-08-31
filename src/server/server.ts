import { ZeroEx } from '0x.js';
import { BigNumber } from '@0xproject/utils';
import * as bodyParser from 'body-parser';
import express from 'express';
import * as http from 'http';
import { connection as WebSocketConnection, server as WebSocketServer } from 'websocket';
import { ISignedOrder } from '../types';

// Global state
const orders: ISignedOrder[] = [];
let socketConnection: WebSocketConnection | undefined;

// HTTP Server
const app = express();
app.use(bodyParser.json());
app.get('/v0/orderbook', (req, res) => {
	console.log('HTTP: GET orderbook');
	const baseAssetData = req.param('baseAssetData');
	const quoteAssetData = req.param('quoteAssetData');
	res.status(201).send(renderOrderBook(baseAssetData, quoteAssetData));
});
app.post('/v0/order', (req, res) => {
	console.log('HTTP: POST order');
	const order = req.body;
	orders.push(order);
	if (socketConnection !== undefined) {
		const message = {
			type: 'update',
			channel: 'orderbook',
			requestId: 1,
			payload: order
		};
		socketConnection.send(JSON.stringify(message));
	}
	res.status(201).send({});
});
app.post('/v0/fees', (req, res) => {
	console.log(`HTTP: POST ${req}`);
	const makerFee = new BigNumber(0).toString();
	const takerFee = ZeroEx.toBaseUnitAmount(new BigNumber(10), 18).toString();
	res.status(201).send({
		feeRecipient: ZeroEx.NULL_ADDRESS,
		makerFee,
		takerFee
	});
});
app.listen(3000, () => console.log('Standard relayer API (HTTP) listening on port 3000!'));

// WebSocket server
const server = http.createServer((request, response) => {
	console.log(new Date() + ' Received request for ' + request.url);
	response.writeHead(404);
	response.end();
});
server.listen(3001, () => {
	console.log('Standard relayer API (WS) listening on port 3001!');
});
const wsServer = new WebSocketServer({
	httpServer: server,
	autoAcceptConnections: false
});
wsServer.on('request', request => {
	socketConnection = request.accept();
	console.log('WS: Connection accepted');
	socketConnection.on('message', message => {
		if (message.type === 'utf8' && message.utf8Data !== undefined) {
			const parsedMessage = JSON.parse(message.utf8Data);
			console.log('WS: Received Message: ' + parsedMessage.type);
			const snapshotNeeded = parsedMessage.payload.snapshot;
			const baseAssetData = parsedMessage.payload.baseAssetData;
			const quoteAssetData = parsedMessage.payload.quoteAssetData;
			const requestId = parsedMessage.requestId;
			if (snapshotNeeded && socketConnection !== undefined) {
				const orderbook = renderOrderBook(baseAssetData, quoteAssetData);
				const returnMessage = {
					type: 'snapshot',
					channel: 'orderbook',
					requestId,
					payload: orderbook
				};
				socketConnection.sendUTF(JSON.stringify(returnMessage));
			}
		}
	});
	socketConnection.on('close', () => {
		console.log('WS: Peer disconnected');
	});
});

function renderOrderBook(baseAssetData: string, quoteAssetData: string): object {
	const bids = orders.filter(order => {
		return (
			order.takerAssetData === baseAssetData &&
			order.makerAssetData === quoteAssetData
		);
	});
	const asks = orders.filter(order => {
		return (
			order.takerAssetData === quoteAssetData &&
			order.makerAssetData === baseAssetData
		);
	});
	return {
		bids,
		asks
	};
}
