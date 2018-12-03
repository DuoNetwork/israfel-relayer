// fix for @ledgerhq/hw-transport-u2f 4.28.0
import '@babel/polyfill';

import * as CST from '../common/constants';
import orderUtil from './orderUtil';
import util from './util';
import Web3Util from './Web3Util';

const signedOrder = {
	senderAddress: 'senderAddress',
	makerAddress: 'makerAddress',
	takerAddress: 'takerAddress',
	makerFee: '0',
	takerFee: '0',
	makerAssetAmount: '123000000000000000000',
	takerAssetAmount: '456000000000000000000',
	makerAssetData: 'makerAssetData',
	takerAssetData: 'takerAssetData',
	salt: '789',
	exchangeAddress: 'exchangeAddress',
	feeRecipientAddress: 'feeRecipientAddress',
	expirationTimeSeconds: '1234567890',
	signature: 'signature'
};

test('parseSignedOrder', () => expect(orderUtil.parseSignedOrder(signedOrder)).toMatchSnapshot());

test('constructNewLiveOrder bid', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_BID);
	expect(
		orderUtil.constructNewLiveOrder(
			signedOrder,
			{
				custodian: 'custodian',
				address: 'takerAddress',
				code: 'takerCode',
				denomination: 1,
				precisions: {
					makerCode: 0.000005
				},
				feeSchedules: {
					makerCode: {
						rate: 0,
						minimum: 1
					}
				}
			},
			'takerCode|makerCode',
			'0xOrderHash'
		)
	).toMatchSnapshot();
});

test('constructNewLiveOrder ask', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_ASK);
	expect(
		orderUtil.constructNewLiveOrder(
			signedOrder,
			{
				custodian: 'custodian',
				address: 'makerAddress',
				code: 'makerCode',
				denomination: 1,
				precisions: {
					takerCode: 0.000005
				},
				feeSchedules: {
					takerCode: {
						rate: 0,
						minimum: 1
					}
				}
			},
			'makerCode|takerCode',
			'0xOrderHash'
		)
	).toMatchSnapshot();
});

test('getPriceBeforeFee bid flat', () => {
	expect(
		orderUtil.getPriceBeforeFee(
			123,
			456,
			{
				rate: 0,
				minimum: 1
			},
			true
		)
	).toMatchSnapshot();
});

test('getPriceBeforeFee ask flat', () => {
	expect(
		orderUtil.getPriceBeforeFee(
			123,
			456,
			{
				rate: 0,
				minimum: 1
			},
			false
		)
	).toMatchSnapshot();
});

test('getPriceBeforeFee bid ratio', () => {
	expect(
		orderUtil.getPriceBeforeFee(
			123,
			456,
			{
				rate: 0.01,
				minimum: 1
			},
			true
		)
	).toMatchSnapshot();
});

test('getPriceBeforeFee ask ratio', () => {
	expect(
		orderUtil.getPriceBeforeFee(
			123,
			456,
			{
				rate: 0.01,
				minimum: 1
			},
			false
		)
	).toMatchSnapshot();
});

test('getPriceBeforeFee bid base flat', () => {
	expect(
		orderUtil.getPriceBeforeFee(
			123,
			456,
			{
				asset: 'asset',
				rate: 0,
				minimum: 1
			},
			true
		)
	).toMatchSnapshot();
});

test('getPriceBeforeFee ask base flat', () => {
	expect(
		orderUtil.getPriceBeforeFee(
			123,
			456,
			{
				asset: 'asset',
				rate: 0,
				minimum: 1
			},
			false
		)
	).toMatchSnapshot();
});

test('getPriceBeforeFee bid base ratio', () => {
	expect(
		orderUtil.getPriceBeforeFee(
			123,
			456,
			{
				asset: 'asset',
				rate: 0.01,
				minimum: 1
			},
			true
		)
	).toMatchSnapshot();
});

test('getPriceBeforeFee ask base ratio', () => {
	expect(
		orderUtil.getPriceBeforeFee(
			123,
			456,
			{
				asset: 'asset',
				rate: 0.01,
				minimum: 1
			},
			false
		)
	).toMatchSnapshot();
});

test('getFillBeforeFee bid flat', () => {
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_BID);
	expect(
		orderUtil.getFillBeforeFee(
			signedOrder,
			56,
			{
				custodian: 'custodian',
				address: 'takerAddress',
				code: 'takerTokenCode',
				denomination: 1,
				precisions: {},
				feeSchedules: {
					makerTokenCode: {
						rate: 0,
						minimum: 1
					}
				}
			},
			'takerTokenCode|makerTokenCode'
		)
	).toMatchSnapshot();
});

test('getFillBeforeFee bid ratio', () => {
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_BID);
	expect(
		orderUtil.getFillBeforeFee(
			signedOrder,
			56,
			{
				custodian: 'custodian',
				address: 'takerAddress',
				code: 'takerTokenCode',
				denomination: 1,
				precisions: {},
				feeSchedules: {
					makerTokenCode: {
						rate: 0.01,
						minimum: 1
					}
				}
			},
			'takerTokenCode|makerTokenCode'
		)
	).toMatchSnapshot();
});

test('getFillBeforeFee ask flat', () => {
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_ASK);
	expect(
		orderUtil.getFillBeforeFee(
			signedOrder,
			56,
			{
				custodian: 'custodian',
				address: 'makerAddress',
				code: 'makerTokenCode',
				denomination: 1,
				precisions: {},
				feeSchedules: {
					takerTokenCode: {
						rate: 0,
						minimum: 1
					}
				}
			},
			'makerTokenCode|takerTokenCode'
		)
	).toMatchSnapshot();
});

test('getFillBeforeFee ask ratio', () => {
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_ASK);
	expect(
		orderUtil.getFillBeforeFee(
			signedOrder,
			56,
			{
				custodian: 'custodian',
				address: 'makerAddress',
				code: 'makerTokenCode',
				denomination: 1,
				precisions: {},
				feeSchedules: {
					takerTokenCode: {
						rate: 0.01,
						minimum: 1
					}
				}
			},
			'makerTokenCode|takerTokenCode'
		)
	).toMatchSnapshot();
});

test('getFillBeforeFee bid base flat', () => {
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_BID);
	expect(
		orderUtil.getFillBeforeFee(
			signedOrder,
			56,
			{
				custodian: 'custodian',
				address: 'takerAddress',
				code: 'takerTokenCode',
				denomination: 1,
				precisions: {},
				feeSchedules: {
					makerTokenCode: {
						asset: 'makerTokenCode',
						rate: 0,
						minimum: 1
					}
				}
			},
			'takerTokenCode|makerTokenCode'
		)
	).toMatchSnapshot();
});

test('getFillBeforeFee bid base ratio', () => {
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_BID);
	expect(
		orderUtil.getFillBeforeFee(
			signedOrder,
			56,
			{
				custodian: 'custodian',
				address: 'takerAddress',
				code: 'takerTokenCode',
				denomination: 1,
				precisions: {},
				feeSchedules: {
					makerTokenCode: {
						asset: 'maketTokenCode',
						rate: 0.01,
						minimum: 1
					}
				}
			},
			'takerTokenCode|makerTokenCode'
		)
	).toMatchSnapshot();
});

test('getFillBeforeFee ask base flat', () => {
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_ASK);
	expect(
		orderUtil.getFillBeforeFee(
			signedOrder,
			56,
			{
				custodian: 'custodian',
				address: 'makerAddress',
				code: 'makerTokenCode',
				denomination: 1,
				precisions: {},
				feeSchedules: {
					takerTokenCode: {
						asset: 'takerTokenCode',
						rate: 0,
						minimum: 1
					}
				}
			},
			'makerTokenCode|takerTokenCode'
		)
	).toMatchSnapshot();
});

test('getFillBeforeFee ask base ratio', () => {
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_ASK);
	expect(
		orderUtil.getFillBeforeFee(
			signedOrder,
			56,
			{
				custodian: 'custodian',
				address: 'makerAddress',
				code: 'makerTokenCode',
				denomination: 1,
				precisions: {},
				feeSchedules: {
					takerTokenCode: {
						asset: 'takerTokenCode',
						rate: 0.01,
						minimum: 1
					}
				}
			},
			'makerTokenCode|takerTokenCode'
		)
	).toMatchSnapshot();
});

test('getAmountAfterFee bid flat', () => {
	expect(
		orderUtil.getAmountAfterFee(
			100,
			0.01,
			{
				rate: 0,
				minimum: 1
			},
			true
		)
	).toMatchSnapshot();
});

test('getAmountAfterFee bid ratio', () => {
	expect(
		orderUtil.getAmountAfterFee(
			100,
			0.01,
			{
				rate: 0.01,
				minimum: 1
			},
			true
		)
	).toMatchSnapshot();
});

test('getAmountAfterFee ask flat', () => {
	expect(
		orderUtil.getAmountAfterFee(
			100,
			0.01,
			{
				rate: 0,
				minimum: 1
			},
			false
		)
	).toMatchSnapshot();
});

test('getAmountAfterFee ask ratio', () => {
	expect(
		orderUtil.getAmountAfterFee(
			100,
			0.01,
			{
				rate: 0.01,
				minimum: 1
			},
			false
		)
	).toMatchSnapshot();
});

test('getAmountAfterFee bid base flat', () => {
	expect(
		orderUtil.getAmountAfterFee(
			100,
			0.01,
			{
				asset: 'asset',
				rate: 0,
				minimum: 0.01
			},
			true
		)
	).toMatchSnapshot();
});

test('getAmountAfterFee bid base ratio', () => {
	expect(
		orderUtil.getAmountAfterFee(
			150,
			0.01,
			{
				asset: 'asset',
				rate: 0.01,
				minimum: 0.01
			},
			true
		)
	).toMatchSnapshot();
});

test('getAmountAfterFee ask base flat', () => {
	expect(
		orderUtil.getAmountAfterFee(
			150,
			0.01,
			{
				asset: 'asset',
				rate: 0,
				minimum: 0.01
			},
			false
		)
	).toMatchSnapshot();
});

test('getAmountAfterFee ask base ratio', () => {
	expect(
		orderUtil.getAmountAfterFee(
			150,
			0.01,
			{
				asset: 'asset',
				rate: 0.01,
				minimum: 0.01
			},
			false
		)
	).toMatchSnapshot();
});

test('validateOrder passed token maturity', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	expect(
		await orderUtil.validateOrder(
			{} as any,
			'code1|code2',
			{
				maturity: 1234567890 + 180000
			} as any,
			{} as any
		)
	).toBe('');
});

test('validateOrder passed order expiry', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890000 - 180000);
	expect(await orderUtil.validateOrder({} as any, 'code1|code2', {} as any, signedOrder)).toBe(
		''
	);
});

test('validateOrder invalid 0x order', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	const validateOrder = jest.fn(() => Promise.resolve(''));
	expect(
		await orderUtil.validateOrder(
			{
				validateOrder: validateOrder
			} as any,
			'code1|code2',
			{} as any,
			signedOrder
		)
	).toBe('');
	expect(validateOrder).toBeCalled();
});

test('validateOrder invalid 0x order', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	const validateOrder = jest.fn(() => Promise.resolve(''));
	expect(
		await orderUtil.validateOrder(
			{
				validateOrder: validateOrder
			} as any,
			'code1|code2',
			{} as any,
			signedOrder
		)
	).toBe('');
	expect(validateOrder).toBeCalled();
});

test('validateOrder invalid amount', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	const validateOrder = jest.fn(() => Promise.resolve('0xOrderHash'));
	orderUtil.constructNewLiveOrder = jest.fn(() => ({
		amount: 1.1
	}));
	expect(
		await orderUtil.validateOrder(
			{
				validateOrder: validateOrder
			} as any,
			'code1|code2',
			{
				denomination: 1
			} as any,
			signedOrder
		)
	).toBe('');
	expect(validateOrder).toBeCalled();
	expect(orderUtil.constructNewLiveOrder as jest.Mock).toBeCalled();
});

test('validateOrder invalid price', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	const validateOrder = jest.fn(() => Promise.resolve('0xOrderHash'));
	orderUtil.constructNewLiveOrder = jest.fn(() => ({
		amount: 1,
		price: 0.00055
	}));
	expect(
		await orderUtil.validateOrder(
			{
				validateOrder: validateOrder
			} as any,
			'code1|code2',
			{
				denomination: 1,
				precisions: {
					code2: 0.0005
				}
			} as any,
			signedOrder
		)
	).toBe('');
	expect(validateOrder).toBeCalled();
	expect(orderUtil.constructNewLiveOrder as jest.Mock).toBeCalled();
});

test('validateOrder', async () => {
	util.getUTCNowTimestamp = jest.fn(() => 123456789);
	const validateOrder = jest.fn(() => Promise.resolve('0xOrderHash'));
	orderUtil.constructNewLiveOrder = jest.fn(() => ({
		amount: 10.000000004,
		price: 0.005000004
	}));
	expect(
		await orderUtil.validateOrder(
			{
				validateOrder: validateOrder
			} as any,
			'code1|code2',
			{
				denomination: 1,
				precisions: {
					code2: 0.0005
				}
			} as any,
			signedOrder
		)
	).toBe('0xOrderHash');
	expect(validateOrder).toBeCalled();
	expect(orderUtil.constructNewLiveOrder as jest.Mock).toBeCalled();
});
