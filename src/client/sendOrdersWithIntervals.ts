import { ZeroEx } from '0x.js';
import { FeesRequest, FeesResponse, Order, SignedOrder } from '@0xproject/connect';
import { BigNumber } from '@0xproject/utils';
import { setInterval } from 'timers';
import * as Web3 from 'web3';
import WebSocket from 'ws';
import * as CST from '../constants';

const mainAsync = async () => {
	const intervalInMs = 3000;
	console.log(`START: sending new orders to relayer every ${intervalInMs / 1000}s`);
	// Provider pointing to local TestRPC on default port 8545
	const provider = new Web3.providers.HttpProvider(CST.PROVIDER_LOCAL);

	// Instantiate 0x.js instance
	const zeroExConfig = {
		networkId: 50 // testrpc
	};
	const zeroEx = new ZeroEx(provider, zeroExConfig);
	// Instantiate relayer client pointing to a local server on port 3000
	// const relayerHttpApiUrl = CST.RELAYER_HTTP_URL;
	// const relayerClient = new HttpClient(relayerHttpApiUrl);

	// Get exchange contract address
	const EXCHANGE_ADDRESS = await zeroEx.exchange.getContractAddress();

	// Get token information
	const wethTokenInfo = await zeroEx.tokenRegistry.getTokenBySymbolIfExistsAsync('WETH');
	const zrxTokenInfo = await zeroEx.tokenRegistry.getTokenBySymbolIfExistsAsync('ZRX');

	// Check if either getTokenBySymbolIfExistsAsync query resulted in undefined
	if (wethTokenInfo === undefined || zrxTokenInfo === undefined)
		throw new Error('could not find token info');

	// Get token contract addresses
	const WETH_ADDRESS = wethTokenInfo.address;
	const ZRX_ADDRESS = zrxTokenInfo.address;

	// Get all available addresses
	const addresses = await zeroEx.getAvailableAddressesAsync();

	// Get the first address, this address is preloaded with a ZRX balance from the snapshot
	const zrxOwnerAddress = addresses[0];

	// Set WETH and ZRX unlimited allowances for all addresses
	const setZrxAllowanceTxHashes = await Promise.all(
		addresses.map(address => {
			return zeroEx.token.setUnlimitedProxyAllowanceAsync(ZRX_ADDRESS, address);
		})
	);
	const setWethAllowanceTxHashes = await Promise.all(
		addresses.map(address => {
			return zeroEx.token.setUnlimitedProxyAllowanceAsync(WETH_ADDRESS, address);
		})
	);
	await Promise.all(
		setZrxAllowanceTxHashes.concat(setWethAllowanceTxHashes).map(tx => {
			return zeroEx.awaitTransactionMinedAsync(tx);
		})
	);

	// Send signed order to relayer every 5 seconds, increase the exchange rate every 3 orders
	let exchangeRate = 5; // ZRX/WETH
	let numberOfOrdersSent = 0;
	setInterval(async () => {
		const makerTokenAmount = ZeroEx.toBaseUnitAmount(new BigNumber(5), zrxTokenInfo.decimals);
		const takerTokenAmount = makerTokenAmount.div(exchangeRate).floor();

		// Generate fees request for the order
		const ONE_HOUR_IN_MS = 3600000;
		const feesRequest: FeesRequest = {
			exchangeContractAddress: EXCHANGE_ADDRESS,
			maker: zrxOwnerAddress,
			taker: ZeroEx.NULL_ADDRESS,
			makerTokenAddress: ZRX_ADDRESS,
			takerTokenAddress: WETH_ADDRESS,
			makerTokenAmount,
			takerTokenAmount,
			expirationUnixTimestampSec: new BigNumber(Date.now() + ONE_HOUR_IN_MS),
			salt: ZeroEx.generatePseudoRandomSalt()
		};

		// Send fees request to relayer and receive a FeesResponse instance
		// const feesResponse: FeesResponse = await relayerClient.getFeesAsync(feesRequest);
		const feesResponse: FeesResponse = {
			feeRecipient: zeroEx.exchange.getContractAddress(),
			makerFee: new BigNumber(0),
			takerFee: new BigNumber(0)
		};

		// Combine the fees request and response to from a complete order
		const order: Order = {
			...feesRequest,
			...feesResponse
		};

		// Create orderHash
		const orderHash = ZeroEx.getOrderHashHex(order);

		// Sign orderHash and produce a ecSignature
		const ecSignature = await zeroEx.signOrderHashAsync(orderHash, zrxOwnerAddress, false);

		// Append signature to order
		const signedOrder: SignedOrder = {
			...order,
			ecSignature
		};

		// Submit order to relayer
		// await relayerClient.submitOrderAsync(signedOrder);

		const ws = new WebSocket('ws://localhost:8080');
		const msg = {
			type: 'update',
			channel: 'orderbook',
			requestId: Date.now(),
			payload: signedOrder
		};

		ws.on('open', () => {
			console.log('client connected!');
			ws.send(JSON.stringify(msg));
			console.log(`SENT ORDER: ${orderHash}`);
			numberOfOrdersSent++;
			if (numberOfOrdersSent % 3 === 0) exchangeRate++;
		});

		ws.on('message', m => console.log(m));

		ws.on('error', (error: Error) => {
			console.log('client got error! %s', error);
		});

		ws.on('close', () => console.log('connection closed!'));
	}, intervalInMs);
};

mainAsync().catch(console.error);
