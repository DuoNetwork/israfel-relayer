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
// import Web3 from 'web3';
import WebSocket from 'ws';
import * as CST from '../common/constants';
// import {IWsAddOrderRequest} from '../common/types';
import assetsUtil from '../utils/assetUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

// const web3: Web3 = new Web3(new Web3.providers.HttpProvider(CST.PROVIDER_LOCAL));
const web3Util = new Web3Util(null, false, '');

const mainAsync = async () => {
	await assetsUtil.init(web3Util);
	const taker = assetsUtil.taker;
	console.log(taker);
	const exchangeAddress = web3Util.contractWrappers.exchange.getContractAddress();
	const zrxTokenAddress = web3Util.getTokenAddressFromName(CST.TOKEN_ZRX);
	const etherTokenAddress = web3Util.getTokenAddressFromName(CST.TOKEN_WETH);

	console.log(etherTokenAddress);

	if (etherTokenAddress === undefined) throw console.error('undefined etherTokenAddress');

	const zrxAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
	const wethAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);

	const balance = await web3Util.web3Wrapper.getBalanceInWeiAsync(taker);
	console.log('taker %s, balance %s', taker, balance.valueOf());

	// Allow the 0x ERC20 Proxy to move WETH on behalf of takerAccount
	const takerWETHApprovalTxHash = await web3Util.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
		etherTokenAddress,
		taker
	);
	await web3Util.web3Wrapper.awaitTransactionSuccessAsync(takerWETHApprovalTxHash);
	util.logInfo('taker WETH approved');

	// Convert ETH into WETH for taker by depositing ETH into the WETH contract
	// console.log(assetsUtil.web3Wrapper. balance);
	// console.log(web3.fromWei(balance.valueOf(), 'ether'));
	const takerWETHDepositTxHash = await web3Util.contractWrappers.etherToken.depositAsync(
		etherTokenAddress,
		Web3Wrapper.toBaseUnitAmount(new BigNumber(CST.TAKER_ETH_DEPOSIT), 18),
		taker
	);
	await web3Util.web3Wrapper.awaitTransactionSuccessAsync(takerWETHDepositTxHash);
	await assetsUtil.approveAllMakers(zrxTokenAddress);

	let isBid = true;

	const randomExpiration = Web3Util.getRandomFutureDateInSeconds();
	const maker = assetsUtil.getRandomMaker();
	// const zrxAssetAmount = Web3Wrapper.toBaseUnitAmount(
	// 	new BigNumber(Number(Math.random() * 10 || 5).toFixed(3)),
	// 	18
	// );
	// const wethAssetAmount = Web3Wrapper.toBaseUnitAmount(
	// 	new BigNumber(Number(Math.random() || 5).toFixed(3)),
	// 	18
	// );

	// Create the order
	// const order: Order = {
	// 	exchangeAddress,
	// 	makerAddress: maker,
	// 	takerAddress: taker,
	// 	senderAddress: maker,
	// 	feeRecipientAddress: taker,
	// 	expirationTimeSeconds: randomExpiration,
	// 	salt: generatePseudoRandomSalt(),
	// 	makerAssetAmount: isBid ? wethAssetAmount : zrxAssetAmount,
	// 	takerAssetAmount: isBid ? zrxAssetAmount : wethAssetAmount,
	// 	makerAssetData: isBid ? wethAssetData : zrxAssetData,
	// 	takerAssetData: isBid ? zrxAssetData : wethAssetData,
	// 	makerFee: new BigNumber(0),
	// 	takerFee: new BigNumber(0)
	// };
	const order: Order = {
		exchangeAddress,
		makerAddress: maker,
		takerAddress: taker,
		senderAddress: maker,
		feeRecipientAddress: taker,
		expirationTimeSeconds: randomExpiration,
		salt: generatePseudoRandomSalt(),
		makerAssetAmount: Web3Wrapper.toBaseUnitAmount(new BigNumber(0.858), 18),
		takerAssetAmount: Web3Wrapper.toBaseUnitAmount(new BigNumber(0.868), 18),
		makerAssetData: wethAssetData,
		takerAssetData: zrxAssetData,
		makerFee: new BigNumber(0),
		takerFee: new BigNumber(0)
	};

	const orderHashHex = orderHashUtils.getOrderHashHex(order);
	const signature = await signatureUtils.ecSignOrderHashAsync(
		web3Util.web3Wrapper.getProvider(),
		orderHashHex,
		maker,
		SignerType.Default
	);
	const signedOrder = { ...order, signature };
	isBid = !isBid;

	// Submit order to relayer
	const ws = new WebSocket('ws://13.251.115.119:8000');
	const pair = 'ZRX-WETH';
	const msg: any = {
		method: 'add',
		channel: CST.DB_ORDERS,
		pair: pair,
		orderHash: orderHashHex,
		order: signedOrder
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
};

mainAsync().catch(console.error);
