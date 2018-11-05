import * as CST from './common/constants';
import { IOption } from './common/types';
import orderWatcherServer from './server/orderWatcherServer';
import relayerServer from './server/relayerServer';
import sequenceServer from './server/sequenceServer';
import dynamoUtil from './utils/dynamoUtil';
import orderPersistenceUtil from './utils/orderPersistenceUtil';
import osUtil from './utils/osUtil';
import redisUtil from './utils/redisUtil';
import util from './utils/util';
import Web3Util from './utils/Web3Util';

const tool = process.argv[2];
util.logInfo('tool ' + tool);
const option: IOption = util.parseOptions(process.argv);
if (option.debug) util.logLevel = CST.LOG_DEBUG;

const redisConfig = require(`./keys/redis.${option.live ? CST.DB_LIVE : CST.DB_DEV}.json`);
redisUtil.init(redisConfig);

const config = require(`./keys/dynamo.${option.live ? CST.DB_LIVE : CST.DB_DEV}.json`);
dynamoUtil.init(config, option.live, tool, osUtil.getHostName());

let web3Util: Web3Util | null = null;
if ([CST.DB_ORDER_WATCHER, CST.DB_RELAYER].includes(tool))
	web3Util = new Web3Util(null, option.live, '');

switch (tool) {
	case CST.DB_ORDER_WATCHER:
		orderWatcherServer.startOrderWatcher(web3Util as Web3Util, option);
		break;
	case CST.DB_RELAYER:
		relayerServer.startServer(web3Util as Web3Util, option);
		break;
	case CST.DB_SEQUENCE:
		sequenceServer.startServer(option);
		break;
	case CST.DB_ORDERS:
		orderPersistenceUtil.startProcessing(option);
		break;
	default:
		break;
}
