import { Web3Wrapper } from '@0xproject/web3-wrapper';
import WebSocket from 'ws';
import * as CST from '../constants';
import firebaseUtil from '../firebaseUtil';
import { providerEngine } from '../providerEngine';
import { WsChannelMessageTypes, WsChannelName } from '../types';

firebaseUtil.init();

const mainAsync = async () => {
	const web3Wrapper = new Web3Wrapper(providerEngine);

	const [maker] = await web3Wrapper.getAvailableAddressesAsync();
	const orders = await firebaseUtil.getOrders();
	if (!orders) throw Error('No orders in DB!');

	const ordersByMaker = orders.filter(order => order.makerAddress === maker);
	//sort orders by descending timestamp
	ordersByMaker.sort((a, b) => b.updatedAt - a.updatedAt);
	const orderHashHex = ordersByMaker[0].orderHash;
	console.log('Order to be cancelled is', orderHashHex);

	// Send cancel order request
	const ws = new WebSocket(CST.RELAYER_WS_URL);
	const cancelReq = {
		type: WsChannelMessageTypes.Cancel,
		channel: {
			name: WsChannelName.Orders,
			marketId: 'ZRX-ETH'
		},
		requestId: Date.now(),
		payload: {
			orderHash: orderHashHex
		}
	};

	ws.on('open', () => {
		console.log('client connected!');
		ws.send(JSON.stringify(cancelReq));
		console.log(`send CANCEL request for ${orderHashHex}`);
	});

	ws.on('message', m => {
		console.log(m);
	});

	ws.on('error', (error: Error) => {
		console.log('client got error! %s', error);
	});

	ws.on('close', () => console.log('connection closed!'));
};

mainAsync().catch(console.error);
