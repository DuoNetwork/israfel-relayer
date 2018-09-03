import { ZeroEx } from '0x.js';
import {
	OrderbookChannel,
	OrderbookChannelHandler,
	OrderbookChannelSubscriptionOpts,
	OrderbookResponse,
	SignedOrder
} from '@0xproject/connect';

export class CustomOrderbookChannelHandler implements OrderbookChannelHandler {
	private privateZeroEx: ZeroEx;
	constructor(zeroEx: ZeroEx) {
		this.privateZeroEx = zeroEx;
	}
	// tslint:disable-next-line:prefer-function-over-method
	public onSnapshot(
		channel: OrderbookChannel,
		subscriptionOpts: OrderbookChannelSubscriptionOpts,
		snapshot: OrderbookResponse
	) {
		// Log number of bids and asks currently in the orderbook
		const numberOfBids = snapshot.bids.length;
		const numberOfAsks = snapshot.asks.length;
		console.log(
			`SNAPSHOT: ${numberOfBids} bids & ${numberOfAsks} asks at channel ${channel} with subscription options ${subscriptionOpts}`
		);
	}
	public async onUpdate(
		channel: OrderbookChannel,
		subscriptionOpts: OrderbookChannelSubscriptionOpts,
		order: SignedOrder
	) {
		// Log order hash
		const orderHash = ZeroEx.getOrderHashHex(order);
		console.log(`NEW ORDER: ${orderHash} at channel ${channel}`);

		// Look for asks
		if (order.makerTokenAddress === subscriptionOpts.baseTokenAddress) {
			// Calculate the rate of the new order
			const zrxWethRate = order.makerTokenAmount.div(order.takerTokenAmount);
			// If the rate is equal to our better than the rate we are looking for, try and fill it
			const TARGET_RATE = 6; // ZRX/WETH
			if (zrxWethRate.greaterThanOrEqualTo(TARGET_RATE)) {
				const addresses = await this.privateZeroEx.getAvailableAddressesAsync();
				// This can be any available address of you're choosing, in this example addresses[0] is actually
				// creating and signing the new orders we're receiving so we need to fill the order with
				// a different address
				const takerAddress = addresses[1];
				const txHash = await this.privateZeroEx.exchange.fillOrderAsync(
					order,
					order.takerTokenAmount,
					true,
					takerAddress
				);
				await this.privateZeroEx.awaitTransactionMinedAsync(txHash);
				console.log(`ORDER FILLED: ${orderHash}`);
			}
		}
	}
	// tslint:disable-next-line:prefer-function-over-method
	public onError(
		channel: OrderbookChannel,
		subscriptionOpts: OrderbookChannelSubscriptionOpts,
		err: Error
	) {
		// Log error
		console.log(`ERROR: ${err} at channel ${channel} with options ${subscriptionOpts}`);
	}
	// tslint:disable-next-line:prefer-function-over-method
	public onClose(channel: OrderbookChannel) {
		// Log close
		console.log(`CLOSE at channel ${channel}`);
	}
}
