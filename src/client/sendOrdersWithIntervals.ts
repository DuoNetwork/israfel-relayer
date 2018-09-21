import {
	assetDataUtils,
	BigNumber,
	generatePseudoRandomSalt,
	Order,
	orderHashUtils,
	signatureUtils,
	SignerType
} from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import { setInterval } from 'timers';
import WebSocket from 'ws';
import assetsUtil from '../assetsUtil';
import * as CST from '../constants';
import { providerEngine } from '../providerEngine';
import { WsChannelMessageTypes, WsChannelName } from '../types';
import util from '../util';

const TAKER_ETH_DEPOSIT = 1;

const mainAsync = async () => {
	await assetsUtil.init();
	const taker = assetsUtil.taker;
	const exchangeAddress = assetsUtil.contractWrappers.exchange.getContractAddress();
	const zrxTokenAddress = assetsUtil.getTokenAddressFromName(CST.TOKEN_ZRX);
	const etherTokenAddress = assetsUtil.getTokenAddressFromName(CST.TOKEN_WETH);

	if (etherTokenAddress === undefined) throw console.error('undefined etherTokenAddress');

	const makerAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
	const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);

	// Allow the 0x ERC20 Proxy to move WETH on behalf of takerAccount
	const takerWETHApprovalTxHash = await assetsUtil.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
		etherTokenAddress,
		taker
	);
	await assetsUtil.web3Wrapper.awaitTransactionSuccessAsync(takerWETHApprovalTxHash);
	util.log('taker WETH approved');

	// Convert ETH into WETH for taker by depositing ETH into the WETH contract
	const takerWETHDepositTxHash = await assetsUtil.contractWrappers.etherToken.depositAsync(
		etherTokenAddress,
		Web3Wrapper.toBaseUnitAmount(new BigNumber(TAKER_ETH_DEPOSIT), 18),
		taker
	);
	await assetsUtil.web3Wrapper.awaitTransactionSuccessAsync(takerWETHDepositTxHash);
	await assetsUtil.approveAllMakers(zrxTokenAddress);

	// Send signed order to relayer every 5 seconds
	setInterval(async () => {
		const randomExpiration = util.getRandomFutureDateInSeconds();
		const maker = assetsUtil.getRandomMaker();
		// the amount the maker is selling of maker asset
		const makerAssetAmount = Web3Wrapper.toBaseUnitAmount(
			new BigNumber(Number(Math.random() * 10 || 5).toFixed(3)),
			18
		);
		// the amount the maker wants of taker asset
		const takerAssetAmount = Web3Wrapper.toBaseUnitAmount(
			new BigNumber(Number(Math.random() || 5).toFixed(3)),
			18
		);

		// Create the order
		const order: Order = {
			exchangeAddress,
			makerAddress: maker,
			takerAddress: taker,
			senderAddress: maker,
			feeRecipientAddress: taker,
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
		const msg = {
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
		// console.log(msg);

		ws.on('open', () => {
			console.log('client connected!');
			ws.send(JSON.stringify(msg));
			console.log(`SENT ORDER: ${orderHashHex}`);
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
