import { ZeroEx } from '0x.js';
import { SignedOrder } from '@0xproject/connect';
import { schemas, SchemaValidator, ValidatorResult } from '@0xproject/json-schemas';
import { OrderWatcher } from '@0xproject/order-watcher';
import * as Web3 from 'web3';
import * as CST from '../constants';

class OrderWatcherUtil {
	public zeroEx: ZeroEx;
	public provider = new Web3.providers.HttpProvider(CST.PROVIDER_LOCAL);
	public orderWatcher: OrderWatcher;

	constructor() {
		this.zeroEx = new ZeroEx(this.provider, {
			networkId: CST.NETWORK_ID_LOCAL
		});
		this.orderWatcher = new OrderWatcher(this.provider, CST.NETWORK_ID_LOCAL);
	}

	public validatePayloadOrder(order: SignedOrder): ValidatorResult {
		const { signedOrderSchema } = schemas;
		const validator = new SchemaValidator();
		return validator.validate(order, signedOrderSchema);
	}

	public validateOrderFillable(order: SignedOrder): void {
		return this.orderWatcher.addOrder(order);
	}

	public addOrderToWatcher(order: SignedOrder): {};
}

const orderWatcherUtil = new OrderWatcherUtil();
export default orderWatcherUtil;
