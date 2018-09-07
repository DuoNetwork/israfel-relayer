import { ZeroEx } from '0x.js';
import { SignedOrder } from '@0xproject/connect';
import { OrderWatcher } from '@0xproject/order-watcher';
import * as Web3 from 'web3';
import * as CST from '../constants';
import firebaseUtil from '../firebaseUtil';
import { IDuoOrder } from '../types';

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

	public watchOrder(signedOrder: SignedOrder) {
		this.orderWatcher.addOrder(signedOrder);
		this.orderWatcher.subscribe((err, orderState) => {
			if (err) {
				console.log(err);
				return;
			}

			console.log(Date.now().toString(), orderState);
			if (orderState !== undefined) firebaseUtil.updateOrderState(orderState);
		});
	}

	//remove invalid orders in deep blocks from DB
	public pruneOrderBook(orders: IDuoOrder[]) {
		orders.forEach(order => {
			const inValidTime = !order.isValid ? Date.now() - order.updatedAt : 0;
			const signedOrder: SignedOrder = {
				maker: order.maker,
				taker: order.taker,
				makerFee: order.makerFee,
				takerFee: order.takerFee,
				makerTokenAddress: order.makerTokenAddress,
				takerTokenAddress: order.takerTokenAddress,
				makerTokenAmount: order.makerTokenAmount,
				takerTokenAmount: order.takerTokenAmount,
				feeRecipient: order.feeRecipient,
				salt: order.salt,
				exchangeContractAddress: order.exchangeContractAddress,
				expirationUnixTimestampSec: order.expirationUnixTimestampSec,
				ecSignature: order.ecSignature
			};
			if (inValidTime > CST.PENDING_HOURS * 3600000)
				firebaseUtil.deleteOrder(order.orderHash);
			else this.watchOrder(signedOrder);
		});
	}
}

const orderWatcherUtil = new OrderWatcherUtil();
export default orderWatcherUtil;
