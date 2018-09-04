import { ZeroEx } from '0x.js';
import * as Web3 from 'web3';
import * as CST from '../constants';

class RelayerUtil {
	public zeroEx: ZeroEx;
	public provider = new Web3.providers.HttpProvider(CST.PROVIDER_LOCAL);

	constructor() {
		this.zeroEx = new ZeroEx(this.provider, {
			networkId: CST.NETWORK_ID_LOCAL
		});
	}

	public async setAllowanceTxHashes(tokenAddr: string, ownerAddr: string): Promise<string> {
		return await this.zeroEx.token.setUnlimitedProxyAllowanceAsync(tokenAddr, ownerAddr);
	}

	public setAllUnlimitedAllowance(tokenAddr: string, addrs: string[]): Array<Promise<string>> {
		return addrs.map(address =>
			this.zeroEx.token.setUnlimitedProxyAllowanceAsync(tokenAddr, address)
		);
	}

	public async setBaseQuoteAllowance(baseToken: string, quoteToken: string, addrs: string[]): Promise<void> {
		const responses =  await Promise.all(this.setAllUnlimitedAllowance(quoteToken, addrs).concat(this.setAllUnlimitedAllowance(baseToken, addrs)));
		await Promise.all(responses.map(tx => {
			return this.zeroEx.awaitTransactionMinedAsync(tx);
		}))
	}
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
