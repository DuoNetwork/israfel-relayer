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
import { setInterval } from 'timers';
import WebSocket from 'ws';
import * as CST from '../constants';
import { providerEngine } from '../providerEngine';
import { WsChannelMessageTypes, WsChannelName } from '../types';
import util from '../util';

const getRandomMaker = (makers: string[]): string => {
	const index = Math.floor(Math.random() * Math.floor(makers.length));
	return makers[index];
};
const TAKER_ETH_DEPOSIT = 10;

const mainAsync = async () => {
	const contractWrappers = new ContractWrappers(providerEngine, {
		networkId: CST.NETWORK_ID_LOCAL
	});
	const web3Wrapper = new Web3Wrapper(providerEngine);
	const [taker, ...makers] = await web3Wrapper.getAvailableAddressesAsync();

	const approveAllMakers = async (tokenAddress: string) => {
		// Allow the 0x ERC20 Proxy to move erc20 token on behalf of makerAccount
		for (const maker of makers) {
			const makerZRXApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
				tokenAddress,
				maker
			);
			await web3Wrapper.awaitTransactionSuccessAsync(makerZRXApprovalTxHash);
		}
	};

	const exchangeAddress = contractWrappers.exchange.getContractAddress();

	// Get token contract addresses
	const zrxTokenAddress = contractWrappers.exchange.getZRXTokenAddress();
	const etherTokenAddress = contractWrappers.etherToken.getContractAddressIfExists();

	if (etherTokenAddress === undefined) throw console.error('undefined etherTokenAddress');

	const makerAssetData = assetDataUtils.encodeERC20AssetData(zrxTokenAddress);
	const takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);

	// Allow the 0x ERC20 Proxy to move WETH on behalf of takerAccount
	const takerWETHApprovalTxHash = await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
		etherTokenAddress,
		taker
	);
	await web3Wrapper.awaitTransactionSuccessAsync(takerWETHApprovalTxHash);
	util.log('taker WETH approved');

	// Convert ETH into WETH for taker by depositing ETH into the WETH contract
	const takerWETHDepositTxHash = await contractWrappers.etherToken.depositAsync(
		etherTokenAddress,
		Web3Wrapper.toBaseUnitAmount(new BigNumber(TAKER_ETH_DEPOSIT), 18),
		taker
	);
	await web3Wrapper.awaitTransactionSuccessAsync(takerWETHDepositTxHash);
	util.log('taker ETH wrapped!');

	await approveAllMakers(zrxTokenAddress);
	util.log('all maker approved');

	// Send signed order to relayer every 5 seconds, increase the exchange rate every 3 orders
	// let numberOfOrdersSent = 0;
	setInterval(async () => {
		const randomExpiration = util.getRandomFutureDateInSeconds();
		const maker = getRandomMaker(makers);
		// the amount the maker is selling of maker asset
		const makerAssetAmount = Web3Wrapper.toBaseUnitAmount(
			new BigNumber(Number(Math.random().toFixed(3)) * 10 || 1),
			18
		);
		// the amount the maker wants of taker asset
		const takerAssetAmount = Web3Wrapper.toBaseUnitAmount(
			new BigNumber(Number(Math.random().toFixed(3)) || 1),
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
