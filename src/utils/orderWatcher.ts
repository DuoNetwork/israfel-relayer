import { ZeroEx } from '0x.js';
import { OrderWatcher } from '@0xproject/order-watcher';
import { SignedOrder } from '@0xproject/connect';
import { schemas, SchemaValidator, ValidatorResult } from '@0xproject/json-schemas';
import * as Web3 from 'web3';
import * as CST from '../constants';

class OrderWatcherUtil {
	public zeroEx: ZeroEx;
	public provider = new Web3.providers.HttpProvider(CST.PROVIDER_LOCAL);

	constructor() {
		this.zeroEx = new ZeroEx(this.provider, {
			networkId: CST.NETWORK_ID_LOCAL
		});
	}

	public validatePayloadOrder(order: SignedOrder): ValidatorResult {
		const { signedOrderSchema } = schemas;
		const validator = new SchemaValidator();
		return validator.validate(order, signedOrderSchema);
	}
}

const orderWatcherUtil = new OrderWatcherUtil();
export default orderWatcherUtil;
