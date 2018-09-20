import {
	assetDataUtils,
	BigNumber,
	ContractWrappers,
	generatePseudoRandomSalt,
	Order,
	orderHashUtils,
	signatureUtils,
	SignerType
} from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import WebSocket from 'ws';
import * as CST from '../constants';
import { providerEngine } from '../providerEngine';
import { WsChannelMessageTypes, WsChannelName } from '../types';
import util from '../util';

const mainAsync = async () => {
	const contractWrappers = new ContractWrappers(providerEngine, {
		networkId: CST.NETWORK_ID_LOCAL
	});
	const web3Wrapper = new Web3Wrapper(providerEngine);

	const [maker, taker] = await web3Wrapper.getAvailableAddressesAsync();

	const exchangeAddress = contractWrappers.exchange.getContractAddress();

	// Get token contract addresses
	const zrxTokenAddress = contractWrappers.exchange.getZRXTokenAddress();
	const etherTokenAddress = contractWrappers.etherToken.getContractAddressIfExists();

	if (etherTokenAddress === undefined) throw console.error('undefined etherTokenAddress');

	const makerAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
	const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);

	// the amount the maker is selling of maker asset
	const makerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(5), 18);
	// the amount the maker wants of taker asset
	const takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.1), 18);

	// Allow the 0x ERC20 Proxy to move ZRX on behalf of makerAccount
	const makerZRXApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
		zrxTokenAddress,
		maker
	);
	await web3Wrapper.awaitTransactionSuccessAsync(makerZRXApprovalTxHash);
	util.log('maker approved');

	// Allow the 0x ERC20 Proxy to move WETH on behalf of takerAccount
	const takerWETHApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
		etherTokenAddress,
		taker
	);
	await web3Wrapper.awaitTransactionSuccessAsync(takerWETHApprovalTxHash);
	util.log('taker approved');

	// Convert ETH into WETH for taker by depositing ETH into the WETH contract
	const takerWETHDepositTxHash = await contractWrappers.etherToken.depositAsync(
		etherTokenAddress,
		takerAssetAmount,
		taker
	);
	await web3Wrapper.awaitTransactionSuccessAsync(takerWETHDepositTxHash);
	util.log('wrapped!');
	// Send signed order to relayer every 5 seconds, increase the exchange rate every 3 orders
	// let numberOfOrdersSent = 0;
	const randomExpiration = util.getRandomFutureDateInSeconds();

	// Create the order
	const order: Order = {
		exchangeAddress,
		makerAddress: maker,
		takerAddress: CST.NULL_ADDRESS,
		senderAddress: CST.NULL_ADDRESS,
		feeRecipientAddress: CST.NULL_ADDRESS,
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

	// Submit order to relayer
	const ws = new WebSocket(CST.RELAYER_WS_URL);
	const addReq = {
		type: WsChannelMessageTypes.Add,
		channel: {
			name: WsChannelName.Orders,
			marketId: 'ZRX-ETH'
		},
		requestId: Date.now(),
		payload: {
			order: signedOrder,
			orderHash: orderHashHex
		}
	};
	// Send cancel order request
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
		ws.send(JSON.stringify(addReq));
		console.log(`SENT ORDER: ${orderHashHex}`);
	});

	ws.on('message', m => {
		console.log(m);
		setTimeout(() => {
			ws.send(JSON.stringify(cancelReq));
			console.log(`check if order is added ${orderHashHex}`);
		}, 10000);
	});

	ws.on('error', (error: Error) => {
		console.log('client got error! %s', error);
	});

	ws.on('close', () => console.log('connection closed!'));
};

mainAsync().catch(console.error);
