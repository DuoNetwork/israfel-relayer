import firebaseUtil from './firebaseUtil';
import orderWatcherUtil from './utils/orderWatcherUtil';

const mainAsync = async () => {
	firebaseUtil.init();
	orderWatcherUtil.subscribeOrderWatcher();
	const orders = await firebaseUtil.getOrders();
	console.log(orders.length);
	setTimeout(() => orderWatcherUtil.pruneOrders(orders), 0);
	orderWatcherUtil.unsubOrderWatcher();
};
mainAsync().catch(console.error);
