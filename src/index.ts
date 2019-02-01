// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import { Web3Wrapper } from '@finbook/duo-contract-wrapper';
import marketMaker from './client/marketMaker';
import * as CST from './common/constants';
import { IOption } from './common/types';
import orderBookServer from './server/orderBookServer';
import orderMatchServer from './server/orderMatchingServer';
import orderPersistanceServer from './server/orderPersistanceServer';
import orderWatcherServer from './server/orderWatcherServer';
import relayerServer from './server/relayerServer';
import dynamoUtil from './utils/dynamoUtil';
import osUtil from './utils/osUtil';
import redisUtil from './utils/redisUtil';
import serverMasterUtil from './utils/serverMasterUtil';
import util from './utils/util';

const tool = process.argv[2];
const option: IOption = util.parseOptions(process.argv);
util.logInfo(`tool ${tool} using env ${option.env}`);
if (option.debug) util.logLevel = CST.LOG_DEBUG;

const redisConfig = require(`./keys/redis.${option.env}.json`);
redisUtil.init(redisConfig);

const config = require(`./keys/dynamo.${option.env}.json`);
dynamoUtil.init(config, option.env, tool, osUtil.getHostName());

switch (tool) {
	case CST.DB_ORDERS:
		orderPersistanceServer.startServer(option);
		break;
	case CST.DB_RELAYER:
		relayerServer.startServer(config, option);
		break;
	case CST.DB_ORDER_WATCHER:
		orderWatcherServer.startServer(option);
		break;
	case CST.DB_ORDER_BOOKS:
		serverMasterUtil.startLaunching(tool, option, opt => orderBookServer.startServer(opt));
		break;
	case CST.DB_ORDER_MATCHER:
		orderMatchServer.startServer(option);
		break;
	case CST.DB_NODE:
		util.logInfo('starting node heart beat');
		const web3Wrapper = new Web3Wrapper(
			null,
			'local',
			CST.PROVIDER_LOCAL,
			option.env === CST.DB_LIVE
		);
		setInterval(
			() =>
				web3Wrapper
					.getCurrentBlockNumber()
					.then((bn: number) => dynamoUtil.updateStatus(CST.DB_NODE, bn))
					.catch((error: Error) => util.logInfo(JSON.stringify(error))),
			30000
		);
		break;
	case CST.DB_MKT_MAKER:
		serverMasterUtil.startLaunching(tool, option, opt => marketMaker.startProcessing(opt));
		break;
	// case CST.DB_HASH_DELETE_ALL:
	// 	orderPersistenceUtil.hashDeleteAll(option);
	// 	break;
	default:
		break;
}
