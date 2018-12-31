// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import Web3Wrapper from '../../duo-contract-wrapper/src/Web3Wrapper';
import marketMaker from './client/marketMaker';
import * as CST from './common/constants';
import { IOption } from './common/types';
import orderBookServer from './server/orderBookServer';
import orderWatcherServer from './server/orderWatcherServer';
import relayerServer from './server/relayerServer';
import dynamoUtil from './utils/dynamoUtil';
import orderMatchingUtil from './utils/orderMatchingUtil';
import orderPersistenceUtil from './utils/orderPersistenceUtil';
import osUtil from './utils/osUtil';
import redisUtil from './utils/redisUtil';
import serverMasterUtil from './utils/serverMasterUtil';
import util from './utils/util';

const tool = process.argv[2];
util.logInfo('tool ' + tool);
const option: IOption = util.parseOptions(process.argv);
if (option.debug) util.logLevel = CST.LOG_DEBUG;

const redisConfig = require(`./keys/redis.${option.env}.json`);
redisUtil.init(redisConfig);

const config = require(`./keys/dynamo.${option.env}.json`);
dynamoUtil.init(config, option.env, tool, osUtil.getHostName());

switch (tool) {
	case CST.DB_ORDERS:
		orderPersistenceUtil.startProcessing(option);
		break;
	case CST.DB_RELAYER:
		relayerServer.startServer(config, option);
		break;
	case CST.DB_ORDER_WATCHER:
		orderWatcherServer.startServer(option);
		break;
	case CST.DB_ORDER_BOOKS:
		serverMasterUtil.startLaunching(tool, option, () => orderBookServer.startServer(option));
		break;
	case CST.DB_ORDER_MATCHER:
		orderMatchingUtil.startProcessing(option);
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
					.then(bn => dynamoUtil.updateStatus(CST.DB_NODE, bn))
					.catch(error => util.logInfo(JSON.stringify(error))),
			30000
		);
		break;
	case CST.DB_MKT_MAKER:
		marketMaker.startProcessing(option);
		break;
	default:
		break;
}
