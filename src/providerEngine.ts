import { RPCSubprovider, Web3ProviderEngine } from '0x.js';
import { MnemonicWalletSubprovider } from '@0xproject/subproviders';
import * as CST from './common/constants';
// import { BASE_DERIVATION_PATH, MNEMONIC, NETWORK_CONFIGS } from '';

export const mnemonicWallet = new MnemonicWalletSubprovider({
	mnemonic: CST.MNEMONIC,
	baseDerivationPath: CST.BASE_DERIVATION_PATH
});

export const pe = new Web3ProviderEngine();
pe.addProvider(mnemonicWallet);
pe.addProvider(new RPCSubprovider(CST.PROVIDER_LOCAL));
pe.start();

export const providerEngine = pe;
