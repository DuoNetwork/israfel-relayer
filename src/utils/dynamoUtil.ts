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
import moment from 'moment';
import * as CST from '../common/constants';
import { ILiveOrder, IRawOrder, IService, IStatus, IUserOrder } from '../common/types';
import util from './util';

class DynamoUtil {
	private ddb: undefined | DynamoDB = undefined;
	private live: boolean = false;
	private hostname: string = 'hostname';
	private tool: string = 'tool';
	public init(
		config: object,
		live: boolean,
		tool: string = 'tool',
		hostname: string = 'hostname'
	) {
		this.live = live;
		this.tool = tool;
		this.hostname = hostname;
		AWS.config.update(config);
		this.ddb = new DynamoDB({ apiVersion: CST.AWS_DYNAMO_API_VERSION });
		return Promise.resolve();
	}

	public putData(params: PutItemInput): Promise<void> {
		return new Promise(
			(resolve, reject) =>
				this.ddb
					? this.ddb.putItem(params, err => (err ? reject(err) : resolve()))
					: reject('dynamo db connection is not initialized')
		);
	}

	public updateData(params: UpdateItemInput): Promise<void> {
		return new Promise(
			(resolve, reject) =>
				this.ddb
					? this.ddb.updateItem(params, err => (err ? reject(err) : resolve()))
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

	public parseService(data: AttributeMap): IService {
		return {
			service: data[CST.DB_SERVICE].S || '',
			hostname: data[CST.DB_HOSTNAME].S || '',
			url: data[CST.DB_URL].S || ''
		};
	}

	public async scanServices() {
		const data = await this.scanData({
			TableName: `${CST.DB_ISRAFEL}.${CST.DB_SERVICES}.${
				this.live ? CST.DB_LIVE : CST.DB_DEV
			}`
		});
		if (!data.Items || !data.Items.length) return [];

		return data.Items.map(ob => this.parseService(ob));
	}

	public async getServices(service: string, onlyThisHost: boolean = false) {
		const params: QueryInput = {
			TableName: `${CST.DB_ISRAFEL}.${CST.DB_SERVICES}.${
				this.live ? CST.DB_LIVE : CST.DB_DEV
			}`,
			KeyConditionExpression: `${CST.DB_SERVICE} = :${CST.DB_SERVICE}`,
			ExpressionAttributeValues: {
				[':' + CST.DB_SERVICE]: { S: service }
			}
		};

		if (onlyThisHost) {
			params.KeyConditionExpression += ` AND ${CST.DB_HOSTNAME} = :${CST.DB_HOSTNAME}`;
			if (params.ExpressionAttributeValues)
				params.ExpressionAttributeValues[':' + CST.DB_HOSTNAME] = { S: this.hostname };
		}

		const data = await this.queryData(params);
		if (!data.Items || !data.Items.length) return [];

		return data.Items.map(ob => this.parseService(ob));
	}

	public updateStatus(process: string, count: number = 0, sequence: number = 0) {
		const params: PutItemInput = {
			TableName: `${CST.DB_ISRAFEL}.${CST.DB_STATUS}.${this.live ? CST.DB_LIVE : CST.DB_DEV}`,
			Item: {
				[CST.DB_PROCESS]: {
					S: `${this.tool}|${process}|${this.hostname}`
				},
				[CST.DB_HOSTNAME]: {
					S: this.hostname
				},
				[CST.DB_UPDATED_AT]: { N: util.getUTCNowTimestamp() + '' }
			}
		};
		if (count) params.Item[CST.DB_COUNT] = { N: count + '' };
		if (sequence) params.Item[CST.DB_SEQUENCE] = { N: sequence + '' };
		return this.putData(params).catch(error => util.logError('Error insert status: ' + error));
	}

	public parseStatus(data: AttributeMap): IStatus {
		const [tool, pair] = (data[CST.DB_PROCESS].S || '').split('|');
		const status: IStatus = {
			tool: tool,
			pair: pair || '',
			hostname: data[CST.DB_HOSTNAME].S || '',
			updatedAt: Number(data[CST.DB_UPDATED_AT].N)
		};
		const count = data[CST.DB_COUNT] ? Number(data[CST.DB_COUNT].N) : 0;
		if (count) status.count = count;
		const sequence = data[CST.DB_SEQUENCE] ? Number(data[CST.DB_SEQUENCE].N) : 0;
		if (sequence) status.sequence = sequence;

		return status;
	}

	public async scanStatus(): Promise<IStatus[]> {
		const data = await this.scanData({
			TableName: `${CST.DB_ISRAFEL}.${CST.DB_STATUS}.${this.live ? CST.DB_LIVE : CST.DB_DEV}`
		});
		if (!data.Items || !data.Items.length) return [];

		return data.Items.map(ob => this.parseStatus(ob));
	}

	public convertLiveOrderToDynamo(liveOrder: ILiveOrder): AttributeMap {
		const timestamp = util.getUTCNowTimestamp();
		return {
			[CST.DB_ACCOUNT]: { S: liveOrder.account },
			[CST.DB_PAIR]: { S: liveOrder.pair },
			[CST.DB_ORDER_HASH]: { S: liveOrder.orderHash },
			[CST.DB_PRICE]: {
				N: util.round(liveOrder.price) + ''
			},
			[CST.DB_BALANCE]: { N: liveOrder.amount + '' },
			[CST.DB_SIDE]: { S: liveOrder.side },
			[CST.DB_INITIAL_SEQ]: { N: liveOrder.initialSequence + '' },
			[CST.DB_CURRENT_SEQ]: { N: liveOrder.currentSequence + '' },
			[CST.DB_CREATED_AT]: { N: (liveOrder.createdAt || timestamp) + '' },
			[CST.DB_UPDATED_AT]: { N: timestamp + '' }
		};
	}

	public updateLiveOrder(liveOrder: ILiveOrder) {
		return this.putData({
			TableName: `${CST.DB_ISRAFEL}.${CST.DB_LIVE_ORDERS}.${
				this.live ? CST.DB_LIVE : CST.DB_DEV
			}`,
			Item: this.convertLiveOrderToDynamo(liveOrder)
		});
	}

	public deleteLiveOrder(liveOrder: ILiveOrder): Promise<void> {
		return this.deleteData({
			TableName: `${CST.DB_ISRAFEL}.${CST.DB_LIVE_ORDERS}.${
				this.live ? CST.DB_LIVE : CST.DB_DEV
			}`,
			Key: {
				[CST.DB_PAIR]: {
					S: liveOrder.pair
				},
				[CST.DB_ORDER_HASH]: {
					S: liveOrder.orderHash
				}
			}
		});
	}

	public parseLiveOrder(data: AttributeMap): ILiveOrder {
		return {
			account: data[CST.DB_ACCOUNT].S || '',
			pair: data[CST.DB_PAIR].S || '',
			orderHash: data[CST.DB_ORDER_HASH].S || '',
			price: Number(data[CST.DB_PRICE].N),
			side: data[CST.DB_SIDE].S || '',
			amount: Number(data[CST.DB_BALANCE].N),
			initialSequence: Number(data[CST.DB_INITIAL_SEQ].N),
			currentSequence: Number(data[CST.DB_CURRENT_SEQ].N),
			createdAt: Number(data[CST.DB_CREATED_AT].N),
			updatedAt: Number(data[CST.DB_UPDATED_AT].N)
		};
	}

	public async getLiveOrders(pair: string, orderHash: string = ''): Promise<ILiveOrder[]> {
		const params: QueryInput = {
			TableName: `${CST.DB_ISRAFEL}.${CST.DB_LIVE_ORDERS}.${
				this.live ? CST.DB_LIVE : CST.DB_DEV
			}`,
			KeyConditionExpression: `${CST.DB_PAIR} = :${CST.DB_PAIR}`,
			ExpressionAttributeValues: {
				[':' + CST.DB_PAIR]: { S: pair }
			}
		};

		if (orderHash) {
			params.KeyConditionExpression += ` AND ${CST.DB_ORDER_HASH} = :${CST.DB_ORDER_HASH}`;
			if (params.ExpressionAttributeValues)
				params.ExpressionAttributeValues[':' + CST.DB_ORDER_HASH] = { S: orderHash };
		}

		const data = await this.queryData(params);
		if (!data.Items || !data.Items.length) return [];

		if (orderHash && data.Items.length > 1)
			throw new Error('multiple record for order hash ' + orderHash);

		return data.Items.map(ob => this.parseLiveOrder(ob));
	}

	public deleteRawOrder(orderHash: string) {
		return this.deleteData({
			TableName: `${CST.DB_ISRAFEL}.${CST.DB_RAW_ORDERS}.${
				this.live ? CST.DB_LIVE : CST.DB_DEV
			}`,
			Key: {
				[CST.DB_ORDER_HASH]: {
					S: orderHash
				}
			}
		});
	}

	public convertRawOrderToDynamo(rawOrder: IRawOrder): AttributeMap {
		const timestamp = util.getUTCNowTimestamp();
		return {
			[CST.DB_ORDER_HASH]: { S: rawOrder.orderHash },
			[CST.DB_0X_SENDER_ADDR]: { S: rawOrder.signedOrder.senderAddress + '' },
			[CST.DB_0X_MAKER_ADDR]: { S: rawOrder.signedOrder.makerAddress + '' },
			[CST.DB_0X_TAKER_ADDR]: { S: rawOrder.signedOrder.takerAddress + '' },
			[CST.DB_0X_MAKER_FEE]: { S: rawOrder.signedOrder.makerFee.valueOf() + '' },
			[CST.DB_0X_TAKER_FEE]: { S: rawOrder.signedOrder.takerFee.valueOf() + '' },
			[CST.DB_0X_MAKER_ASSET_AMT]: {
				S: rawOrder.signedOrder.makerAssetAmount.valueOf() + ''
			},
			[CST.DB_0X_TAKER_ASSET_AMT]: {
				S: rawOrder.signedOrder.takerAssetAmount.valueOf() + ''
			},
			[CST.DB_0X_MAKER_ASSET_DATA]: { S: rawOrder.signedOrder.makerAssetData + '' },
			[CST.DB_0X_TAKER_ASSET_DATA]: { S: rawOrder.signedOrder.takerAssetData + '' },
			[CST.DB_0X_SALT]: { S: rawOrder.signedOrder.salt.valueOf() + '' },
			[CST.DB_0X_EXCHANGE_ADDR]: { S: rawOrder.signedOrder.exchangeAddress + '' },
			[CST.DB_0X_FEE_RECIPIENT_ADDR]: { S: rawOrder.signedOrder.feeRecipientAddress + '' },
			[CST.DB_0X_EXPIRATION_TIME_SECONDS]: {
				S: rawOrder.signedOrder.expirationTimeSeconds.valueOf() + ''
			},
			[CST.DB_0X_SIGNATURE]: { S: rawOrder.signedOrder.signature + '' },
			[CST.DB_CREATED_AT]: { N: (rawOrder.createdAt || timestamp) + '' },
			[CST.DB_UPDATED_AT]: { N: timestamp + '' }
		};
	}

	public updateRawOrder(rawOrder: IRawOrder) {
		return this.putData({
			TableName: `${CST.DB_ISRAFEL}.${CST.DB_RAW_ORDERS}.${
				this.live ? CST.DB_LIVE : CST.DB_DEV
			}`,
			Item: this.convertRawOrderToDynamo(rawOrder)
		});
	}

	public parseRawOrder(data: AttributeMap): IRawOrder {
		return {
			orderHash: data[CST.DB_ORDER_HASH].S || '',
			signedOrder: {
				signature: data[CST.DB_0X_SIGNATURE].S || '',
				senderAddress: data[CST.DB_0X_SENDER_ADDR].S || '',
				makerAddress: data[CST.DB_0X_MAKER_ADDR].S || '',
				takerAddress: data[CST.DB_0X_TAKER_ADDR].S || '',
				makerFee: data[CST.DB_0X_MAKER_FEE].S || '0',
				takerFee: data[CST.DB_0X_TAKER_FEE].S || '0',
				makerAssetAmount: data[CST.DB_0X_MAKER_ASSET_AMT].S || '0',
				takerAssetAmount: data[CST.DB_0X_TAKER_ASSET_AMT].S || '0',
				makerAssetData: data[CST.DB_0X_MAKER_ASSET_DATA].S || '',
				takerAssetData: data[CST.DB_0X_TAKER_ASSET_DATA].S || '',
				salt: data[CST.DB_0X_SALT].S || '0',
				exchangeAddress: data[CST.DB_0X_EXCHANGE_ADDR].S || '',
				feeRecipientAddress: data[CST.DB_0X_FEE_RECIPIENT_ADDR].S || '',
				expirationTimeSeconds: data[CST.DB_0X_EXPIRATION_TIME_SECONDS].S || '0'
			},
			createdAt: Number(data[CST.DB_CREATED_AT].N),
			updatedAt: Number(data[CST.DB_UPDATED_AT].N)
		};
	}

	public async getRawOrder(orderHash: string): Promise<IRawOrder | null> {
		const params: QueryInput = {
			TableName: `${CST.DB_ISRAFEL}.${CST.DB_RAW_ORDERS}.${
				this.live ? CST.DB_LIVE : CST.DB_DEV
			}`,
			KeyConditionExpression: `${CST.DB_ORDER_HASH} = :${CST.DB_ORDER_HASH}`,
			ExpressionAttributeValues: {
				[':' + CST.DB_ORDER_HASH]: { S: orderHash }
			}
		};

		const data = await this.queryData(params);
		if (!data.Items || !data.Items.length) return null;
		if (data.Items.length > 1) throw new Error('multiple record for order hash ' + orderHash);
		return this.parseRawOrder(data.Items[0]);
	}

	public convertUserOrderToDynamo(userOrder: IUserOrder): AttributeMap {
		const timestamp = util.getUTCNowTimestamp();
		return {
			[CST.DB_ACCOUNT_YM]: {
				S: userOrder.account + '|' + moment.utc(timestamp).format('YYYY-MM')
			},
			[CST.DB_PAIR_OH_SEQ]: {
				S: userOrder.pair + '|' + userOrder.orderHash + '|' + userOrder.currentSequence
			},
			[CST.DB_TYPE]: { S: userOrder.type },
			[CST.DB_STATUS]: { S: userOrder.status },
			[CST.DB_PRICE]: {
				N: util.round(userOrder.price) + ''
			},
			[CST.DB_BALANCE]: { N: userOrder.amount + '' },
			[CST.DB_SIDE]: { S: userOrder.side },
			[CST.DB_INITIAL_SEQ]: { N: userOrder.initialSequence + '' },
			[CST.DB_CREATED_AT]: { N: (userOrder.createdAt || timestamp) + '' },
			[CST.DB_UPDATED_AT]: { N: timestamp + '' },
			[CST.DB_UPDATED_BY]: { S: userOrder.updatedBy + '' }
		};
	}

	public addUserOrder(userOrder: IUserOrder) {
		return this.putData({
			TableName: `${CST.DB_ISRAFEL}.${CST.DB_USER_ORDERS}.${
				this.live ? CST.DB_LIVE : CST.DB_DEV
			}`,
			Item: this.convertUserOrderToDynamo(userOrder)
		});
	}

	public parseUserOrder(data: AttributeMap): IUserOrder {
		const [pair, orderHash, seq] = (data[CST.DB_PAIR_OH_SEQ].S || '').split('|');
		return {
			account: (data[CST.DB_ACCOUNT_YM].S || '').split('|')[0],
			pair: pair,
			type: data[CST.DB_TYPE].S || '',
			status: data[CST.DB_STATUS].S || '',
			orderHash: orderHash,
			price: Number(data[CST.DB_PRICE].N),
			side: data[CST.DB_SIDE].S || '',
			amount: Number(data[CST.DB_BALANCE].N),
			initialSequence: Number(data[CST.DB_INITIAL_SEQ].N),
			currentSequence: Number(seq),
			createdAt: Number(data[CST.DB_CREATED_AT].N),
			updatedAt: Number(data[CST.DB_UPDATED_AT].N),
			updatedBy: data[CST.DB_UPDATED_BY].S || ''
		};
	}

	public async getUserOrders(account: string, start: number, end: number = 0, pair: string = '') {
		if (!end) end = util.getUTCNowTimestamp();
		const startObj = moment.utc(start);
		const months = [];
		while (startObj.valueOf() < end) {
			months.push(startObj.format('YYYY-MM'));
			startObj.add(1, 'month');
		}

		const userOrders = [];

		for (const month of months)
			userOrders.push(...(await this.getUserOrdersForMonth(account, month, pair)));

		return userOrders;
	}

	public async getUserOrdersForMonth(account: string, yearMonth: string, pair: string = '') {
		const params: QueryInput = {
			TableName: `${CST.DB_ISRAFEL}.${CST.DB_USER_ORDERS}.${
				this.live ? CST.DB_LIVE : CST.DB_DEV
			}`,
			KeyConditionExpression: `${CST.DB_ACCOUNT_YM} = :${CST.DB_ACCOUNT_YM}`,
			ExpressionAttributeValues: {
				[':' + CST.DB_ACCOUNT_YM]: {
					S: `${account}|${yearMonth}`
				}
			}
		};
		if (pair) {
			params.KeyConditionExpression += ` AND ${CST.DB_PAIR_OH_SEQ} BETWEEN :start AND :end`;
			if (params.ExpressionAttributeValues) {
				params.ExpressionAttributeValues[':start'] = { S: `${pair}|` };
				params.ExpressionAttributeValues[':end'] = { S: `${pair}|z` };
			}
		}

		const data = await this.queryData(params);
		if (!data.Items || !data.Items.length) return [];

		return data.Items.map(uo => this.parseUserOrder(uo));
	}
}

const dynamoUtil = new DynamoUtil();
export default dynamoUtil;
