import DynamoDB, { AttributeMap, DeleteItemInput, PutItemInput, QueryInput, QueryOutput, ScanInput, ScanOutput, TransactWriteItemsInput, UpdateItemInput } from 'aws-sdk/clients/dynamodb';
import AWS from 'aws-sdk/global';
import moment from 'moment';
import * as CST from '../common/constants';
import { IFeeSchedule, IIpStatus, ILiveOrder, IRawOrder, IStatus, IToken, ITrade, IUserOrder } from '../common/types';
import util from './util';

class DynamoUtil {
	public ddb: undefined | DynamoDB = undefined;
	public env: string = CST.DB_DEV;
	public hostname: string = 'hostname';
	public tool: string = 'tool';
	public init(config: object, env: string, tool: string = 'tool', hostname: string = 'hostname') {
		this.env = env;
		this.tool = tool;
		this.hostname = hostname;
		AWS.config.update(config);
		this.ddb = new DynamoDB({ apiVersion: CST.AWS_DYNAMO_API_VERSION });
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
			custodian: (data[CST.DB_CUSTODIAN].S || '').toLowerCase(),
			address: (data[CST.DB_ADDRESS].S || '').toLowerCase(),
			code: data[CST.DB_CODE].S || '',
			denomination: Number(data[CST.DB_DENOMINATION].N),
			precisions: {},
			feeSchedules: {}
		};
		if (data[CST.DB_MATURITY]) token.maturity = Number(data[CST.DB_MATURITY].N);

		const precision = data[CST.DB_PRECISIONS].M || {};
		for (const code in precision) token.precisions[code] = Number(precision[code].N);

		const allFees = data[CST.DB_FEE_SCHEDULES].M || {};
		for (const code in allFees) {
			const fee = allFees[code].M;
			if (!fee) continue;
			const parsedFee: IFeeSchedule = {
				rate: Number(fee[CST.DB_RATE].N),
				minimum: Number(fee[CST.DB_MIN].N)
			};
			if (fee[CST.DB_ASSET]) parsedFee.asset = fee[CST.DB_ASSET].S || '';
			token.feeSchedules[code] = parsedFee;
		}

		return token;
	}

	private getTableName(table: string) {
		return `${CST.DB_ISRAFEL}.${this.env}.${table}`;
	}

	public async scanTokens() {
		const data = await this.scanData({
			TableName: this.getTableName(CST.DB_TOKENS)
		});
		if (!data.Items || !data.Items.length) return [];

		return data.Items.map(ob => this.parseToken(ob));
	}

	public async scanIpList() {
		const data = await this.scanData({
			TableName: this.getTableName(CST.DB_IP_LIST)
		});
		const ipList: { [ip: string]: string } = {};
		if (!data.Items || !data.Items.length) return ipList;

		data.Items.forEach(ip => {
			const ipAddr = ip[CST.DB_IP].S || '';
			const color = ip[CST.DB_COLOR].S || '';
			if (ipAddr && color) ipList[ipAddr] = color;
		});
		return ipList;
	}

	public convertIpStatusToDynamo(ipStatus: IIpStatus): AttributeMap {
		return {
			[CST.DB_IP]: { S: ipStatus.ip },
			[CST.DB_COLOR]: { S: ipStatus.color },
		};
	}

	public async addIpList(ipStatus: IIpStatus) {
		return this.putData({
			TableName: this.getTableName(CST.DB_IP_LIST),
			Item: this.convertIpStatusToDynamo(ipStatus)
		});

	}

	public updateStatus(process: string, count: number = 0) {
		const params: PutItemInput = {
			TableName: this.getTableName(CST.DB_STATUS),
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
		return this.putData(params).catch(error => util.logError('Error insert status: ' + error));
	}

	public parseStatus(data: AttributeMap): IStatus {
		const parts = (data[CST.DB_PROCESS].S || '').split('|');
		const status: IStatus = {
			tool: parts[0],
			pair: parts.length > 3 ? `${parts[1]}|${parts[2]}` : parts[1],
			hostname: data[CST.DB_HOSTNAME].S || '',
			updatedAt: Number(data[CST.DB_UPDATED_AT].N)
		};
		const count = data[CST.DB_COUNT] ? Number(data[CST.DB_COUNT].N) : 0;
		if (count) status.count = count;

		return status;
	}

	public async scanStatus(): Promise<IStatus[]> {
		const data = await this.scanData({
			TableName: this.getTableName(CST.DB_STATUS)
		});
		if (!data.Items || !data.Items.length) return [];

		return data.Items.map(ob => this.parseStatus(ob));
	}

	public convertLiveOrderToDynamo(liveOrder: ILiveOrder): AttributeMap {
		return {
			[CST.DB_ACCOUNT]: { S: liveOrder.account },
			[CST.DB_PAIR]: { S: liveOrder.pair },
			[CST.DB_ORDER_HASH]: { S: liveOrder.orderHash },
			[CST.DB_PRICE]: {
				N: util.round(liveOrder.price) + ''
			},
			[CST.DB_AMOUNT]: { N: liveOrder.amount + '' },
			[CST.DB_BALANCE]: { N: liveOrder.balance + '' },
			[CST.DB_MATCHING]: { N: liveOrder.matching + '' },
			[CST.DB_FILL]: { N: liveOrder.fill + '' },
			[CST.DB_SIDE]: { S: liveOrder.side },
			[CST.DB_EXP]: { N: liveOrder.expiry + '' },
			[CST.DB_FEE]: { N: liveOrder.fee + '' },
			[CST.DB_FEE_ASSET]: { S: liveOrder.feeAsset },
			[CST.DB_INITIAL_SEQ]: { N: liveOrder.initialSequence + '' },
			[CST.DB_CURRENT_SEQ]: { N: liveOrder.currentSequence + '' },
			[CST.DB_CREATED_AT]: { N: liveOrder.createdAt + '' },
			[CST.DB_UPDATED_AT]: { N: util.getUTCNowTimestamp() + '' }
		};
	}

	public convertRawOrderToDynamo(rawOrder: IRawOrder): AttributeMap {
		const timestamp = util.getUTCNowTimestamp();
		return {
			[CST.DB_ORDER_HASH]: { S: rawOrder.orderHash },
			[CST.DB_PAIR]: { S: rawOrder.pair },
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

	public addOrder(liveOrder: ILiveOrder, rawOrder: IRawOrder) {
		return this.transactPutData({
			TransactItems: [
				{
					Put: {
						TableName: this.getTableName(CST.DB_LIVE_ORDERS),
						Item: this.convertLiveOrderToDynamo(liveOrder)
					}
				},
				{
					Put: {
						TableName: this.getTableName(CST.DB_RAW_ORDERS),
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
						TableName: this.getTableName(CST.DB_LIVE_ORDERS),
						Key: {
							[CST.DB_PAIR]: {
								S: pair
							},
							[CST.DB_ORDER_HASH]: {
								S: orderHash
							}
						}
					}
				},
				{
					Update: {
						TableName: this.getTableName(CST.DB_RAW_ORDERS),
						Key: {
							[CST.DB_ORDER_HASH]: {
								S: orderHash
							}
						},
						ExpressionAttributeValues: {
							[':' + CST.DB_UPDATED_AT]: { N: util.getUTCNowTimestamp() + '' }
						},
						UpdateExpression: `SET ${CST.DB_UPDATED_AT} = ${':' +
							CST.DB_UPDATED_AT} REMOVE ${CST.DB_0X_SIGNATURE}`
					}
				}
			]
		});
	}

	public async updateLiveOrder(liveOrder: ILiveOrder) {
		return this.updateData({
			TableName: this.getTableName(CST.DB_LIVE_ORDERS),
			Key: {
				[CST.DB_PAIR]: {
					S: liveOrder.pair
				},
				[CST.DB_ORDER_HASH]: {
					S: liveOrder.orderHash
				}
			},
			ExpressionAttributeValues: {
				[':' + CST.DB_BALANCE]: {
					N: liveOrder.balance + ''
				},
				[':' + CST.DB_MATCHING]: {
					N: liveOrder.matching + ''
				},
				[':' + CST.DB_FILL]: {
					N: liveOrder.fill + ''
				},
				[':' + CST.DB_UPDATED_AT]: { N: util.getUTCNowTimestamp() + '' },
				[':' + CST.DB_CURRENT_SEQ]: { N: liveOrder.currentSequence + '' }
			},
			UpdateExpression: `SET ${CST.DB_BALANCE} = ${':' + CST.DB_BALANCE}, ${
				CST.DB_MATCHING
			} = ${':' + CST.DB_MATCHING}, ${CST.DB_FILL} = ${':' + CST.DB_FILL}, ${
				CST.DB_UPDATED_AT
			} = ${':' + CST.DB_UPDATED_AT}, ${CST.DB_CURRENT_SEQ} = ${':' + CST.DB_CURRENT_SEQ} `
		});
	}

	public parseLiveOrder(data: AttributeMap): ILiveOrder {
		return {
			account: data[CST.DB_ACCOUNT].S || '',
			pair: data[CST.DB_PAIR].S || '',
			orderHash: data[CST.DB_ORDER_HASH].S || '',
			price: Number(data[CST.DB_PRICE].N),
			side: data[CST.DB_SIDE].S || '',
			amount: Number(data[CST.DB_AMOUNT].N),
			balance: Number(data[CST.DB_BALANCE].N),
			matching: Number(data[CST.DB_MATCHING].N),
			fill: Number(data[CST.DB_FILL].N),
			expiry: Number(data[CST.DB_EXP].N),
			fee: Number(data[CST.DB_FEE].N),
			feeAsset: data[CST.DB_FEE_ASSET].S || '',
			initialSequence: Number(data[CST.DB_INITIAL_SEQ].N),
			currentSequence: Number(data[CST.DB_CURRENT_SEQ].N),
			createdAt: Number(data[CST.DB_CREATED_AT].N),
			updatedAt: Number(data[CST.DB_UPDATED_AT].N)
		};
	}

	public async getLiveOrders(pair: string, orderHash: string = ''): Promise<ILiveOrder[]> {
		const params: QueryInput = {
			TableName: this.getTableName(CST.DB_LIVE_ORDERS),
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

	public parseRawOrder(data: AttributeMap): IRawOrder {
		return {
			pair: data[CST.DB_PAIR].S || '',
			orderHash: data[CST.DB_ORDER_HASH].S || '',
			signedOrder: {
				signature: data[CST.DB_0X_SIGNATURE] ? data[CST.DB_0X_SIGNATURE].S || '' : '',
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
			TableName: this.getTableName(CST.DB_RAW_ORDERS),
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
		const data: AttributeMap = {
			[CST.DB_ACCOUNT_YM]: {
				S: userOrder.account + '|' + moment.utc(timestamp).format('YYYY-MM')
			},
			[CST.DB_PAIR_OH_SEQ_STATUS]: {
				S: `${userOrder.pair}|${userOrder.orderHash}|${userOrder.currentSequence}|${
					userOrder.status
				}`
			},
			[CST.DB_TYPE]: { S: userOrder.type },
			[CST.DB_PRICE]: {
				N: util.round(userOrder.price) + ''
			},
			[CST.DB_BALANCE]: { N: userOrder.balance + '' },
			[CST.DB_AMOUNT]: { N: userOrder.amount + '' },
			[CST.DB_MATCHING]: { N: userOrder.matching + '' },
			[CST.DB_FILL]: { N: userOrder.fill + '' },
			[CST.DB_SIDE]: { S: userOrder.side },
			[CST.DB_EXP]: { N: userOrder.expiry + '' },
			[CST.DB_FEE]: { N: userOrder.fee + '' },
			[CST.DB_FEE_ASSET]: { S: userOrder.feeAsset },
			[CST.DB_INITIAL_SEQ]: { N: userOrder.initialSequence + '' },
			[CST.DB_CREATED_AT]: { N: userOrder.createdAt + '' },
			[CST.DB_UPDATED_AT]: { N: timestamp + '' },
			[CST.DB_UPDATED_BY]: { S: userOrder.updatedBy + '' },
			[CST.DB_PROCESSED]: { BOOL: userOrder.processed }
		};
		if (userOrder.transactionHash) data[CST.DB_TX_HASH] = { S: userOrder.transactionHash };
		return data;
	}

	public addUserOrder(userOrder: IUserOrder) {
		return this.putData({
			TableName: this.getTableName(CST.DB_USER_ORDERS),
			Item: this.convertUserOrderToDynamo(userOrder)
		});
	}

	public parseUserOrder(data: AttributeMap): IUserOrder {
		const [code1, code2, orderHash, seq, status] = (
			data[CST.DB_PAIR_OH_SEQ_STATUS].S || ''
		).split('|');
		const userOrder: IUserOrder = {
			account: (data[CST.DB_ACCOUNT_YM].S || '').split('|')[0],
			pair: `${code1}|${code2}`,
			type: data[CST.DB_TYPE].S || '',
			status: status,
			orderHash: orderHash,
			price: Number(data[CST.DB_PRICE].N),
			side: data[CST.DB_SIDE].S || '',
			amount: Number(data[CST.DB_AMOUNT].N),
			balance: Number(data[CST.DB_BALANCE].N),
			matching: Number(data[CST.DB_MATCHING].N),
			fill: Number(data[CST.DB_FILL].N),
			expiry: Number(data[CST.DB_EXP].N),
			fee: Number(data[CST.DB_FEE].N),
			feeAsset: data[CST.DB_FEE_ASSET].S || '',
			initialSequence: Number(data[CST.DB_INITIAL_SEQ].N),
			currentSequence: Number(seq),
			createdAt: Number(data[CST.DB_CREATED_AT].N),
			updatedAt: Number(data[CST.DB_UPDATED_AT].N),
			updatedBy: data[CST.DB_UPDATED_BY].S || '',
			processed: !!data[CST.DB_PROCESSED].BOOL
		};
		if (data[CST.DB_TX_HASH]) userOrder.transactionHash = data[CST.DB_TX_HASH].S;
		return userOrder;
	}

	public async getUserOrders(account: string, start: number, end: number = 0, pair: string = '') {
		if (!end) end = util.getUTCNowTimestamp();
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
			TableName: this.getTableName(CST.DB_USER_ORDERS),
			KeyConditionExpression: `${CST.DB_ACCOUNT_YM} = :${CST.DB_ACCOUNT_YM}`,
			ExpressionAttributeValues: {
				[':' + CST.DB_ACCOUNT_YM]: {
					S: `${account}|${yearMonth}`
				}
			}
		};
		if (pair) {
			params.KeyConditionExpression += ` AND ${
				CST.DB_PAIR_OH_SEQ_STATUS
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
			[CST.DB_PAIR_DATE_HOUR]: {
				S: trade.pair + '|' + moment.utc(trade.timestamp).format('YYYY-MM-DD-HH')
			},
			[CST.DB_TS_TX_HASH]: { S: trade.timestamp + '|' + trade.transactionHash },
			[CST.DB_FEE_ASSET]: { S: trade.feeAsset },
			[CST.DB_TK_OH]: { S: trade.taker.orderHash },
			[CST.DB_TK_ADDR]: { S: trade.taker.address },
			[CST.DB_TK_SIDE]: { S: trade.taker.side },
			[CST.DB_TK_PX]: { N: trade.taker.price + '' },
			[CST.DB_TK_AMT]: { N: trade.taker.amount + '' },
			[CST.DB_TK_FEE]: { N: trade.taker.fee + '' },
			[CST.DB_MK_OH]: { S: trade.maker.orderHash },
			[CST.DB_MK_PX]: { N: trade.maker.price + '' },
			[CST.DB_MK_AMT]: { N: trade.maker.amount + '' },
			[CST.DB_MK_FEE]: { N: trade.maker.fee + '' }
		};
	}

	public addTrade(trade: ITrade) {
		return this.putData({
			TableName: this.getTableName(CST.DB_TRADES),
			Item: this.convertTradeToDynamo(trade)
		});
	}

	public parseTrade(data: AttributeMap): ITrade {
		const [code1, code2] = (data[CST.DB_PAIR_DATE_HOUR].S || '').split('|');
		const [tsString, txHash] = (data[CST.DB_TS_TX_HASH].S || '').split('|');
		return {
			pair: code1 + '|' + code2,
			timestamp: Number(tsString),
			transactionHash: txHash,
			feeAsset: data[CST.DB_FEE_ASSET].S || '',
			taker: {
				orderHash: data[CST.DB_TK_OH].S || '',
				address: data[CST.DB_TK_ADDR].S || '',
				side: data[CST.DB_TK_SIDE].S || '',
				price: Number(data[CST.DB_TK_PX].N),
				amount: Number(data[CST.DB_TK_AMT].N),
				fee: Number(data[CST.DB_TK_FEE].N)
			},
			maker: {
				orderHash: data[CST.DB_MK_OH].S || '',
				price: Number(data[CST.DB_MK_PX].N),
				amount: Number(data[CST.DB_MK_AMT].N),
				fee: Number(data[CST.DB_MK_FEE].N)
			}
		};
	}

	public async getTrades(pair: string, start: number, end: number = 0) {
		if (!end) end = util.getUTCNowTimestamp();
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
			TableName: this.getTableName(CST.DB_TRADES),
			KeyConditionExpression: `${CST.DB_PAIR_DATE_HOUR} = :${CST.DB_PAIR_DATE_HOUR}`,
			ExpressionAttributeValues: {
				[':' + CST.DB_PAIR_DATE_HOUR]: {
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
