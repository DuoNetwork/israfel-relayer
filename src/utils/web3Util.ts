import { BigNumber, ContractWrappers, orderHashUtils, signatureUtils, SignedOrder } from '0x.js';
import { schemas, SchemaValidator } from '@0xproject/json-schemas';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import Web3 from 'web3';
import * as CST from '../common/constants';
import infura from '../keys/infura.json';
import util from './util';

export const getRandomFutureDateInSeconds = () => {
	return new BigNumber(Date.now() + CST.TEN_MINUTES_MS).div(CST.ONE_SECOND_MS).ceil();
};

export const stringToBN = (value: string): BigNumber => {
	return new BigNumber(value);
};

export default class Web3Util {
	public contractWrappers: ContractWrappers;
	public web3Wrapper: Web3Wrapper;

	constructor() {
		const provider = new Web3.providers.HttpProvider(
			CST.PROVIDER_INFURA_KOVAN + '/' + infura.token
		);
		this.web3Wrapper = new Web3Wrapper(provider);
		this.contractWrappers = new ContractWrappers(provider, {
			networkId: CST.NETWORK_ID_KOVAN
		});
	}

	public async validateOrder(signedOrder: SignedOrder): Promise<string> {
		const { orderSchema } = schemas;
		const { signature, ...order } = signedOrder;
		const validator = new SchemaValidator();
		if (!validator.validate(order, orderSchema).valid) {
			util.logDebug('invalid schema ' + JSON.stringify(signedOrder));
			return '';
		}

		const orderHash = orderHashUtils.getOrderHashHex(order);
		const isValidSig = await signatureUtils.isValidSignatureAsync(
			this.web3Wrapper.getProvider(),
			orderHash,
			signature,
			order.makerAddress
		);
		if (!isValidSig) {
			util.logDebug('invalid signature ' + orderHash);
			return '';
		}

		return orderHash;
	}
}
