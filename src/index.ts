// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';
import duoDynamoUtil from '../../duo-admin/src/utils/dynamoUtil';
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
import Web3Util from './utils/Web3Util';

const tool = process.argv[2];
util.logInfo('tool ' + tool);
const option: IOption = util.parseOptions(process.argv);
if (option.debug) util.logLevel = CST.LOG_DEBUG;

const redisConfig = require(`./keys/redis.${option.live ? CST.DB_LIVE : CST.DB_DEV}.json`);
redisUtil.init(redisConfig);

const config = require(`./keys/dynamo.${option.live ? CST.DB_LIVE : CST.DB_DEV}.json`);
dynamoUtil.init(config, option.live, tool, osUtil.getHostName());

const start = async () => {
	let web3Util: Web3Util | null = null;
	if (tool === CST.DB_ORDER_BOOKS) {
		const privateKeyFile = require(`./keys/privateKey.${
			option.live ? CST.DB_LIVE : CST.DB_DEV
		}.json`);
		web3Util = new Web3Util(null, option.live, privateKeyFile.key, false);
	} else if (tool !== CST.DB_ORDERS)
		web3Util = new Web3Util(null, option.live, '', tool === CST.DB_ORDER_WATCHER);
	if (web3Util) web3Util.setTokens(await dynamoUtil.scanTokens());
	if (tool === CST.DB_RELAYER)
		duoDynamoUtil.init(config, option.live, tool, Web3Util.fromWei, async txHash => {
			const txReceipt = web3Util ? await web3Util.getTransactionReceipt(txHash) : null;
			if (!txReceipt) return null;
			return {
				status: txReceipt.status as string
			};
		});
	switch (tool) {
		case CST.DB_ORDER_WATCHER:
			serverMasterUtil.startLaunching(web3Util as Web3Util, tool, option, () =>
				orderWatcherServer.startServer(web3Util as Web3Util, option)
			);
			break;
		case CST.DB_RELAYER:
			relayerServer.startServer(web3Util as Web3Util, option);
			break;
		case CST.DB_ORDERS:
			orderPersistenceUtil.startProcessing(option);
			break;
		case CST.DB_ORDER_BOOKS:
			serverMasterUtil.startLaunching(web3Util as Web3Util, tool, option, () =>
				orderBookServer.startServer(web3Util as Web3Util, option)
			);
			break;
		default:
			break;
	}
};

start();
