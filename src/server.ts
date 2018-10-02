import { CollectionReference } from '@google-cloud/firestore';
import WebSocket from 'ws';
import * as CST from './constants';
import firebaseUtil from './firebaseUtil';
import relayerUtil from './relayerUtil';
import {
	// IDuoOrder,
	IOrderBookSnapshotWs,
	// IUpdateResponseWs,
	WsChannelMessageTypes,
	WsChannelName,
	WsChannelResposnseTypes
} from './types';
import util from './util';

// Global state
firebaseUtil.init();
relayerUtil.init();

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
			ws.send(JSON.stringify(await relayerUtil.handleSubscribe(parsedMessage)));
		}
	});
});
// Listen to DB and return full snapshot to client
const orderListener = firebaseUtil.getRef(`/${CST.DB_ORDERS}|ZRX-WETH`);
(orderListener as CollectionReference).onSnapshot(async docs => {
	const newOrderbook = await relayerUtil.aggrOrderBook(
		firebaseUtil.querySnapshotToDuo(docs),
		'ZRX-WETH'
	);
	relayerUtil.orderBook = newOrderbook;
	const orderBookSnapshot: IOrderBookSnapshotWs = {
		type: WsChannelResposnseTypes.Snapshot,
		timestamp: Date.now(),
		requestId: 0,
		channel: {
			name: WsChannelName.Orderbook,
			marketId: 'ZRX-WETH'
		},
		bids: newOrderbook[0],
		asks: newOrderbook[1]
	};
	wss.clients.forEach(client => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify(orderBookSnapshot));
			console.log('broadcast new order!');
		}
	});
});

// (orderListener as CollectionReference).onSnapshot(docs => {
// 	// const orders: any[] = [];
// 	docs.docChanges.forEach(doc => {
// 		if (doc.type === CST.DB_ORDER_ADDED) {
// 			util.log('new order added in DB');
// 			const changedOrder = doc.doc.data() as IDuoOrder;
// 			const parsedOrder = relayerUtil.parseOrderInfo(changedOrder, 'ZRX-WETH');
// 			let orderBookUpdate: IUpdateResponseWs = {
// 				type: WsChannelResposnseTypes.Update,
// 				channel: {
// 					name: WsChannelName.Orderbook,
// 					marketId: 'ZRX-WETH'
// 				},
// 				changes: [
// 					{
// 						price: parsedOrder.price,
// 						amount: parsedOrder.amount
// 					}
// 				]
// 			};
// 			wss.clients.forEach(client => {
// 				if (client.readyState === WebSocket.OPEN) {
// 					client.send(JSON.stringify(orderBookUpdate));
// 					console.log('broadcast new order!');
// 				}
// 			});
// 		}
// 	});
// });

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
