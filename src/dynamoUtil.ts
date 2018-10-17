import { SignedOrder } from '0x.js';
import AWS from 'aws-sdk';
import {
	DeleteItemInput,
	PutItemInput,
	QueryInput,
	QueryOutput,
	ScanInput,
	ScanOutput
} from 'aws-sdk/clients/dynamodb';
import * as CST from './constants';
import { IDuoSignedOrder, UserOrderOperation } from './types';
import util from './util';

class DynamoUtil {
	private ddb: undefined | AWS.DynamoDB = undefined;
	// private process: string = 'UNKNOWN';
	private live: boolean = false;
	// private contractUtil: ContractUtil | undefined = undefined;
	public init(
		config: object,
		live: boolean
		//  process: string
	) {
		this.live = live;
		// this.process = process;
		AWS.config.update(config);
		this.ddb = new AWS.DynamoDB({ apiVersion: CST.AWS_DYNAMO_API_VERSION });
		return Promise.resolve();
	}

	public insertData(params: PutItemInput): Promise<void> {
		return new Promise(
			(resolve, reject) =>
				this.ddb
					? this.ddb.putItem(params, err => (err ? reject(err) : resolve()))
					: reject('dynamo db connection is not initialized')
		);
	}

	// public batchInsertData(params: BatchWriteItemInput): Promise<BatchWriteItemOutput> {
	// 	return new Promise(
	// 		(resolve, reject) =>
	// 			this.ddb
	// 				? this.ddb.batchWriteItem(
	// 						params,
	// 						(err, data) => (err ? reject(err) : resolve(data))
	// 				  )
	// 				: reject('dynamo db connection is not initialized')
	// 	);
	// }

	public queryData(params: QueryInput): Promise<QueryOutput> {
		return new Promise(
			(resolve, reject) =>
				this.ddb
					? this.ddb.query(params, (err, data) => (err ? reject(err) : resolve(data)))
					: reject('dynamo db connection is not initialized')
		);
	}

	public scanData(params: ScanInput): Promise<ScanOutput> {
		return new Promise(
			(resolve, reject) =>
				this.ddb
					? this.ddb.scan(params, (err, data) => (err ? reject(err) : resolve(data)))
					: reject('dynamo db connection is not initialized')
		);
	}

	public deleteData(params: DeleteItemInput): Promise<void> {
		return new Promise(
			(resolve, reject) =>
				this.ddb
					? this.ddb.deleteItem(params, err => (err ? reject(err) : resolve()))
					: reject('dynamo db connection is not initialized')
		);
	}

	public convertDuoSignedOrderToDynamo(
		order: IDuoSignedOrder,
		orderHash: string,
		timestamp: number
	) {
		return {
			[CST.DB_ORDER_HASH]: { S: orderHash },
			[CST.DB_PRICE]: {
				N:
					Number(
						util
							.stringToBN(order.makerAssetAmount)
							.div(util.stringToBN(order.takerAssetAmount))
					) + ''
			},
			[CST.DB_FILLED_TAKER_ASSET_AMT]: { S: '0' },
			[CST.DB_REMAINING_MAKER_ASSET_AMT]: { S: order.makerAssetAmount + '' },
			[CST.DB_REMAINING_TAKER_ASSET_AMT]: { S: order.takerAssetAmount + '' },
			[CST.DB_UPDATED_AT]: { N: timestamp + '' }
		};
	}

	public async addLiveOrder(order: IDuoSignedOrder, orderHash: string, marketId: string) {
		const systemTimestamp = util.getUTCNowTimestamp(); // record down the MTS
		const data = this.convertDuoSignedOrderToDynamo(order, orderHash, systemTimestamp);

		const params = {
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_LIVE_ORDERS}.live`
				: `${CST.DB_PROJECT}.${CST.DB_LIVE_ORDERS}.dev`,
			Item: {
				[CST.DB_PAIR]: {
					S: marketId
				},
				...data
			}
		};

		await this.insertData(params);
	}

	public convertSignedOrderToDynamo(order: SignedOrder, timestamp: number) {
		return {
			[CST.DB_SENDER_ADDR]: { S: order.senderAddress + '' },
			[CST.DB_MAKER_ADDR]: { S: order.makerAddress + '' },
			[CST.DB_TAKER_ADDR]: { S: order.takerAddress + '' },
			[CST.DB_MAKER_FEE]: { S: order.makerFee.valueOf() + '' },
			[CST.DB_TAKER_FEE]: { S: order.takerFee.valueOf() + '' },
			[CST.DB_MAKER_ASSET_AMT]: { S: order.makerAssetAmount.valueOf() + '' },
			[CST.DB_TAKER_ASSET_AMT]: { S: order.takerAssetAmount.valueOf() + '' },
			[CST.DB_MAKER_ASSET_DATA]: { S: order.makerAssetData + '' },
			[CST.DB_TAKER_ASSET_DATA]: { S: order.takerAssetData + '' },
			[CST.DB_SALT]: { S: order.salt.valueOf() + '' },
			[CST.DB_EXCHANGE_ADDR]: { S: order.exchangeAddress + '' },
			[CST.DB_FEE_RECIPIENT_ADDR]: { S: order.feeRecipientAddress + '' },
			[CST.DB_EXPIRATION_TIME_SECONDS]: { S: order.expirationTimeSeconds.valueOf() + '' },
			[CST.DB_UPDATED_AT]: { N: timestamp + '' }
		};
	}

	public async addRawOrder(order: SignedOrder, orderHash: string) {
		const systemTimestamp = util.getUTCNowTimestamp(); // record down the MTS
		const data = this.convertSignedOrderToDynamo(order, systemTimestamp);

		const params = {
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_RAW_ORDERS}.live`
				: `${CST.DB_PROJECT}.${CST.DB_RAW_ORDERS}.dev`,
			Item: {
				[CST.DB_PAIR]: {
					S: orderHash
				},
				...data
			}
		};

		await this.insertData(params);
	}

	public async addUserOrders(
		account: string,
		orderHash: string,
		pair: string,
		operation: UserOrderOperation
	) {
		const systemTimestamp = util.getUTCNowTimestamp(); // record down the MTS

		const params = {
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_USER_ORDERS}.live`
				: `${CST.DB_PROJECT}.${CST.DB_USER_ORDERS}.dev`,
			Item: {
				[CST.DB_ACCOUNT]: {
					S: account
				},
				[CST.DB_PAIR_ORDERHASH]: {
					S: `${pair}|${orderHash}`
				},
				[CST.DB_OPERATION]: {
					S: operation
				},
				[CST.DB_UPDATED_AT]: { N: systemTimestamp + '' }
			}
		};

		await this.insertData(params);
	}

	// public insertHeartbeat(data: object = {}): Promise<void> {
	// 	return this.insertData({
	// 		TableName: this.live ? CST.DB_AWS_STATUS_LIVE : CST.DB_AWS_STATUS_DEV,
	// 		Item: {
	// 			[CST.DB_ST_PROCESS]: {
	// 				S: this.process
	// 			},
	// 			[CST.DB_ST_TS]: { N: util.getUTCNowTimestamp() + '' },
	// 			...data
	// 		}
	// 	}).catch(error => util.logInfo('Error insert heartbeat: ' + error));
	// }

	// public insertStatusData(data: object): Promise<void> {
	// 	return this.insertData({
	// 		TableName: this.live ? CST.DB_AWS_STATUS_LIVE : CST.DB_AWS_STATUS_DEV,
	// 		Item: {
	// 			[CST.DB_ST_PROCESS]: {
	// 				S: this.process
	// 			},
	// 			...data
	// 		}
	// 	}).catch(error => util.logInfo('Error insert status: ' + error));
	// }
}

const dynamoUtil = new DynamoUtil();
export default dynamoUtil;
