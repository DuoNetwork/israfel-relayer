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
