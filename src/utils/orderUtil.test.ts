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

test('parseSignedOrder', () =>
	expect(orderUtil.parseSignedOrder(signedOrder)).toMatchSnapshot());

const takerFlat = {
	address: 'takerAddress',
	code: 'takerCode',
	denomination: 1,
	precision: {
		makerCode: 0.000005
	},
	fee: {
		makerCode: {
			rate: 0,
			minimum: 1
		}
	}
};

const makerFlat = {
	address: 'makerAddress',
	code: 'makerCode',
	denomination: 1,
	precision: {
		takerCode: 0.000005
	},
	fee: {
		takerCode: {
			rate: 0,
			minimum: 1
		}
	}
};

const takerRatio = {
	address: 'takerAddress',
	code: 'takerCode',
	denomination: 1,
	precision: {
		makerCode: 0.000005
	},
	fee: {
		makerCode: {
			rate: 0.01,
			minimum: 1
		}
	}
};

const makerRatio = {
	address: 'makerAddress',
	code: 'makerCode',
	denomination: 1,
	precision: {
		takerCode: 0.000005
	},
	fee: {
		takerCode: {
			rate: 0.01,
			minimum: 1
		}
	}
};

test('constructNewLiveOrder bid flat', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_BID);
	expect(
		orderUtil.constructNewLiveOrder(
			signedOrder,
			takerFlat,
			'takerCode|makerCode',
			'0xOrderHash'
		)
	).toMatchSnapshot();
});

test('constructNewLiveOrder ask flat', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_ASK);
	expect(
		orderUtil.constructNewLiveOrder(
			signedOrder,
			makerFlat,
			'makerCode|takerCode',
			'0xOrderHash'
		)
	).toMatchSnapshot();
});

test('constructNewLiveOrder bid ratio', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_BID);
	expect(
		orderUtil.constructNewLiveOrder(
			signedOrder,
			takerRatio,
			'takerCode|makerCode',
			'0xOrderHash'
		)
	).toMatchSnapshot();
});

test('constructNewLiveOrder ask ratio', () => {
	util.getUTCNowTimestamp = jest.fn(() => 1234567890);
	Web3Util.getSideFromSignedOrder = jest.fn(() => CST.DB_ASK);
	expect(
		orderUtil.constructNewLiveOrder(
			signedOrder,
			makerRatio,
			'makerCode|takerCode',
			'0xOrderHash'
		)
	).toMatchSnapshot();
});
