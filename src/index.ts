import * as CST from './common/constants';
import orderWatcherServer from './server/orderWatcherServer';
import sequenceServer from './server/sequenceServer';
import assetsUtil from './utils/assetUtil';
import dynamoUtil from './utils/dynamoUtil';
import orderUtil from './utils/orderUtil';
import osUtil from './utils/osUtil';
import redisUtil from './utils/redisUtil';
import util from './utils/util';
import wsServer from './wsServer';

const tool = process.argv[2];
util.logInfo('tool ' + tool);
const option = util.parseOptions(process.argv);
if (option.debug) util.logLevel = CST.LOG_DEBUG;

const redisConfig = require(`./keys/${option.live ? CST.DB_LIVE : CST.DB_DEV}/redis.json`);
redisUtil.init(redisConfig);

const config = require('./keys/' + (option.live ? 'live' : 'dev') + '/dynamo.json');
dynamoUtil.init(config, option.live, tool, osUtil.getHostName());

switch (tool) {
	case CST.SET_ALLOWANCE:
		assetsUtil.setTokenAllowance(option);
		break;
	case CST.DB_ORDER_WATCHER:
		orderWatcherServer.init(tool, option);
		orderWatcherServer.startOrderWatcher(option);
		break;
	case CST.START_RELAYER:
		wsServer.init();
		wsServer.startServer();
		break;
	case CST.DB_SEQUENCE:
		sequenceServer.startServer();
		break;
	case CST.DB_ORDERS:
		orderUtil.startProcessing(option);
		break;
	default:
		break;
}
