import * as CST from './common/constants';
import assetsUtil from './utils/assetsUtil';
import dynamoUtil from './utils/dynamoUtil';
import orderWatcherUtil from './utils/orderWatcherUtil';
import osUtil from './utils/osUtil';
import redisUtil from './utils/redisUtil';
import sequenceUtil from './utils/sequenceUtil';
import util from './utils/util';
import wsServer from './wsServer';

const option = util.parseOptions(process.argv);
const redisConfig = require(`./keys/${option.live ? CST.DB_LIVE : CST.DB_DEV}/redis.json`);
redisUtil.init(redisConfig);

const tool = process.argv[2];

util.logInfo('tool ' + tool);
const config = require('./keys/' + (option.live ? 'live' : 'dev') + '/dynamo.json');
dynamoUtil.init(config, option.live, tool, osUtil.getHostName());

switch (tool) {
	case CST.SET_ALLOWANCE:
		assetsUtil.setTokenAllowance(option);
		break;
	case CST.ORDER_WATCHER:
		orderWatcherUtil.init(tool, option);
		orderWatcherUtil.startOrderWatcher(option);
		break;
	case CST.START_RELAYER:
		wsServer.init();
		wsServer.startServer();
		break;
	case CST.DB_SEQUENCE:
		sequenceUtil.startServer();
		break;
	default:
		break;
}
