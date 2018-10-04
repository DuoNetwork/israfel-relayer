import assetsUtil from './common/assetsUtil';
import orderWatcherUtil from './common/orderWatcherUtil';
import * as CST from './constants';
import util from './util';

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
