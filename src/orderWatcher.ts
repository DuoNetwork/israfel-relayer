import firebaseUtil from './firebaseUtil';
import orderWatcherUtil from './utils/orderWatcherUtil';

const mainAsync = async () => {
	firebaseUtil.init();

	const orders = await firebaseUtil.getOrders();
	setTimeout(() => orderWatcherUtil.pruneOrderBook(orders), 0);
};
mainAsync().catch(console.error);
