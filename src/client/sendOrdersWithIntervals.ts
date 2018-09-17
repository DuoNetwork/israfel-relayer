import {
	assetDataUtils,
	BigNumber,
	ContractWrappers,
	generatePseudoRandomSalt,
	Order,
	orderHashUtils,
	RPCSubprovider,
	signatureUtils,
	SignerType,
	Web3ProviderEngine
} from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import { setInterval } from 'timers';
import WebSocket from 'ws';
import * as CST from '../constants';
import { WsChannelMessageTypes } from '../types';

const mainAsync = async () => {
	const provider = new RPCSubprovider(CST.PROVIDER_LOCAL);
	const providerEngine = new Web3ProviderEngine();
	const web3Wrapper = new Web3Wrapper(providerEngine);

	providerEngine.addProvider(provider);
	providerEngine.start();
	const zeroEx = new ContractWrappers(providerEngine, { networkId: CST.NETWORK_ID_LOCAL });

	const [maker, taker] = await web3Wrapper.getAvailableAddressesAsync();

	const exchangeAddress = zeroEx.exchange.getContractAddress();

	// Get token contract addresses
	const zrxTokenAddress = zeroEx.exchange.getZRXTokenAddress();
	const etherTokenAddress = zeroEx.etherToken.getContractAddressIfExists();

	if (etherTokenAddress === undefined) throw console.error('undefined etherTokenAddress');

	const makerAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
	const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);

	// the amount the maker is selling of maker asset
	const makerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(5), 18);
	// the amount the maker wants of taker asset
	const takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.1), 18);

	// Allow the 0x ERC20 Proxy to move ZRX on behalf of makerAccount
	const makerZRXApprovalTxHash = await zeroEx.erc20Token.setUnlimitedProxyAllowanceAsync(
		zrxTokenAddress,
		maker
	);
	await web3Wrapper.awaitTransactionSuccessAsync(makerZRXApprovalTxHash);

	// Allow the 0x ERC20 Proxy to move WETH on behalf of takerAccount
	const takerWETHApprovalTxHash = await zeroEx.erc20Token.setUnlimitedProxyAllowanceAsync(
		etherTokenAddress,
		taker
	);
	await web3Wrapper.awaitTransactionSuccessAsync(takerWETHApprovalTxHash);

	// Convert ETH into WETH for taker by depositing ETH into the WETH contract
	const takerWETHDepositTxHash = await zeroEx.etherToken.depositAsync(
		etherTokenAddress,
		takerAssetAmount,
		taker
	);
	await web3Wrapper.awaitTransactionSuccessAsync(takerWETHDepositTxHash);
	// Send signed order to relayer every 5 seconds, increase the exchange rate every 3 orders
	// let numberOfOrdersSent = 0;
	setInterval(async () => {
		const randomExpiration = new BigNumber(Date.now() + 10000).div(1000).ceil();

		// Create the order
		const order: Order = {
			exchangeAddress,
			makerAddress: maker,
			takerAddress: '0x0000000000000000000000000000000000000000',
			senderAddress: '0x0000000000000000000000000000000000000000',
			feeRecipientAddress: '0x0000000000000000000000000000000000000000',
			expirationTimeSeconds: randomExpiration,
			salt: generatePseudoRandomSalt(),
			makerAssetAmount,
			takerAssetAmount,
			makerAssetData,
			takerAssetData,
			makerFee: new BigNumber(0),
			takerFee: new BigNumber(0)
		};

		const orderHashHex = orderHashUtils.getOrderHashHex(order);
		const signature = await signatureUtils.ecSignOrderHashAsync(
			providerEngine,
			orderHashHex,
			maker,
			SignerType.Default
		);
		const signedOrder = { ...order, signature };
		const orderHash = orderHashUtils.getOrderHashHex(signedOrder);

		// Submit order to relayer
		const ws = new WebSocket(CST.RELAYER_WS_URL);
		const msg = {
			type: WsChannelMessageTypes.Update,
			channel: CST.WS_CHANNEL_ORDERBOOK,
			requestId: Date.now(),
			payload: signedOrder
		};

		ws.on('open', () => {
			console.log('client connected!');
			ws.send(JSON.stringify(msg));
			console.log(`SENT ORDER: ${orderHash}`);
			// numberOfOrdersSent++;
		});

		ws.on('message', m => console.log(m));

		ws.on('error', (error: Error) => {
			console.log('client got error! %s', error);
		});

		ws.on('close', () => console.log('connection closed!'));
	}, 5000);
};

mainAsync().catch(console.error);
