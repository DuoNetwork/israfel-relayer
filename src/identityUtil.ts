import dynamoUtil from './dynamoUtil';

import { IOption } from './types';

class IdentityUtil {
	public async init(tool: string, option: IOption) {
		const config = require('./keys/' + (option.live ? 'live' : 'dev') + '/dynamo.json');
		dynamoUtil.init(config, option.live, tool);
	}

	public async getCurrentId() {
		const res = await dynamoUtil.getCurrentId('ZRX-WETH');
		// console.log(res);
		try {
			await dynamoUtil.conditionalPutIdentity('ZRX-WETH', res, Number(res) + 1 + '');
			return res;
		} catch (err) {
			console.log('failed');
			return '';
		}
	}
}
const identityUtil = new IdentityUtil();
export default identityUtil;
