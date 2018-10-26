// import {BigNumber} from '0x.js';
// import { Web3Wrapper } from '@0xproject/web3-wrapper';
import { IStringSignedOrder } from '../common/types';
import assetUtil from './assetUtil';
import Web3Util from './web3Util';

const web3Util = new Web3Util();

test('getTokenAddressFromName', async () => {
	await assetUtil.init(web3Util);
	expect(assetUtil.getTokenAddressFromName('ZRX')).toMatchSnapshot();
	expect(assetUtil.getTokenAddressFromName('WETH')).toMatchSnapshot();
	expect(assetUtil.getTokenAddressFromName('')).toMatchSnapshot();
});

const rawOrder: IStringSignedOrder = {
	exchangeAddress: '0x48bacb9266a570d521063ef5dd96e61686dbe788',
	makerAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
	takerAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
	senderAddress: '0xa8dda8d7f5310e4a9e24f8eba77e091ac264f872',
	feeRecipientAddress: '0x5409ed021d9299bf6814279a6a1411a7e866a631',
	expirationTimeSeconds: 'BigNumber { s": 1, e": 9, c": [ 1538117918 ] }',
	salt:
		'BigNumber {s": 1,e": 76,c":[ 4819806,21385749514209,88700844036866,26535141779564,49454803591044,15105341483720 ] }',
	makerAssetAmount: 'BigNumber { s": 1, e": 18, c": [ 63530 ] }',
	takerAssetAmount: 'BigNumber { s": 1, e": 17, c": [ 8450 ] }',
	makerAssetData: '0xf47261b0000000000000000000000000871dd7c2b4b25e1aa18728e9d5f2af4c4e431f5c',
	takerAssetData: '0xf47261b00000000000000000000000000b1ba0af832d7c05fd64161e0db78e85978e8082',
	makerFee: 'BigNumber { s": 1, e": 0, c": [ 0 ] }',
	takerFee: 'BigNumber { s": 1, e": 0, c": [ 0 ] }',
	signature: ''
};
const pair = 'ZRX-WETH';

// test('getSideFromSignedOrder', async () => {
// 	expect(assetUtil.getSideFromSignedOrder(rawOrder, pair)).toMatchInlineSnapshot();
// });
