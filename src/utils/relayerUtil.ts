// import * as CST from '../common/constants';
// import {
// 	ILiveOrder,
// 	IOrderBookSnapshotWs,
// 	IOrderBookUpdate,
// 	IStringSignedOrder
// } from '../common/types';
// import orderBookUtil from './orderBookUtil';
// import redisUtil from './redisUtil';
// import Web3Util from './Web3Util';

class RelayerUtil {
	// public orderBookUpdateCache: { [key: string]: IOrderBookUpdate[] } = {};

	// public async init() {
	// 	redisUtil.patternSubscribe(`${CST.ORDERBOOK_UPDATE}|*`);
	// }

	// public handleOrderBookUpdate = (channel: string, orderBookUpdate: IOrderBookUpdate) => {
	// 	const pair = channel.split('|')[1];
	// 	if (pair !== orderBookUpdate.pair) throw new Error('wrong channel update');

	// 	if (
	// 		orderBookUpdate.sequence - orderBookUtil.orderBook[orderBookUpdate.pair].sequence ===
	// 		1
	// 	) {
	// 		const { sequence, price, amount } = orderBookUpdate;
	// 		// apply orderBook directly
	// 		if (amount > 0)
	// 			orderBookUtil.applyChangeOrderBook(pair, sequence, [{ price, amount }], []);
	// 		if (amount < 0)
	// 			orderBookUtil.applyChangeOrderBook(pair, sequence, [], [{ price, amount }]);

	// 		while (
	// 			this.orderBookUpdateCache[pair].length &&
	// 			this.orderBookUpdateCache[pair][0].sequence - orderBookUpdate.sequence === 1
	// 		)
	// 			this.applyCatchedUpdate(pair);
	// 	} else {
	// 		this.orderBookUpdateCache[pair].push(orderBookUpdate);
	// 		this.orderBookUpdateCache[pair] = this.orderBookUpdateCache[pair].sort(
	// 			(a, b) => a.sequence - b.sequence
	// 		);

	// 		if (this.orderBookUpdateCache[pair].length > 5) this.applyCatchedUpdate(pair);
	// 	}
	// };

	// public applyCatchedUpdate(pair: string) {
	// 	const update: IOrderBookUpdate = this.orderBookUpdateCache[pair][0];
	// 	const { sequence, price, amount } = update;
	// 	if (amount > 0) orderBookUtil.applyChangeOrderBook(pair, sequence, [{ price, amount }], []);
	// 	if (amount < 0) orderBookUtil.applyChangeOrderBook(pair, sequence, [], [{ price, amount }]);
	// 	delete this.orderBookUpdateCache[pair][0];
	// }

	// public handleSubscribe(message: any): IOrderBookSnapshotWs {
	// 	console.log('Handle Message: ' + message.type);
	// 	const pair = message.channel.split('|')[1];
	// 	const returnMessage = {
	// 		type: CST.ORDERBOOK_SNAPSHOT,
	// 		sequence: orderBookUtil.orderBook[pair].sequence,
	// 		channel: message.channel,
	// 		bids: orderBookUtil.orderBook[message.channel.pair].bids,
	// 		asks: orderBookUtil.orderBook[message.channel.pair].asks
	// 	};
	// 	console.log('return msg is', returnMessage);
	// 	return returnMessage;
	// }

	// public handleAddOrder(sequence: string, pair: string, signedOrder: IStringSignedOrder): void {
	// 	const side = Web3Util.getSideFromSignedOrder(signedOrder, pair);
	// 	const orderBookUpdate: IOrderBookUpdate = {
	// 		pair: pair,
	// 		price: Web3Util.getPriceFromSignedOrder(signedOrder, side),
	// 		amount: Number(signedOrder.makerAssetAmount.valueOf()),
	// 		sequence: Number(sequence)
	// 	};

	// 	redisUtil.publish(CST.ORDERBOOK_UPDATE + '|' + pair, JSON.stringify(orderBookUpdate));
	// }

	// public handleCancel(sequence: string, liveOrder: ILiveOrder): void {
	// 	const orderBookUpdate: IOrderBookUpdate = {
	// 		pair: liveOrder.pair,
	// 		price: liveOrder.price,
	// 		amount: -liveOrder.amount,
	// 		sequence: Number(sequence)
	// 	};

	// 	redisUtil.publish(
	// 		CST.ORDERBOOK_UPDATE + '|' + liveOrder.pair,
	// 		JSON.stringify(orderBookUpdate)
	// 	);
	// }
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
