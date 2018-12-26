// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import Web3Wrapper from '../../duo-contract-wrapper/src/Web3Wrapper';
import Web3Util from '../../israfel-relayer/src/utils/Web3Util';
import { ContractUtil } from './client/contractUtil';
import { MarketMaker } from './client/maketMaker';
import { OrderMakerUtil } from './client/orderMakerUtil';
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
const web3Wrapper = new Web3Wrapper(null, 'local', CST.PROVIDER_LOCAL, option.env === CST.DB_LIVE);

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
		const mnemonic = require('./keys/mnemomicBot.json');
		const web3Util = new Web3Util(null, option.env === 'live', mnemonic.mnemomic, false);

		const contractUtil = new ContractUtil(web3Util, web3Wrapper, option);
		const orderMakerUtil: OrderMakerUtil = new OrderMakerUtil(web3Util, contractUtil);
		const marketMaker = new MarketMaker(option, web3Util, orderMakerUtil);

		marketMaker.startProcessing(contractUtil, option);
		break;
	default:
		break;
}
