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
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
