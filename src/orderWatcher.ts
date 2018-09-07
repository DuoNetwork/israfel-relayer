import * as CST from './constants';
import firebaseUtil from './firebaseUtil';
import orderWatcherUtil from './utils/orderWatcherUtil';

const mainAsync = async () => {
	const orders = firebaseUtil.getOrders();
	setTimeout(orderWatcherUtil.pruneOrderBook, CST.PRUNE_INTERVAL, orders);
};
mainAsync().catch(console.error);
