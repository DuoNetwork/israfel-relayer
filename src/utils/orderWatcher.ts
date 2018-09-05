import { ZeroEx } from '0x.js';
import { SignedOrder } from '@0xproject/connect';
import { OrderWatcher } from '@0xproject/order-watcher';
import * as Web3 from 'web3';
import * as CST from '../constants';

class OrderWatcherUtil {
	public zeroEx: ZeroEx;
	public provider = new Web3.providers.HttpProvider(CST.PROVIDER_LOCAL);
	public orderWatcher: OrderWatcher;
	public shadowedOrder: SignedOrder[] = [];

	constructor() {
		this.zeroEx = new ZeroEx(this.provider, {
			networkId: CST.NETWORK_ID_LOCAL
		});
		this.orderWatcher = new OrderWatcher(this.provider, CST.NETWORK_ID_LOCAL);
	}

	public addOrdersToWatcher(orderBook: SignedOrder[]): void {
		orderBook.forEach(order => {
			this.orderWatcher.addOrder(order);
		});
	}

	//move invalid orders from orderbook into shadow and remove shadow every 3 min
	public pruneOrderBook(orderBook: SignedOrder[]): void {
		orderBook.forEach(order => {
			try {
				this.zeroEx.exchange.validateOrderFillableOrThrowAsync(order);
			} catch (e) {
				const shadowSize = this.shadowedOrder.push(order);
			}
		});
	}
}

const orderWatcherUtil = new OrderWatcherUtil();
export default orderWatcherUtil;
