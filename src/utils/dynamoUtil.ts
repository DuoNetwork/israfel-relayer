import {
	Constants,
	IFeeSchedule,
	ILiveOrder,
	IRawOrder,
	IStatus,
	IToken,
	ITrade,
	IUserOrder,
	Util
} from '@finbook/israfel-common';
import DynamoDB, {
	AttributeMap,
	DeleteItemInput,
	PutItemInput,
	QueryInput,
	QueryOutput,
	ScanInput,
	ScanOutput,
	TransactWriteItemsInput,
	UpdateItemInput
} from 'aws-sdk/clients/dynamodb';
import AWS from 'aws-sdk/global';
import moment from 'moment';

import { AWS_DYNAMO_API_VERSION } from '../common/constants';

class DynamoUtil {
	public ddb: undefined | DynamoDB = undefined;
	public env: string = Constants.DB_DEV;
	public hostname: string = 'hostname';
	public tool: string = 'tool';
	public init(config: object, env: string, tool: string = 'tool', hostname: string = 'hostname') {
		this.env = env;
		this.tool = tool;
		this.hostname = hostname;
		AWS.config.update(config);
		this.ddb = new DynamoDB({ apiVersion: AWS_DYNAMO_API_VERSION });
		return Promise.resolve();
	}

	public putData(params: PutItemInput): Promise<void> {
		return new Promise((resolve, reject) =>
			this.ddb
				? this.ddb.putItem(params, err => (err ? reject(err) : resolve()))
				: reject('dynamo db connection is not initialized')
		);
	}

	public transactPutData(params: TransactWriteItemsInput): Promise<void> {
		return new Promise((resolve, reject) =>
			this.ddb
				? this.ddb.transactWriteItems(params, err => (err ? reject(err) : resolve()))
				: reject('dynamo db connection is not initialized')
		);
	}

	public updateData(params: UpdateItemInput): Promise<void> {
		return new Promise((resolve, reject) =>
			this.ddb
				? this.ddb.updateItem(params, err => (err ? reject(err) : resolve()))
				: reject('dynamo db connection is not initialized')
		);
	}

	public queryData(params: QueryInput): Promise<QueryOutput> {
		return new Promise((resolve, reject) =>
			this.ddb
				? this.ddb.query(params, (err, data) => (err ? reject(err) : resolve(data)))
				: reject('dynamo db connection is not initialized')
		);
	}

	public scanData(params: ScanInput): Promise<ScanOutput> {
		return new Promise((resolve, reject) =>
			this.ddb
				? this.ddb.scan(params, (err, data) => (err ? reject(err) : resolve(data)))
				: reject('dynamo db connection is not initialized')
		);
	}

	public deleteData(params: DeleteItemInput): Promise<void> {
		return new Promise((resolve, reject) =>
			this.ddb
				? this.ddb.deleteItem(params, err => (err ? reject(err) : resolve()))
				: reject('dynamo db connection is not initialized')
		);
	}

	public parseToken(data: AttributeMap): IToken {
		const token: IToken = {
			custodian: (data[Constants.DB_CUSTODIAN].S || '').toLowerCase(),
			address: (data[Constants.DB_ADDRESS].S || '').toLowerCase(),
			code: data[Constants.DB_CODE].S || '',
			denomination: Number(data[Constants.DB_DENOMINATION].N),
			precisions: {},
			feeSchedules: {}
		};
		if (data[Constants.DB_MATURITY]) token.maturity = Number(data[Constants.DB_MATURITY].N);

		const precision = data[Constants.DB_PRECISIONS].M || {};
		for (const code in precision) token.precisions[code] = Number(precision[code].N);

		const allFees = data[Constants.DB_FEE_SCHEDULES].M || {};
		for (const code in allFees) {
			const fee = allFees[code].M;
			if (!fee) continue;
			const parsedFee: IFeeSchedule = {
				rate: Number(fee[Constants.DB_RATE].N),
				minimum: Number(fee[Constants.DB_MIN].N)
			};
			if (fee[Constants.DB_ASSET]) parsedFee.asset = fee[Constants.DB_ASSET].S || '';
			token.feeSchedules[code] = parsedFee;
		}

		return token;
	}

	private getTableName(table: string) {
		return `${Constants.DB_ISRAFEL}.${this.env}.${table}`;
	}

	public async scanTokens() {
		const data = await this.scanData({
			TableName: this.getTableName(Constants.DB_TOKENS)
		});
		if (!data.Items || !data.Items.length) return [];

		return data.Items.map(ob => this.parseToken(ob));
	}

	public async scanIpList() {
		const data = await this.scanData({
			TableName: this.getTableName(Constants.DB_IP_LIST)
		});
		const ipList: { [ip: string]: string } = {};
		if (!data.Items || !data.Items.length) return ipList;

		data.Items.forEach(ip => {
			const ipAddr = ip[Constants.DB_IP].S || '';
			const color = ip[Constants.DB_COLOR].S || '';
			if (ipAddr && color) ipList[ipAddr] = color;
		});
		return ipList;
	}

	public async updateIpList(ip: string, color: string) {
		return this.putData({
			TableName: this.getTableName(Constants.DB_IP_LIST),
			Item: {
				[Constants.DB_IP]: { S: ip },
				[Constants.DB_COLOR]: { S: color }
			}
		});
	}

	public updateStatus(process: string, count: number = 0) {
		const params: PutItemInput = {
			TableName: this.getTableName(Constants.DB_STATUS),
			Item: {
				[Constants.DB_PROCESS]: {
					S: `${this.tool}|${process}|${this.hostname}`
				},
				[Constants.DB_HOSTNAME]: {
					S: this.hostname
				},
				[Constants.DB_UPDATED_AT]: { N: Util.getUTCNowTimestamp() + '' }
			}
		};
		if (count) params.Item[Constants.DB_COUNT] = { N: count + '' };
		return this.putData(params).catch(error => Util.logError('Error insert status: ' + error));
	}

	public parseStatus(data: AttributeMap): IStatus {
		const parts = (data[Constants.DB_PROCESS].S || '').split('|');
		const status: IStatus = {
			tool: parts[0],
			pair: parts.length > 3 ? `${parts[1]}|${parts[2]}` : parts[1],
			hostname: data[Constants.DB_HOSTNAME].S || '',
			updatedAt: Number(data[Constants.DB_UPDATED_AT].N)
		};
		const count = data[Constants.DB_COUNT] ? Number(data[Constants.DB_COUNT].N) : 0;
		if (count) status.count = count;

		return status;
	}

	public async scanStatus(): Promise<IStatus[]> {
		const data = await this.scanData({
			TableName: this.getTableName(Constants.DB_STATUS)
		});
		if (!data.Items || !data.Items.length) return [];

		return data.Items.map(ob => this.parseStatus(ob));
	}

	public convertLiveOrderToDynamo(liveOrder: ILiveOrder): AttributeMap {
		return {
			[Constants.DB_ACCOUNT]: { S: liveOrder.account },
			[Constants.DB_PAIR]: { S: liveOrder.pair },
			[Constants.DB_ORDER_HASH]: { S: liveOrder.orderHash },
			[Constants.DB_PRICE]: {
				N: Util.round(liveOrder.price) + ''
			},
			[Constants.DB_AMOUNT]: { N: liveOrder.amount + '' },
			[Constants.DB_BALANCE]: { N: liveOrder.balance + '' },
			[Constants.DB_MATCHING]: { N: liveOrder.matching + '' },
			[Constants.DB_FILL]: { N: liveOrder.fill + '' },
			[Constants.DB_SIDE]: { S: liveOrder.side },
			[Constants.DB_EXP]: { N: liveOrder.expiry + '' },
			[Constants.DB_FEE]: { N: liveOrder.fee + '' },
			[Constants.DB_FEE_ASSET]: { S: liveOrder.feeAsset },
			[Constants.DB_INITIAL_SEQ]: { N: liveOrder.initialSequence + '' },
			[Constants.DB_CURRENT_SEQ]: { N: liveOrder.currentSequence + '' },
			[Constants.DB_CREATED_AT]: { N: liveOrder.createdAt + '' },
			[Constants.DB_UPDATED_AT]: { N: Util.getUTCNowTimestamp() + '' }
		};
	}

	public convertRawOrderToDynamo(rawOrder: IRawOrder): AttributeMap {
		const timestamp = Util.getUTCNowTimestamp();
		return {
			[Constants.DB_ORDER_HASH]: { S: rawOrder.orderHash },
			[Constants.DB_PAIR]: { S: rawOrder.pair },
			[Constants.DB_0X_SENDER_ADDR]: { S: rawOrder.signedOrder.senderAddress + '' },
			[Constants.DB_0X_MAKER_ADDR]: { S: rawOrder.signedOrder.makerAddress + '' },
			[Constants.DB_0X_TAKER_ADDR]: { S: rawOrder.signedOrder.takerAddress + '' },
			[Constants.DB_0X_MAKER_FEE]: { S: rawOrder.signedOrder.makerFee.valueOf() + '' },
			[Constants.DB_0X_TAKER_FEE]: { S: rawOrder.signedOrder.takerFee.valueOf() + '' },
			[Constants.DB_0X_MAKER_ASSET_AMT]: {
				S: rawOrder.signedOrder.makerAssetAmount.valueOf() + ''
			},
			[Constants.DB_0X_TAKER_ASSET_AMT]: {
				S: rawOrder.signedOrder.takerAssetAmount.valueOf() + ''
			},
			[Constants.DB_0X_MAKER_ASSET_DATA]: { S: rawOrder.signedOrder.makerAssetData + '' },
			[Constants.DB_0X_TAKER_ASSET_DATA]: { S: rawOrder.signedOrder.takerAssetData + '' },
			[Constants.DB_0X_SALT]: { S: rawOrder.signedOrder.salt.valueOf() + '' },
			[Constants.DB_0X_EXCHANGE_ADDR]: { S: rawOrder.signedOrder.exchangeAddress + '' },
			[Constants.DB_0X_FEE_RECIPIENT_ADDR]: {
				S: rawOrder.signedOrder.feeRecipientAddress + ''
			},
			[Constants.DB_0X_EXPIRATION_TIME_SECONDS]: {
				S: rawOrder.signedOrder.expirationTimeSeconds.valueOf() + ''
			},
			[Constants.DB_0X_SIGNATURE]: { S: rawOrder.signedOrder.signature + '' },
			[Constants.DB_CREATED_AT]: { N: (rawOrder.createdAt || timestamp) + '' },
			[Constants.DB_UPDATED_AT]: { N: timestamp + '' }
		};
	}

	public addOrder(liveOrder: ILiveOrder, rawOrder: IRawOrder) {
		return this.transactPutData({
			TransactItems: [
				{
					Put: {
						TableName: this.getTableName(Constants.DB_LIVE_ORDERS),
						Item: this.convertLiveOrderToDynamo(liveOrder)
					}
				},
				{
					Put: {
						TableName: this.getTableName(Constants.DB_RAW_ORDERS),
						Item: this.convertRawOrderToDynamo(rawOrder)
					}
				}
			]
		});
	}

	public deleteOrder(pair: string, orderHash: string) {
		return this.transactPutData({
			TransactItems: [
				{
					Delete: {
						TableName: this.getTableName(Constants.DB_LIVE_ORDERS),
						Key: {
							[Constants.DB_PAIR]: {
								S: pair
							},
							[Constants.DB_ORDER_HASH]: {
								S: orderHash
							}
						}
					}
				},
				{
					Update: {
						TableName: this.getTableName(Constants.DB_RAW_ORDERS),
						Key: {
							[Constants.DB_ORDER_HASH]: {
								S: orderHash
							}
						},
						ExpressionAttributeValues: {
							[':' + Constants.DB_UPDATED_AT]: { N: Util.getUTCNowTimestamp() + '' }
						},
						UpdateExpression: `SET ${Constants.DB_UPDATED_AT} = ${':' +
							Constants.DB_UPDATED_AT} REMOVE ${Constants.DB_0X_SIGNATURE}`
					}
				}
			]
		});
	}

	public async updateLiveOrder(liveOrder: ILiveOrder) {
		return this.updateData({
			TableName: this.getTableName(Constants.DB_LIVE_ORDERS),
			Key: {
				[Constants.DB_PAIR]: {
					S: liveOrder.pair
				},
				[Constants.DB_ORDER_HASH]: {
					S: liveOrder.orderHash
				}
			},
			ExpressionAttributeValues: {
				[':' + Constants.DB_BALANCE]: {
					N: liveOrder.balance + ''
				},
				[':' + Constants.DB_MATCHING]: {
					N: liveOrder.matching + ''
				},
				[':' + Constants.DB_FILL]: {
					N: liveOrder.fill + ''
				},
				[':' + Constants.DB_UPDATED_AT]: { N: Util.getUTCNowTimestamp() + '' },
				[':' + Constants.DB_CURRENT_SEQ]: { N: liveOrder.currentSequence + '' }
			},
			UpdateExpression: `SET ${Constants.DB_BALANCE} = ${':' + Constants.DB_BALANCE}, ${
				Constants.DB_MATCHING
			} = ${':' + Constants.DB_MATCHING}, ${Constants.DB_FILL} = ${':' +
				Constants.DB_FILL}, ${Constants.DB_UPDATED_AT} = ${':' +
				Constants.DB_UPDATED_AT}, ${Constants.DB_CURRENT_SEQ} = ${':' +
				Constants.DB_CURRENT_SEQ} `
		});
	}

	public parseLiveOrder(data: AttributeMap): ILiveOrder {
		return {
			account: data[Constants.DB_ACCOUNT].S || '',
			pair: data[Constants.DB_PAIR].S || '',
			orderHash: data[Constants.DB_ORDER_HASH].S || '',
			price: Number(data[Constants.DB_PRICE].N),
			side: data[Constants.DB_SIDE].S || '',
			amount: Number(data[Constants.DB_AMOUNT].N),
			balance: Number(data[Constants.DB_BALANCE].N),
			matching: Number(data[Constants.DB_MATCHING].N),
			fill: Number(data[Constants.DB_FILL].N),
			expiry: Number(data[Constants.DB_EXP].N),
			fee: Number(data[Constants.DB_FEE].N),
			feeAsset: data[Constants.DB_FEE_ASSET].S || '',
			initialSequence: Number(data[Constants.DB_INITIAL_SEQ].N),
			currentSequence: Number(data[Constants.DB_CURRENT_SEQ].N),
			createdAt: Number(data[Constants.DB_CREATED_AT].N),
			updatedAt: Number(data[Constants.DB_UPDATED_AT].N)
		};
	}

	public async getLiveOrders(pair: string, orderHash: string = ''): Promise<ILiveOrder[]> {
		const params: QueryInput = {
			TableName: this.getTableName(Constants.DB_LIVE_ORDERS),
			KeyConditionExpression: `${Constants.DB_PAIR} = :${Constants.DB_PAIR}`,
			ExpressionAttributeValues: {
				[':' + Constants.DB_PAIR]: { S: pair }
			}
		};

		if (orderHash) {
			params.KeyConditionExpression += ` AND ${Constants.DB_ORDER_HASH} = :${
				Constants.DB_ORDER_HASH
			}`;
			if (params.ExpressionAttributeValues)
				params.ExpressionAttributeValues[':' + Constants.DB_ORDER_HASH] = { S: orderHash };
		}

		const data = await this.queryData(params);
		if (!data.Items || !data.Items.length) return [];

		if (orderHash && data.Items.length > 1)
			throw new Error('multiple record for order hash ' + orderHash);

		return data.Items.map(ob => this.parseLiveOrder(ob));
	}

	public parseRawOrder(data: AttributeMap): IRawOrder {
		return {
			pair: data[Constants.DB_PAIR].S || '',
			orderHash: data[Constants.DB_ORDER_HASH].S || '',
			signedOrder: {
				signature: data[Constants.DB_0X_SIGNATURE]
					? data[Constants.DB_0X_SIGNATURE].S || ''
					: '',
				senderAddress: data[Constants.DB_0X_SENDER_ADDR].S || '',
				makerAddress: data[Constants.DB_0X_MAKER_ADDR].S || '',
				takerAddress: data[Constants.DB_0X_TAKER_ADDR].S || '',
				makerFee: data[Constants.DB_0X_MAKER_FEE].S || '0',
				takerFee: data[Constants.DB_0X_TAKER_FEE].S || '0',
				makerAssetAmount: data[Constants.DB_0X_MAKER_ASSET_AMT].S || '0',
				takerAssetAmount: data[Constants.DB_0X_TAKER_ASSET_AMT].S || '0',
				makerAssetData: data[Constants.DB_0X_MAKER_ASSET_DATA].S || '',
				takerAssetData: data[Constants.DB_0X_TAKER_ASSET_DATA].S || '',
				salt: data[Constants.DB_0X_SALT].S || '0',
				exchangeAddress: data[Constants.DB_0X_EXCHANGE_ADDR].S || '',
				feeRecipientAddress: data[Constants.DB_0X_FEE_RECIPIENT_ADDR].S || '',
				expirationTimeSeconds: data[Constants.DB_0X_EXPIRATION_TIME_SECONDS].S || '0'
			},
			createdAt: Number(data[Constants.DB_CREATED_AT].N),
			updatedAt: Number(data[Constants.DB_UPDATED_AT].N)
		};
	}

	public async getRawOrder(orderHash: string): Promise<IRawOrder | null> {
		const params: QueryInput = {
			TableName: this.getTableName(Constants.DB_RAW_ORDERS),
			KeyConditionExpression: `${Constants.DB_ORDER_HASH} = :${Constants.DB_ORDER_HASH}`,
			ExpressionAttributeValues: {
				[':' + Constants.DB_ORDER_HASH]: { S: orderHash }
			}
		};

		const data = await this.queryData(params);
		if (!data.Items || !data.Items.length) return null;
		if (data.Items.length > 1) throw new Error('multiple record for order hash ' + orderHash);
		return this.parseRawOrder(data.Items[0]);
	}

	public convertUserOrderToDynamo(userOrder: IUserOrder): AttributeMap {
		const timestamp = Util.getUTCNowTimestamp();
		const data: AttributeMap = {
			[Constants.DB_ACCOUNT_YM]: {
				S: userOrder.account + '|' + moment.utc(timestamp).format('YYYY-MM')
			},
			[Constants.DB_PAIR_OH_SEQ_STATUS]: {
				S: `${userOrder.pair}|${userOrder.orderHash}|${userOrder.currentSequence}|${
					userOrder.status
				}`
			},
			[Constants.DB_TYPE]: { S: userOrder.type },
			[Constants.DB_PRICE]: {
				N: Util.round(userOrder.price) + ''
			},
			[Constants.DB_BALANCE]: { N: userOrder.balance + '' },
			[Constants.DB_AMOUNT]: { N: userOrder.amount + '' },
			[Constants.DB_MATCHING]: { N: userOrder.matching + '' },
			[Constants.DB_FILL]: { N: userOrder.fill + '' },
			[Constants.DB_SIDE]: { S: userOrder.side },
			[Constants.DB_EXP]: { N: userOrder.expiry + '' },
			[Constants.DB_FEE]: { N: userOrder.fee + '' },
			[Constants.DB_FEE_ASSET]: { S: userOrder.feeAsset },
			[Constants.DB_INITIAL_SEQ]: { N: userOrder.initialSequence + '' },
			[Constants.DB_CREATED_AT]: { N: userOrder.createdAt + '' },
			[Constants.DB_UPDATED_AT]: { N: timestamp + '' },
			[Constants.DB_UPDATED_BY]: { S: userOrder.updatedBy + '' },
			[Constants.DB_PROCESSED]: { BOOL: userOrder.processed }
		};
		if (userOrder.transactionHash)
			data[Constants.DB_TX_HASH] = { S: userOrder.transactionHash };
		return data;
	}

	public addUserOrder(userOrder: IUserOrder) {
		return this.putData({
			TableName: this.getTableName(Constants.DB_USER_ORDERS),
			Item: this.convertUserOrderToDynamo(userOrder)
		});
	}

	public parseUserOrder(data: AttributeMap): IUserOrder {
		const [code1, code2, orderHash, seq, status] = (
			data[Constants.DB_PAIR_OH_SEQ_STATUS].S || ''
		).split('|');
		const userOrder: IUserOrder = {
			account: (data[Constants.DB_ACCOUNT_YM].S || '').split('|')[0],
			pair: `${code1}|${code2}`,
			type: data[Constants.DB_TYPE].S || '',
			status: status,
			orderHash: orderHash,
			price: Number(data[Constants.DB_PRICE].N),
			side: data[Constants.DB_SIDE].S || '',
			amount: Number(data[Constants.DB_AMOUNT].N),
			balance: Number(data[Constants.DB_BALANCE].N),
			matching: Number(data[Constants.DB_MATCHING].N),
			fill: Number(data[Constants.DB_FILL].N),
			expiry: Number(data[Constants.DB_EXP].N),
			fee: Number(data[Constants.DB_FEE].N),
			feeAsset: data[Constants.DB_FEE_ASSET].S || '',
			initialSequence: Number(data[Constants.DB_INITIAL_SEQ].N),
			currentSequence: Number(seq),
			createdAt: Number(data[Constants.DB_CREATED_AT].N),
			updatedAt: Number(data[Constants.DB_UPDATED_AT].N),
			updatedBy: data[Constants.DB_UPDATED_BY].S || '',
			processed: !!data[Constants.DB_PROCESSED].BOOL
		};
		if (data[Constants.DB_TX_HASH]) userOrder.transactionHash = data[Constants.DB_TX_HASH].S;
		return userOrder;
	}

	public async getUserOrders(account: string, start: number, end: number = 0, pair: string = '') {
		if (!end) end = Util.getUTCNowTimestamp();
		const startObj = moment.utc(start).startOf('month');
		const months = [];
		while (startObj.valueOf() <= end) {
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
			TableName: this.getTableName(Constants.DB_USER_ORDERS),
			KeyConditionExpression: `${Constants.DB_ACCOUNT_YM} = :${Constants.DB_ACCOUNT_YM}`,
			ExpressionAttributeValues: {
				[':' + Constants.DB_ACCOUNT_YM]: {
					S: `${account}|${yearMonth}`
				}
			}
		};
		if (pair) {
			params.KeyConditionExpression += ` AND ${
				Constants.DB_PAIR_OH_SEQ_STATUS
			} BETWEEN :start AND :end`;
			if (params.ExpressionAttributeValues) {
				params.ExpressionAttributeValues[':start'] = { S: `${pair}|` };
				params.ExpressionAttributeValues[':end'] = { S: `${pair}|z` };
			}
		}

		const data = await this.queryData(params);
		if (!data.Items || !data.Items.length) return [];

		return data.Items.map(uo => this.parseUserOrder(uo));
	}

	public convertTradeToDynamo(trade: ITrade): AttributeMap {
		return {
			[Constants.DB_PAIR_DATE_HOUR]: {
				S: trade.pair + '|' + moment.utc(trade.timestamp).format('YYYY-MM-DD-HH')
			},
			[Constants.DB_TS_TX_HASH]: { S: trade.timestamp + '|' + trade.transactionHash },
			[Constants.DB_FEE_ASSET]: { S: trade.feeAsset },
			[Constants.DB_TK_OH]: { S: trade.taker.orderHash },
			[Constants.DB_TK_ADDR]: { S: trade.taker.address },
			[Constants.DB_TK_SIDE]: { S: trade.taker.side },
			[Constants.DB_TK_PX]: { N: trade.taker.price + '' },
			[Constants.DB_TK_AMT]: { N: trade.taker.amount + '' },
			[Constants.DB_TK_FEE]: { N: trade.taker.fee + '' },
			[Constants.DB_MK_OH]: { S: trade.maker.orderHash },
			[Constants.DB_MK_PX]: { N: trade.maker.price + '' },
			[Constants.DB_MK_AMT]: { N: trade.maker.amount + '' },
			[Constants.DB_MK_FEE]: { N: trade.maker.fee + '' }
		};
	}

	public addTrade(trade: ITrade) {
		return this.putData({
			TableName: this.getTableName(Constants.DB_TRADES),
			Item: this.convertTradeToDynamo(trade)
		});
	}

	public parseTrade(data: AttributeMap): ITrade {
		const [code1, code2] = (data[Constants.DB_PAIR_DATE_HOUR].S || '').split('|');
		const [tsString, txHash] = (data[Constants.DB_TS_TX_HASH].S || '').split('|');
		return {
			pair: code1 + '|' + code2,
			timestamp: Number(tsString),
			transactionHash: txHash,
			feeAsset: data[Constants.DB_FEE_ASSET].S || '',
			taker: {
				orderHash: data[Constants.DB_TK_OH].S || '',
				address: data[Constants.DB_TK_ADDR].S || '',
				side: data[Constants.DB_TK_SIDE].S || '',
				price: Number(data[Constants.DB_TK_PX].N),
				amount: Number(data[Constants.DB_TK_AMT].N),
				fee: Number(data[Constants.DB_TK_FEE].N)
			},
			maker: {
				orderHash: data[Constants.DB_MK_OH].S || '',
				price: Number(data[Constants.DB_MK_PX].N),
				amount: Number(data[Constants.DB_MK_AMT].N),
				fee: Number(data[Constants.DB_MK_FEE].N)
			}
		};
	}

	public async getTrades(pair: string, start: number, end: number = 0) {
		if (!end) end = Util.getUTCNowTimestamp();
		const startObj = moment.utc(start).startOf('hour');
		const hours = [];
		while (startObj.valueOf() <= end) {
			hours.push(startObj.format('YYYY-MM-DD-HH'));
			startObj.add(1, 'hour');
		}

		const trades = [];

		for (const hour of hours) trades.push(...(await this.getTradesForHour(pair, hour)));

		return trades;
	}

	public async getTradesForHour(pair: string, dateHour: string) {
		const params: QueryInput = {
			TableName: this.getTableName(Constants.DB_TRADES),
			KeyConditionExpression: `${Constants.DB_PAIR_DATE_HOUR} = :${
				Constants.DB_PAIR_DATE_HOUR
			}`,
			ExpressionAttributeValues: {
				[':' + Constants.DB_PAIR_DATE_HOUR]: {
					S: `${pair}|${dateHour}`
				}
			}
		};

		const data = await this.queryData(params);
		if (!data.Items || !data.Items.length) return [];

		return data.Items.map(t => this.parseTrade(t));
	}
}

const dynamoUtil = new DynamoUtil();
export default dynamoUtil;
