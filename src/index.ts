// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import * as CST from './common/constants';
import { IOption } from './common/types';
import orderBookServer from './server/orderBookServer';
import orderWatcherServer from './server/orderWatcherServer';
import relayerServer from './server/relayerServer';
import serverMasterUtil from './server/serverMasterUtil';
import dynamoUtil from './utils/dynamoUtil';
import orderPersistenceUtil from './utils/orderPersistenceUtil';
import osUtil from './utils/osUtil';
import redisUtil from './utils/redisUtil';
import util from './utils/util';

const tool = process.argv[2];
util.logInfo('tool ' + tool);
const option: IOption = util.parseOptions(process.argv);
if (option.debug) util.logLevel = CST.LOG_DEBUG;

const redisConfig = require(`./keys/redis.${option.live ? CST.DB_LIVE : CST.DB_DEV}.json`);
redisUtil.init(redisConfig);

const config = require(`./keys/dynamo.${option.live ? CST.DB_LIVE : CST.DB_DEV}.json`);
dynamoUtil.init(config, option.live, tool, osUtil.getHostName());

switch (tool) {
	case CST.DB_ORDERS:
		orderPersistenceUtil.startProcessing(option);
		break;
	case CST.DB_RELAYER:
		relayerServer.startServer(config, option);
		break;
	case CST.DB_ORDER_WATCHER:
		serverMasterUtil.startLaunching(tool, option, () => orderWatcherServer.startServer(option));
		break;
	case CST.DB_ORDER_BOOKS:
		serverMasterUtil.startLaunching(tool, option, () => orderBookServer.startServer(option));
		break;
	default:
		break;
}
