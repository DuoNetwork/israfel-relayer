// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import { Web3Wrapper } from '@finbook/duo-contract-wrapper';
import { Constants, Util } from '@finbook/israfel-common';
import marketMaker from './client/marketMaker';
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
Util.logInfo(`tool ${tool} using env ${option.env}`);
if (option.debug) Util.logLevel = Constants.LOG_DEBUG;

const redisConfig = require(`./keys/redis.${option.env}.json`);
redisUtil.init(redisConfig);

const config = require(`./keys/dynamo.${option.env}.json`);
dynamoUtil.init(config, option.env, tool, osUtil.getHostName());

switch (tool) {
	case Constants.DB_ORDERS:
		orderPersistanceServer.startServer(option);
		break;
	case Constants.DB_RELAYER:
		relayerServer.startServer(config, option);
		break;
	case Constants.DB_ORDER_WATCHER:
		orderWatcherServer.startServer(option);
		break;
	case Constants.DB_ORDER_BOOKS:
		serverMasterUtil.startLaunching(tool, option, opt => orderBookServer.startServer(opt));
		break;
	case Constants.DB_ORDER_MATCHER:
		orderMatchServer.startServer(option);
		break;
	case Constants.DB_NODE:
		Util.logInfo('starting node heart beat');
		const web3Wrapper = new Web3Wrapper(
			null,
			Constants.PROVIDER_LOCAL,
			'',
			option.env === Constants.DB_LIVE
		);
		setInterval(
			() =>
				web3Wrapper
					.getCurrentBlockNumber()
					.then((bn: number) => dynamoUtil.updateStatus(Constants.DB_NODE, bn))
					.catch((error: Error) => Util.logInfo(JSON.stringify(error))),
			30000
		);
		break;
	case Constants.DB_MKT_MAKER:
		serverMasterUtil.startLaunching(tool, option, opt => marketMaker.startProcessing(opt));
		break;
	// case Constants.DB_HASH_DELETE_ALL:
	// 	orderPersistenceUtil.hashDeleteAll(option);
	// 	break;
	default:
		break;
}
