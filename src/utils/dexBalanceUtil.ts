import { Constants, Web3Util } from '@finbook/israfel-common';
import fs from 'fs';
import moment from 'moment';
import { IOption } from '../common/types';

class DexBalanceUtil {
	public async fetchDexBalance(option: IOption) {
		const accounts = JSON.parse(fs.readFileSync('./src/static/dexAccounts.json', 'utf8'));
		const web3Util = new Web3Util(
			null,
			option.env === 'live'
				? Constants.PROVIDER_INFURA_MAIN
				: Constants.PROVIDER_INFURA_KOVAN,
			'',
			option.env === Constants.DB_LIVE
		);

		accounts.date = moment.utc().format('YYYY-MM-DD HH:mm:SS');
		for (const relayerAccount in accounts.relayer) {
			console.log(relayerAccount);
			accounts.relayer[relayerAccount].eth = await web3Util.getEthBalance(relayerAccount);
			accounts.relayer[relayerAccount].weth = await web3Util.getTokenBalance(
				Constants.TOKEN_WETH,
				relayerAccount
			);
		}

		for (const vvdAccount in accounts.vvd) {
			accounts.vvd[vvdAccount].eth = await web3Util.getEthBalance(vvdAccount);
			accounts.vvd[vvdAccount].weth = await web3Util.getTokenBalance(
				Constants.TOKEN_WETH,
				vvdAccount
			);
		}

		fs.writeFileSync('./src/static/dexAccounts.json', JSON.stringify(accounts), 'utf8');
		console.log('completed fetching balance snapshot');
	}
}

const dexBalanceUtil = new DexBalanceUtil();
export default dexBalanceUtil;
