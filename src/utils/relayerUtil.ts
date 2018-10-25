import { ContractWrappers, OrderState, OrderStateValid, SignedOrder } from '0x.js';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import * as CST from '../common/constants';
import {
	ILiveOrder,
	IOrderBookSnapshotWs,
	IOrderBookUpdate,
	WsChannelResposnseTypes
} from '../common/types';
import { providerEngine } from '../providerEngine';
import assetUtil from './assetUtil';
import dynamoUtil from './dynamoUtil';
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

		if (
			orderBookUpdate.sequence - orderBookUtil.orderBook[orderBookUpdate.pair].sequence ===
			1
		) {
			const { sequence, price, amount } = orderBookUpdate;
			// apply orderBook directly
			if (amount > 0)
				orderBookUtil.applyChangeOrderBook(pair, sequence, [{ price, amount }], []);
			if (amount < 0)
				orderBookUtil.applyChangeOrderBook(pair, sequence, [], [{ price, amount }]);

			while (
				this.orderBookUpdateCache[pair].length &&
				this.orderBookUpdateCache[pair][0].sequence - orderBookUpdate.sequence === 1
			)
				this.applyCatchedUpdate(pair);
		} else {
			this.orderBookUpdateCache[pair].push(orderBookUpdate);
			this.orderBookUpdateCache[pair] = this.orderBookUpdateCache[pair].sort(
				(a, b) => a.sequence - b.sequence
			);

			if (this.orderBookUpdateCache[pair].length > 5) this.applyCatchedUpdate(pair);
		}
	};

	public applyCatchedUpdate(pair: string) {
		const update: IOrderBookUpdate = this.orderBookUpdateCache[pair][0];
		const { sequence, price, amount } = update;
		if (amount > 0) orderBookUtil.applyChangeOrderBook(pair, sequence, [{ price, amount }], []);
		if (amount < 0) orderBookUtil.applyChangeOrderBook(pair, sequence, [], [{ price, amount }]);
		delete this.orderBookUpdateCache[pair][0];
	}

	public handleSubscribe(message: any): IOrderBookSnapshotWs {
		console.log('Handle Message: ' + message.type);
		const returnMessage = {
			type: WsChannelResposnseTypes.Snapshot,
			sequence: orderBookUtil.orderBook[message.channel.pair].sequence,
			channel: { name: message.channel.name, pair: message.channel.pair },
			requestId: message.requestId,
			bids: orderBookUtil.orderBook[message.channel.pair].bids,
			asks: orderBookUtil.orderBook[message.channel.pair].asks
		};
		console.log('return msg is', returnMessage);
		return returnMessage;
	}

	public handleAddOrder(
		sequence: string,
		pair: string,
		orderHash: string,
		signedOrder: SignedOrder
	): void {
		const side = assetUtil.getSideFromSignedOrder(signedOrder, pair);
		// matchOrdersUtil.matchOrder(signedOrder, pair, side);
		redisUtil.push(
			`${CST.DB_ORDERS}|${CST.DB_ADD}`,
			JSON.stringify({
				sequence,
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
			sequence: Number(sequence)
		};

		redisUtil.publish(CST.ORDERBOOK_UPDATE + '|' + pair, JSON.stringify(orderBookUpdate));
	}

	public handleCancel(sequence: string, liveOrder: ILiveOrder): void {
		redisUtil.push(
			`${CST.DB_ORDERS}|${CST.DB_CANCEL}`,
			JSON.stringify({
				sequence,
				liveOrder
			})
		);

		const orderBookUpdate: IOrderBookUpdate = {
			pair: liveOrder.pair,
			price: liveOrder.price,
			amount: -liveOrder.amount,
			sequence: Number(sequence)
		};

		redisUtil.publish(
			CST.ORDERBOOK_UPDATE + '|' + liveOrder.pair,
			JSON.stringify(orderBookUpdate)
		);
	}

	public async handleUpdateOrder(sequence: string, pair: string, orderState: OrderState) {
		// TODO
		const { orderHash, isValid } = orderState;

		const liveOrders: ILiveOrder[] = await dynamoUtil.getLiveOrders(pair, orderHash);
		if (liveOrders.length === 0) throw new Error('invalid orderHash');

		const orderBookUpdate: IOrderBookUpdate = {
			pair: pair,
			price: liveOrders[0].price,
			amount: -liveOrders[0].amount,
			sequence: Number(sequence)
		};

		if (isValid)
			orderBookUpdate.amount =
				Number(
					(orderState as OrderStateValid).orderRelevantState.remainingFillableMakerAssetAmount.valueOf()
				) - liveOrders[0].amount;

		redisUtil.push(
			`${CST.DB_ORDERS}|${CST.DB_UPDATE}`,
			JSON.stringify({
				pair,
				sequence,
				orderHash,
				newAmount: !isValid
					? 0
					: Number(
							(orderState as OrderStateValid).orderRelevantState.remainingFillableMakerAssetAmount.valueOf()
					)
			})
		);
		redisUtil.publish(CST.ORDERBOOK_UPDATE + '|' + pair, JSON.stringify(orderBookUpdate));
	}
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
