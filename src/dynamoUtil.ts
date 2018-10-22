import { OrderStateInvalid, OrderStateValid, SignedOrder } from '0x.js';
import DynamoDB, {
	AttributeMap,
	DeleteItemInput,
	PutItemInput,
	QueryInput,
	QueryOutput,
	ScanInput,
	ScanOutput,
	UpdateItemInput
} from 'aws-sdk/clients/dynamodb';
import AWS from 'aws-sdk/global';
import * as CST from './constants';
import { ILiveOrders, UserOrderOperation } from './types';
import util from './util';

class DynamoUtil {
	private ddb: undefined | DynamoDB = undefined;
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
		this.ddb = new DynamoDB({ apiVersion: CST.AWS_DYNAMO_API_VERSION });
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
				N: util.round(order.makerAssetAmount.div(order.takerAssetAmount).valueOf()) + ''
			},
			[CST.DB_FILLED_TAKER_ASSET_AMT]: { S: '0' },
			[CST.DB_REMAINING_MAKER_ASSET_AMT]: { S: order.makerAssetAmount.valueOf() + '' },
			[CST.DB_REMAINING_TAKER_ASSET_AMT]: { S: order.takerAssetAmount.valueOf() + '' },
			[CST.DB_SIDE]: { S: side },
			[CST.DB_ORDER_IS_VALID]: { BOOL: true },
			[CST.DB_UPDATED_AT]: { N: timestamp + '' }
		};
	}

	public async addLiveOrder(
		order: SignedOrder,
		orderHash: string,
		marketId: string,
		side: string
	) {
		if (!marketId || !orderHash) throw new Error('invalid order');
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

	public async getCurrentId(pair: string) {

		const params: QueryInput = {
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_IDENTITY}.${CST.DB_LIVE}`
				: `${CST.DB_PROJECT}.${CST.DB_IDENTITY}.${CST.DB_DEV}`,
			KeyConditionExpression: `${CST.DB_PAIR} = :${CST.DB_PAIR}`,
			ExpressionAttributeValues: {
				[':' + CST.DB_PAIR]: { S: pair }
			}
		};

		const data = await this.queryData(params);
		if (!data.Items || !data.Items.length) throw console.error('wrong number of id!');
		// const id = this.parseRawOrders();

		return data.Items[0].id.N || '0';

	}

	public async conditionalPutIdentity(pair: string, oldId: string, newId: string) {
		const params = {
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_IDENTITY}.${CST.DB_LIVE}`
				: `${CST.DB_PROJECT}.${CST.DB_IDENTITY}.${CST.DB_DEV}`,
			Item: {
				[CST.DB_ID]: {
					N: newId
				},
				[CST.DB_PAIR]: {
					S: pair
				}
			},
			Expected: {
				[CST.DB_ID]: {
					AttributeValueList: [
						{
							N: oldId
						}
					],
					ComparisonOperator: 'EQ'
				}
			}
		};

		await this.insertData(params);

	}

	// public async getSequenceId() {

	// }

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
		if (!orderHash) throw new Error('no orderHash provided');
		const systemTimestamp = util.getUTCNowTimestamp(); // record down the MTS
		const data = this.convertSignedOrderToDynamo(order, systemTimestamp);

		const params = {
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_RAW_ORDERS}.${CST.DB_LIVE}`
				: `${CST.DB_PROJECT}.${CST.DB_RAW_ORDERS}.${CST.DB_DEV}`,
			Item: {
				[CST.DB_ORDER_HASH]: {
					S: orderHash
				},
				...data
			}
		};

		await this.insertData(params);
	}

	public async getRawOrder(orderHash: string): Promise<SignedOrder> {
		const params: QueryInput = {
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_RAW_ORDERS}.${CST.DB_LIVE}`
				: `${CST.DB_PROJECT}.${CST.DB_RAW_ORDERS}.${CST.DB_DEV}`,
			KeyConditionExpression: `${CST.DB_ORDER_HASH} = :${CST.DB_ORDER_HASH}`,
			ExpressionAttributeValues: {
				[':' + CST.DB_ORDER_HASH]: { S: orderHash }
			}
		};

		const data = await this.queryData(params);
		if (!data.Items || !data.Items.length) throw console.error('wrong number of order!');
		const parsedRawOrder = this.parseRawOrders(data.Items[0]);

		return parsedRawOrder;
	}

	public parseRawOrders(data: AttributeMap): SignedOrder {
		return {
			signature: data[CST.DB_SIGNATURE].S || '',
			senderAddress: data[CST.DB_SENDER_ADDR].S || '',
			makerAddress: data[CST.DB_MAKER_ADDR].S || '',
			takerAddress: data[CST.DB_TAKER_ADDR].S || '',
			makerFee: util.stringToBN(data[CST.DB_MAKER_FEE].S || '0'),
			takerFee: util.stringToBN(data[CST.DB_TAKER_FEE].S || '0'),
			makerAssetAmount: util.stringToBN(data[CST.DB_MAKER_ASSET_AMT].S || '0'),
			takerAssetAmount: util.stringToBN(data[CST.DB_TAKER_ASSET_AMT].S || '0'),
			makerAssetData: data[CST.DB_MAKER_ASSET_DATA].S || '',
			takerAssetData: data[CST.DB_TAKER_ASSET_DATA].S || '',
			salt: util.stringToBN(data[CST.DB_SALT].S || '0'),
			exchangeAddress: data[CST.DB_EXCHANGE_ADDR].S || '',
			feeRecipientAddress: data[CST.DB_FEE_RECIPIENT_ADDR].S || '',
			expirationTimeSeconds: util.stringToBN(data[CST.DB_EXPIRATION_TIME_SECONDS].S || '0')
		};
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
			[CST.DB_ORDER_HASH]: data[CST.DB_ORDER_HASH].S || '',
			[CST.DB_PRICE]: Number(data[CST.DB_PRICE].N || 0),
			[CST.DB_SIDE]: data[CST.DB_SIDE].S || '',
			[CST.DB_AMT]:
				data[CST.DB_SIDE].S === CST.DB_BUY
					? Number(data[CST.DB_REMAINING_TAKER_ASSET_AMT].S || '0')
					: Number(data[CST.DB_REMAINING_MAKER_ASSET_AMT].S || '0'),
			[CST.DB_ORDER_IS_VALID]: data[CST.DB_REMAINING_MAKER_ASSET_AMT].BOOL || false,
			[CST.DB_UPDATED_AT]: Date.now()
		};
	}

	public async getLiveOrders(pair: string): Promise<ILiveOrders[]> {
		const params: QueryInput = {
			TableName: this.live
				? `${CST.DB_PROJECT}.${CST.DB_LIVE_ORDERS}.${CST.DB_LIVE}`
				: `${CST.DB_PROJECT}.${CST.DB_LIVE_ORDERS}.${CST.DB_DEV}`,
			KeyConditionExpression: `${CST.DB_PAIR} = :${CST.DB_PAIR}`,
			FilterExpression: `${CST.DB_ORDER_IS_VALID} = :${CST.DB_ORDER_IS_VALID}`,
			ExpressionAttributeNames: { [CST.DB_ORDER_IS_VALID]: CST.DB_ORDER_IS_VALID },
			ExpressionAttributeValues: {
				[':' + CST.DB_PAIR]: { S: pair },
				[':' + CST.DB_ORDER_IS_VALID]: { BOOL: true }
			}
		};

		const data = await this.queryData(params);
		if (!data.Items || !data.Items.length) return [];

		const parsedLiveOrders = data.Items.map(ob => this.parseLiveOrders(ob));

		return parsedLiveOrders;
	}

	public async updateOrderState(orderState: OrderStateValid | OrderStateInvalid, pair: string) {
		if (orderState.isValid === true)
			return this.updateItem({
				TableName: this.live
					? `${CST.DB_PROJECT}.${CST.DB_RAW_ORDERS}.${CST.DB_LIVE}`
					: `${CST.DB_PROJECT}.${CST.DB_RAW_ORDERS}.${CST.DB_DEV}`,
				Key: {
					[CST.DB_PAIR]: {
						S: pair
					},
					[CST.DB_ORDER_HASH]: {
						S: orderState.orderHash
					}
				},
				ExpressionAttributeNames: {
					[CST.DB_ORDER_IS_VALID]: CST.DB_ORDER_IS_VALID,
					[CST.DB_AMT]: CST.DB_AMT,
					[CST.DB_FILLED_TAKER_ASSET_AMT]: CST.DB_FILLED_TAKER_ASSET_AMT,
					[CST.DB_REMAINING_MAKER_ASSET_AMT]: CST.DB_REMAINING_MAKER_ASSET_AMT,
					[CST.DB_REMAINING_TAKER_ASSET_AMT]: CST.DB_REMAINING_TAKER_ASSET_AMT,
					[CST.DB_UPDATED_AT]: CST.DB_UPDATED_AT
				},
				ExpressionAttributeValues: {
					[':' + CST.DB_ORDER_IS_VALID]: { S: orderState.isValid.toString() },
					[':' + CST.DB_AMT]: {
						S: orderState.orderRelevantState.remainingFillableMakerAssetAmount.toString()
					},
					[':' + CST.DB_FILLED_TAKER_ASSET_AMT]: {
						S: orderState.orderRelevantState.filledTakerAssetAmount.toString()
					},
					[':' + CST.DB_REMAINING_MAKER_ASSET_AMT]: {
						S: orderState.orderRelevantState.remainingFillableMakerAssetAmount.toString()
					},
					[':' + CST.DB_REMAINING_TAKER_ASSET_AMT]: {
						S: orderState.orderRelevantState.remainingFillableTakerAssetAmount.toString()
					},
					[':' + CST.DB_UPDATED_AT]: { S: Date.now().toString() }
				},
				UpdateExpression: `SET ${CST.DB_ORDER_IS_VALID} = ${':' + CST.DB_ORDER_IS_VALID}, ${
					CST.DB_AMT
				} = ${':' + CST.DB_AMT}, ${CST.DB_FILLED_TAKER_ASSET_AMT} = ${':' +
					CST.DB_FILLED_TAKER_ASSET_AMT}, ${CST.DB_REMAINING_MAKER_ASSET_AMT} = ${':' +
					CST.DB_REMAINING_MAKER_ASSET_AMT}, ${CST.DB_REMAINING_TAKER_ASSET_AMT} = ${':' +
					CST.DB_REMAINING_TAKER_ASSET_AMT}, ${CST.DB_UPDATED_AT} = ${':' +
					CST.DB_UPDATED_AT} `
			});
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
