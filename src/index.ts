import assetsUtil from './common/assetsUtil';
import orderWatcherUtil from './common/orderWatcherUtil';
import * as CST from './constants';
import util from './util';
import wsServer from './wsServer';

const tool = process.argv[2];

util.logInfo('tool ' + tool);

const option = util.parseOptions(process.argv);

switch (tool) {
	case CST.SET_ALLOWANCE:
		assetsUtil.setTokenAllowance(option);
		break;
	case CST.ORDER_WATCHER:
		orderWatcherUtil.startOrderWatcher(option);
		break;
	case CST.ORDER_PRUNE:
		orderWatcherUtil.pruneOrders(option);
		break;
	case CST.START_RELAYER:
		wsServer.init(tool, option);
		break;
	default:
		break;
}
