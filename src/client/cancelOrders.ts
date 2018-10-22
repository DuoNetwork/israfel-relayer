// import { Web3Wrapper } from '@0xproject/web3-wrapper';
import WebSocket from 'ws';
import * as CST from '../constants';
import dynamoUtil from '../dynamoUtil';
// import { providerEngine } from '../providerEngine';
import { WsChannelMessageTypes, WsChannelName } from '../types';

const config = require('../keys/' + 'dev' + '/dynamo.json');
dynamoUtil.init(config, false, 'cancelOrders');

const mainAsync = async () => {
	// const web3Wrapper = new Web3Wrapper(providerEngine);

	// const [maker] = await web3Wrapper.getAvailableAddressesAsync();
	const pair = CST.TOKEN_ZRX + '-' + CST.TOKEN_WETH;
	const orders = await dynamoUtil.getLiveOrders(pair);
	if (orders.length === 0) throw Error('No orders found in DB!');
	console.log('num of fetched orders' + orders.length);

	const orderHashHex = orders[0].orderHash;
	console.log('Order to be cancelled is', orderHashHex);

	// Send cancel order request
	const ws = new WebSocket(CST.RELAYER_WS_URL);
	const cancelReq = {
		type: WsChannelMessageTypes.Cancel,
		channel: {
			name: WsChannelName.Order,
			pair: 'ZRX-WETH'
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
