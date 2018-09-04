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

	public setUnlimitedProxyAllowance(tokenAddr: string, addrs: string[]): string[] {
		return addrs.map(address =>
			this.zeroEx.token.setUnlimitedProxyAllowanceAsync(tokenAddr, address)
		);
	}
	// const setZrxAllowanceTxHashes = await Promise.all(
	// 	addresses.map(address => {
	// 		return relayerUtil.setAllowanceTxHashes(ZRX_ADDRESS, address);
	// 	})
	// );
	// const setWethAllowanceTxHashes = await Promise.all(
	// 	addresses.map(address => {
	// 		return relayerUtil.setAllowanceTxHashes(WETH_ADDRESS, address);
	// 	})
	// );
	// await Promise.all(
	// 	setZrxAllowanceTxHashes.concat(setWethAllowanceTxHashes).map(tx => {
	// 		return zeroEx.awaitTransactionMinedAsync(tx);
	// 	})
	// );
}
const relayerUtil = new RelayerUtil();
export default relayerUtil;
