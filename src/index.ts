import assetsUtil from './assetsUtil';
import * as CST from './constants';
import util from './util';
import orderWatcherUtil from './utils/orderWatcherUtil';

const tool = process.argv[2];

util.log('tool ' + tool);

const option = util.parseOptions(process.argv);

switch (tool) {
	case CST.MODIFY_STATE:
		assetsUtil.setTokenAllowance(option);
		break;
	case CST.ORDER_WATCHER:
		orderWatcherUtil.startOrderWatcher(option);
		break;
	case CST.ORDER_PRUNE:
		orderWatcherUtil.pruneOrders(option);
		break;

	default:
		break;
}
