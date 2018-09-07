import { ZeroEx } from '0x.js';
import { BigNumber } from '@0xproject/utils';
import * as bodyParser from 'body-parser';
import express from 'express';
import * as http from 'http';
import { connection as WebSocketConnection, server as WebSocketServer } from 'websocket';
import relayerUtil from './relayerUtil';

// Global state
const clients: any[] = [];
let socketConnection: WebSocketConnection | undefined;

// HTTP Server
const app = express();
app.use(bodyParser.json());
app.get('/v0/orderbook', (req, res) => {
	console.log('HTTP: GET orderbook');
	const baseTokenAddress = req.param('baseTokenAddress');
	const quoteTokenAddress = req.param('quoteTokenAddress');
	res.status(201).send(relayerUtil.renderOrderBook(baseTokenAddress, quoteTokenAddress));
});
app.post('/v0/order', (req, res) => {
	console.log('HTTP: POST order');
	const order = req.body;
	const returnMsg = relayerUtil.handleWsMsg(order);
	for (const connection of clients) connection.sendUTF(JSON.stringify(returnMsg));

	res.status(201).send({});
});
app.post('/v0/fees', (req, res) => {
	console.log('HTTP: POST fees');
	const makerFee = new BigNumber(0).toString();
	const takerFee = ZeroEx.toBaseUnitAmount(new BigNumber(10), 18).toString();
	console.log(req);
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
	console.log(new Date() + ' Connection from origin ' + request.origin);
	socketConnection = request.accept(undefined, request.origin);
	const index = clients.push(socketConnection) - 1;
	console.log('WS: Connection accepted');
	socketConnection.on('message', message => {
		if (message.type === 'utf8' && message.utf8Data !== undefined) {
			const parsedMessage = JSON.parse(message.utf8Data);
			if (socketConnection === undefined) throw console.error('Socket connection is undefined！');
			const returnMsg = relayerUtil.handleWsMsg(parsedMessage);
			for (const connection of clients) connection.sendUTF(JSON.stringify(returnMsg));
		} else throw console.error('message is not utf8 or defined!');
	});
	socketConnection.on('close', () => {
		console.log('WS: Peer disconnected');
		clients.splice(index, 1);
	});
});
