import { SignedOrder } from '0x.js';
import AWS from 'aws-sdk';
import {
	AttributeMap,
	DeleteItemInput,
	PutItemInput,
	QueryInput,
	QueryOutput,
	ScanInput,
	ScanOutput,
	UpdateItemInput
} from 'aws-sdk/clients/dynamodb';
import * as CST from './constants';
import { IDuoSignedOrder, ILiveOrders, UserOrderOperation } from './types';
import util from './util';

class DynamoUtil {
	private ddb: undefined | AWS.DynamoDB = undefined;
	// private process: string = 'UNKNOWN';
	private live: boolean = false;
	private hostname: string = 'hostname';
	private tool: string = 'tool';
	// private contractUtil: ContractUtil | undefined = undefined;
	public init(
		config: object,
		live: boolean,
		tool: string
		//  process: string
	) {
		this.live = live;
		// this.process = process;
		this.tool = tool;
		AWS.config.update(config);
		this.ddb = new AWS.DynamoDB({ apiVersion: CST.AWS_DYNAMO_API_VERSION });
		return Promise.resolve();
	}

	public  insertData(params: PutItemInput): Promise<void> {
		return new Promise(
			(resolve, reject) =>
				this.ddb
					? this.ddb.putItem(params, err => (err ? reject(err) : resolve()))
					: reject('dynamo db connection is not initialized')
		);
	}

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

	public updateItem(params: UpdateItemInput): Promise<void> {
		return new Promise(
			(resolve, reject) =>
				this.ddb
					? this.ddb.updateItem(params, err => (err ? reject(err) : resolve()))
					: reject('dynamo db connection is not initialized')
		);
	}

	public convertDuoSignedOrderToDynamo(
		order: SignedOrder,
		orderHash: string,
		timestamp: number,
		side: string
	) {
		return {
			[CST.DB_ORDER_HASH]: { S: orderHash },
			[CST.DB_PRICE]: {
				N: order.makerAssetAmount.div(order.takerAssetAmount).valueOf() + ''
			},
			[CST.DB_FILLED_TAKER_ASSET_AMT]: { S: '0' },
			[CST.DB_REMAINING_MAKER_ASSET_AMT]: { S: order.makerAssetAmount.valueOf() + '' },
			[CST.DB_REMAINING_TAKER_ASSET_AMT]: { S: order.takerAssetAmount.valueOf() + '' },
			[CST.DB_SIDE]: { S: side },
			[CST.DB_UPDATED_AT]: { N: timestamp + '' }
		};
	}

	public async addLiveOrder(
		order: SignedOrder,
		orderHash: string,
		marketId: string,
		side: string
	) {
		const systemTimestamp = util.getUTCNowTimestamp(); // record down the MTS

		const data = this.convertDuoSignedOrderToDynamo(order, orderHash, systemTimestamp, side);

		const params = {
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_LIVE_ORDERS}.${CST.DB_LIVE}`
				: `${CST.DB_PROJECT}.${CST.DB_LIVE_ORDERS}.${CST.DB_DEV}`,
			Item: {
				[CST.DB_PAIR]: {
					S: marketId
				},
				...data
			}
		};

		await this.insertData(params);
	}

	public async removeLiveOrder(pair: string, orderHash: string): Promise<void> {
		return this.deleteData({
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_LIVE_ORDERS}.${CST.DB_LIVE}`
				: `${CST.DB_PROJECT}.${CST.DB_LIVE_ORDERS}.${CST.DB_DEV}`,
			Key: {
				[CST.DB_PAIR]: {
					S: pair
				},
				[CST.DB_ORDER_HASH]: {
					S: orderHash
				}
			}
		});
	}

	public async deleteOrderSignature(orderHash: string): Promise<void> {
		return this.updateItem({
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_RAW_ORDERS}.${CST.DB_LIVE}`
				: `${CST.DB_PROJECT}.${CST.DB_RAW_ORDERS}.${CST.DB_DEV}`,
			Key: {
				[CST.DB_ORDER_HASH]: {
					S: orderHash
				}
			},
			ExpressionAttributeNames: {
				[CST.DB_SIGNATURE]: CST.DB_SIGNATURE
			},
			ExpressionAttributeValues: {
				[':' + CST.DB_SIGNATURE]: { S: '' }
			},
			UpdateExpression: `SET ${CST.DB_SIGNATURE} = ${':' + CST.DB_SIGNATURE}`
		});
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
			[CST.DB_SIGNATURE]: { S: order.signature + '' },
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

	public async addUserOrder(
		account: string,
		orderHash: string,
		pair: string,
		operation: UserOrderOperation
	) {
		const systemTimestamp = util.getUTCNowTimestamp(); // record down the MTS

		const params = {
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_USER_ORDERS}.${CST.DB_LIVE}`
				: `${CST.DB_PROJECT}.${CST.DB_USER_ORDERS}.${CST.DB_DEV}`,
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

	public parseLiveOrders(data: AttributeMap): ILiveOrders {
		return {
			[CST.DB_PRICE]: Number(data[CST.DB_PRICE].S || '0'),
			[CST.DB_SIDE]: data[CST.DB_SIDE].S || '',
			[CST.DB_AMT]: Number(data[CST.DB_MAKER_ASSET_AMT].S || '0')
		};
	}

	public async getLiveOrders(pair: string): Promise<ILiveOrders[]> {
		const params: QueryInput = {
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_LIVE_ORDERS}.live`
				: `${CST.DB_PROJECT}.${CST.DB_LIVE_ORDERS}.dev`,
			KeyConditionExpression: `${CST.DB_PAIR} = :${CST.DB_PAIR}`,
			ExpressionAttributeValues: {
				[':' + CST.DB_PAIR]: { S: pair }
			}
		};

		const data = await this.queryData(params);
		if (!data.Items || !data.Items.length) return [];

		const parsedLiveOrders = data.Items.map(ob => this.parseLiveOrders(ob)).sort(
			(a, b) => b.price - a.price
		);

		return parsedLiveOrders;
	}

	public updateStatus(process: string) {
		const update: AttributeMap = {
			[CST.DB_STS_PROCESS]: {
				S: `${this.tool}|${process}|${this.hostname}`
			},
			[CST.DB_STS_HOSTNAME]: {
				S: this.hostname
			},
			[CST.DB_UPDATED_AT]: { N: util.getUTCNowTimestamp() + '' }
		};

		return this.insertData({
			TableName: `${CST.DB_PROJECT}.${CST.DB_STATUS}.${this.live ? CST.DB_LIVE : CST.DB_DEV}`,
			Item: update
		}).catch(error => {
			util.logError('Error insert status: ' + error);
			return false;
		});
	}
}

const dynamoUtil = new DynamoUtil();
export default dynamoUtil;
