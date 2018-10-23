import assetsUtil from './common/assetsUtil';
import orderWatcherUtil from './common/orderWatcherUtil';
import * as CST from './constants';
import dynamoUtil from './dynamoUtil';
import redisUtil from './redisUtil';
import util from './util';
import wsServer from './wsServer';

const option = util.parseOptions(process.argv);
const redisConfig = require(`./keys/${option.live ? CST.DB_LIVE : CST.DB_DEV}/redis.json`);
redisUtil.init(redisConfig);

const tool = process.argv[2];

util.logInfo('tool ' + tool);

const config = require('./keys/' + (option.live ? 'live' : 'dev') + '/dynamo.json');
dynamoUtil.init(config, option.live, tool);

switch (tool) {
	case CST.SET_ALLOWANCE:
		assetsUtil.setTokenAllowance(option);
		break;
	case CST.ORDER_WATCHER:
		orderWatcherUtil.init(tool, option);
		orderWatcherUtil.startOrderWatcher(option);
		break;
	// case CST.ORDER_PRUNE:
	// 	orderWatcherUtil.init(tool, option);
	// 	orderWatcherUtil.pruneOrders(option);
	// 	break;
	case CST.START_RELAYER:
		wsServer.init();
		wsServer.startServer();
		break;
	default:
		break;
}
