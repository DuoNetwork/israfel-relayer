import { SignedOrder } from '0x.js';
import orderWatcherUtil from './common/orderWatcherUtil';
import firebaseUtil from './firebaseUtil';

class MatchOrdersUtil {
	public marketId = 'ZRX-WETH';

	public async matchOrder(newOrder: SignedOrder, marketId: string): Promise<void> {
		const signedOrders = orderWatcherUtil.parseToSignedOrder(
			await firebaseUtil.getOrders(marketId)
		);
		console.log(newOrder, signedOrders);

		// signedOrders.forEach(order => {
		// 	if order.
		// })
	}
}
const matchOrdersUtil = new MatchOrdersUtil();
export default matchOrdersUtil;
