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
// import Web3 from 'web3';
import WebSocket from 'ws';
import assetsUtil from '../common/assetsUtil';
import * as CST from '../constants';
import { providerEngine } from '../providerEngine';
import { WsChannelMessageTypes, WsChannelName } from '../types';
import util from '../util';

// const web3: Web3 = new Web3(new Web3.providers.HttpProvider(CST.PROVIDER_LOCAL));

const mainAsync = async () => {
	await assetsUtil.init();
	const taker = assetsUtil.taker;
	const exchangeAddress = assetsUtil.contractWrappers.exchange.getContractAddress();
	const zrxTokenAddress = assetsUtil.getTokenAddressFromName(CST.TOKEN_ZRX);
	const etherTokenAddress = assetsUtil.getTokenAddressFromName(CST.TOKEN_WETH);

	if (etherTokenAddress === undefined) throw console.error('undefined etherTokenAddress');

	const zrxAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
	const wethAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);

	const balance = await assetsUtil.web3Wrapper.getBalanceInWeiAsync(taker);
	console.log('taker %s, balance %s', taker, balance.valueOf());

	// Allow the 0x ERC20 Proxy to move WETH on behalf of takerAccount
	const takerWETHApprovalTxHash = await assetsUtil.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
		etherTokenAddress,
		taker
	);
	await assetsUtil.web3Wrapper.awaitTransactionSuccessAsync(takerWETHApprovalTxHash);
	util.logInfo('taker WETH approved');

	// Convert ETH into WETH for taker by depositing ETH into the WETH contract
	// console.log(assetsUtil.web3Wrapper. balance);
	// console.log(web3.fromWei(balance.valueOf(), 'ether'));
	const takerWETHDepositTxHash = await assetsUtil.contractWrappers.etherToken.depositAsync(
		etherTokenAddress,
		Web3Wrapper.toBaseUnitAmount(new BigNumber(CST.TAKER_ETH_DEPOSIT), 18),
		taker
	);
	await assetsUtil.web3Wrapper.awaitTransactionSuccessAsync(takerWETHDepositTxHash);
	await assetsUtil.approveAllMakers(zrxTokenAddress);

	// Send signed order to relayer every 5 seconds
	let isBid = true;
	setInterval(async () => {
		const randomExpiration = util.getRandomFutureDateInSeconds();
		const maker = assetsUtil.getRandomMaker();
		// the amount the maker is selling of maker asset
		const zrxAssetAmount = Web3Wrapper.toBaseUnitAmount(
			new BigNumber(Number(Math.random() * 10 || 5).toFixed(3)),
			18
		);
		// the amount the maker wants of taker asset
		const wethAssetAmount = Web3Wrapper.toBaseUnitAmount(
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
			makerAssetAmount: isBid ? wethAssetAmount : zrxAssetAmount,
			takerAssetAmount: isBid ? zrxAssetAmount : wethAssetAmount,
			makerAssetData: isBid ? wethAssetData : zrxAssetData,
			takerAssetData: isBid ? zrxAssetData : wethAssetData,
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
		isBid = !isBid;

		// Submit order to relayer
		const ws = new WebSocket(CST.RELAYER_WS_URL);
		const msg = {
			type: WsChannelMessageTypes.Add,
			channel: {
				name: WsChannelName.Order,
				marketId: 'ZRX-WETH'
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
