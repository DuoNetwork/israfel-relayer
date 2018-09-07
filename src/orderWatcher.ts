import firebaseUtil from './firebaseUtil';
import orderWatcherUtil from './utils/orderWatcherUtil';

const mainAsync = async () => {
	const orders = firebaseUtil.getOrders();
	setTimeout(orderWatcherUtil.pruneOrderBook, 0, orders);
};
mainAsync().catch(console.error);
