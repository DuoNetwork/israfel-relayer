import { ZeroEx } from '0x.js';
import { SignedOrder } from '@0xproject/connect';
import { BigNumber } from '@0xproject/contract-wrappers/node_modules/@0xproject/types/node_modules/bignumber.js/bignumber';
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

	public async addOrder(signedOrder: SignedOrder) {
		console.log('TIME', signedOrder.expirationUnixTimestampSec);
		await this.orderWatcher.addOrder(signedOrder);
		console.log('order added!');
		// this.orderWatcher.subscribe(async (err, orderState) => {
		// 	if (err) {
		// 		console.log(err);
		// 		return;
		// 	}

		// 	console.log(Date.now().toString(), orderState);
		// 	if (orderState !== undefined) await firebaseUtil.updateOrderState(orderState);
		// });
	}

	//remove invalid orders in deep blocks from DB
	public async pruneOrderBook(orders: IDuoOrder[]) {
		for (const order of orders) {
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
				expirationUnixTimestampSec: new BigNumber(
					order.expirationUnixTimestampSec.valueOf()
				),
				ecSignature: order.ecSignature
			};
			if (inValidTime > CST.PENDING_HOURS * 3600000) {
				firebaseUtil.deleteOrder(order.orderHash);
				// await this.orderWatcher.removeOrder(order.orderHash);
			} else {
				// await this.orderWatcher.removeOrder(order.orderHash);
				await this.addOrder(signedOrder);
			}
		}
	}
}

const orderWatcherUtil = new OrderWatcherUtil();
export default orderWatcherUtil;
