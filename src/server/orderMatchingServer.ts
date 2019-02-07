import { Constants, Util, Web3Util } from '../../../israfel-common/src';
import { IOption } from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import orderMatchingUtil from '../utils/orderMatchingUtil';
import redisUtil from '../utils/redisUtil';

class OrderMatchServer {
	public availableAddrs: string[] = [];
	public currentAddrIdx: number = 0;

	public getCurrentAddress() {
		const currentAddr = this.availableAddrs[this.currentAddrIdx];
		this.currentAddrIdx = (this.currentAddrIdx + 1) % this.availableAddrs.length;
		return currentAddr;
	}

	public async startServer(option: IOption) {
		let mnemonic = { mnemomic: '' };
		try {
			mnemonic = require('../keys/mnemomic.json');
		} catch (err) {
			Util.logError(JSON.stringify(err));
		}

		const web3Util = new Web3Util(
			null,
			option.env === Constants.DB_LIVE,
			mnemonic.mnemomic,
			false
		);
		this.availableAddrs = await web3Util.getAvailableAddresses();
		web3Util.setTokens(await dynamoUtil.scanTokens());

		if (option.server) {
			dynamoUtil.updateStatus(
				Constants.DB_ORDER_MATCHER,
				await redisUtil.getQueueLength(orderMatchingUtil.getMatchQueueKey())
			);

			global.setInterval(
				async () =>
					dynamoUtil.updateStatus(
						Constants.DB_ORDER_MATCHER,
						await redisUtil.getQueueLength(orderMatchingUtil.getMatchQueueKey())
					),
				15000
			);
		}

		const loop = async () =>
			orderMatchingUtil.processMatchQueue(web3Util, this.getCurrentAddress()).then(result => {
				global.setTimeout(() => loop(), result ? 0 : 500);
			});
		await loop();
	}
}

const orderMatchServer = new OrderMatchServer();
export default orderMatchServer;
