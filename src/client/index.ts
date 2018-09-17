import { assetDataUtils, ContractWrappers, RPCSubprovider, Web3ProviderEngine } from '0x.js';
import WebSocket from 'ws';
import * as CST from '../constants';
import { WsChannel, WsChannelMessageTypes } from '../types';

// import { CustomOrderbookChannelHandler } from './customOrderbookChannelHandler';

const mainAsync = async () => {
	const provider = new RPCSubprovider(CST.PROVIDER_LOCAL);
	const providerEngine = new Web3ProviderEngine();

	providerEngine.addProvider(provider);
	providerEngine.start();
	const zeroEx = new ContractWrappers(providerEngine, { networkId: CST.NETWORK_ID_LOCAL });

	// Get token contract addresses
	const zrxTokenAddress = zeroEx.exchange.getZRXTokenAddress();
	const etherTokenAddress = zeroEx.etherToken.getContractAddressIfExists();

	if (etherTokenAddress === undefined) throw console.error('undefined etherTokenAddress');

	const makerAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
	const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);

	// Generate OrderbookChannelSubscriptionOpts for watching the ZRX/WETH orderbook
	const zrxWethSubscriptionOpts = {
		makerAssetData: makerAssetData,
		takerAssetData: takerAssetData,
		networkId: 42
	};
	console.log(zrxWethSubscriptionOpts);

	// Subscribe to the relayer
	const ws = new WebSocket(CST.RELAYER_WS_URL);
	const msg = {
		type: WsChannelMessageTypes.Subscribe,
		channel: WsChannel.Orderbook,
		requestId: Date.now(),
		payload: zrxWethSubscriptionOpts
	};
	ws.on('open', () => {
		console.log('Listening for ZRX/WETH orderbook...');
		ws.send(JSON.stringify(msg));
	});
	ws.on('message', m => console.log(m));

	ws.on('error', (error: Error) => {
		console.log('client got error! %s', error);
	});

	ws.on('close', () => console.log('connection closed!'));
};

mainAsync().catch(console.error);
