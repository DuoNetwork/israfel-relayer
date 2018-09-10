import { ZeroEx } from '0x.js';
import { FeesRequest, FeesResponse, Order, SignedOrder } from '@0xproject/connect';
import { OrderbookChannelMessageTypes, UpdateOrderbookChannelMessage } from '@0xproject/connect/lib/src/types';
import { BigNumber } from '@0xproject/utils';
import { setInterval } from 'timers';
import * as Web3 from 'web3';
import * as WebSocket from 'websocket';
import * as CST from '../constants';
import relayerUtil from '../utils/relayerUtil';

const mainAsync = async () => {
	const intervalInMs = 5000;
	console.log(`START: sending new orders to relayer every ${intervalInMs / 1000}s`);
	// Provider pointing to local TestRPC on default port 8545
	const provider = new Web3.providers.HttpProvider(CST.PROVIDER_LOCAL);

	// Instantiate 0x.js instance
	const zeroExConfig = {
		networkId: CST.NETWORK_ID_LOCAL // testrpc
	};
	const zeroEx = new ZeroEx(provider, zeroExConfig);
	// Instantiate relayer client pointing to a local server on port 3000
	// const relayerHttpApiUrl = CST.RELAYER_HTTP_URL;
	// const relayerClient = new HttpClient(relayerHttpApiUrl);

	const relayerWSApiUrl = CST.RELAYER_WS_URL;
	const relayerClient = new WebSocket.w3cwebsocket(relayerWSApiUrl);

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
	relayerUtil.setBaseQuoteAllowance(WETH_ADDRESS, ZRX_ADDRESS, addresses);

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
			feeRecipient: ZeroEx.NULL_ADDRESS,
			makerFee: new BigNumber(0),
			takerFee: ZeroEx.toBaseUnitAmount(new BigNumber(10), 18)
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

		//Submit order to relayer WS
		relayerClient.onopen = () => {
			console.log('client_send_orders connected!');
		}
		relayerClient.onmessage = () => {
			console.log('client connected!');
			const msg: UpdateOrderbookChannelMessage = {
				type: OrderbookChannelMessageTypes.Update,
				requestId: Date.now(),
				payload: signedOrder,
			}
			relayerClient.send(msg);
			numberOfOrdersSent++;
		}

		if (numberOfOrdersSent % 3 === 0) exchangeRate++;

		console.log(`SENT ORDER: ${orderHash}`);
	}, intervalInMs);
};

mainAsync().catch(console.error);
