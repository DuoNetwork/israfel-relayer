import { ContractWrappers, OrderState, SignedOrder } from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOrderBookSnapshotWs,
	IOrderBookUpdate,
	WsChannelResposnseTypes
} from '../common/types';
import { providerEngine } from '../providerEngine';
import orderBookUtil from './orderBookUtil';
import orderUtil from './orderUtil';
import redisUtil from './redisUtil';
import util from './util';

class RelayerUtil {
	public contractWrappers: ContractWrappers;
	public web3Wrapper: Web3Wrapper;
	public orderBookUpdateCache: { [key: string]: IOrderBookUpdate[] } = {};
	public now: number;
	// public returnOrders: IUpdatePayloadWs[] = [];

	constructor() {
		this.web3Wrapper = new Web3Wrapper(providerEngine);
		this.contractWrappers = new ContractWrappers(providerEngine, {
			networkId: CST.NETWORK_ID_LOCAL
		});
		this.now = Date.now();
	}

	public async init() {
		orderBookUtil.calculateOrderBookSnapshot();
		// this.orderBook = orderBookUtil.orderBook;
		redisUtil.patternSubscribe(`${CST.ORDERBOOK_UPDATE}|*`);

		redisUtil.onOrderBooks((channel, orderBookUpdate) =>
			this.handleOrderBookUpdate(channel, orderBookUpdate)
		);
	}

	public handleOrderBookUpdate = (channel: string, orderBookUpdate: IOrderBookUpdate) => {
		const pair = channel.split('|')[1];
		if (pair !== orderBookUpdate.pair) throw new Error('wrong channel update');

		if (orderBookUpdate.id - orderBookUtil.orderBook[orderBookUpdate.pair].id === 1) {
			const { id, price, amount } = orderBookUpdate;
			// apply orderBook directly
			if (amount > 0) orderBookUtil.applyChangeOrderBook(pair, id, [{ price, amount }], []);
			if (amount < 0) orderBookUtil.applyChangeOrderBook(pair, id, [], [{ price, amount }]);

			while (
				this.orderBookUpdateCache[pair].length &&
				this.orderBookUpdateCache[pair][0].id - orderBookUpdate.id === 1
			)
				this.applyCatchedUpdate(pair);
		} else {
			this.orderBookUpdateCache[pair].push(orderBookUpdate);
			this.orderBookUpdateCache[pair] = this.orderBookUpdateCache[pair].sort(
				(a, b) => a.id - b.id
			);

			if (this.orderBookUpdateCache[pair].length > 5) this.applyCatchedUpdate(pair);
		}
	};

	public applyCatchedUpdate(pair: string) {
		const update: IOrderBookUpdate = this.orderBookUpdateCache[pair][0];
		const { id, price, amount } = update;
		if (amount > 0) orderBookUtil.applyChangeOrderBook(pair, id, [{ price, amount }], []);
		if (amount < 0) orderBookUtil.applyChangeOrderBook(pair, id, [], [{ price, amount }]);
		delete this.orderBookUpdateCache[pair][0];
	}

	public handleSubscribe(message: any): IOrderBookSnapshotWs {
		console.log('Handle Message: ' + message.type);
		const returnMessage = {
			type: WsChannelResposnseTypes.Snapshot,
			id: orderBookUtil.orderBook[message.channel.pair].id,
			channel: { name: message.channel.name, pair: message.channel.pair },
			requestId: message.requestId,
			bids: orderBookUtil.orderBook[message.channel.pair].bids,
			asks: orderBookUtil.orderBook[message.channel.pair].asks
		};
		console.log('return msg is', returnMessage);
		return returnMessage;
	}

	public handleAddOrder(
		id: string,
		pair: string,
		orderHash: string,
		signedOrder: SignedOrder
	): void {
		const side = orderUtil.determineSide(signedOrder, pair);
		// matchOrdersUtil.matchOrder(signedOrder, pair, side);
		redisUtil.push(
			CST.DB_ADD_ORDER_QUEUE,
			JSON.stringify({
				id,
				signedOrder,
				orderHash,
				pair,
				side
			})
		);

		const orderBookUpdate: IOrderBookUpdate = {
			pair: pair,
			price: util.round(
				signedOrder.makerAssetAmount.div(signedOrder.takerAssetAmount).valueOf()
			),
			amount: Number(signedOrder.makerAssetAmount.valueOf()),
			id: Number(id)
		};

		redisUtil.publish(CST.ORDERBOOK_UPDATE + '|' + pair, JSON.stringify(orderBookUpdate));
	}

	public handleCancel(id: string, liveOrder: ILiveOrder): void {
		redisUtil.push(
			CST.DB_CANCEL_ORDER_QUEUE,
			JSON.stringify({
				id,
				liveOrder
			})
		);

		const orderBookUpdate: IOrderBookUpdate = {
			pair: liveOrder.pair,
			price: liveOrder.price,
			amount: -liveOrder.amount,
			id: Number(id)
		};

		redisUtil.publish(
			CST.ORDERBOOK_UPDATE + '|' + liveOrder.pair,
			JSON.stringify(orderBookUpdate)
		);
	}

	public handleUpdateOrder(id: string, pair: string, orderState: OrderState) {
		// TODO

	}
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
