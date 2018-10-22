import dynamoUtil from './dynamoUtil';

import { IOption } from './types';

class IdentityUtil {
	public async init(tool: string, option: IOption) {
		const config = require('./keys/' + (option.live ? 'live' : 'dev') + '/dynamo.json');
		dynamoUtil.init(config, option.live, tool);
	}

	public async getCurrentId(pair: string): Promise<string> {
		const res = await dynamoUtil.getCurrentId(pair);
		try {
			await dynamoUtil.conditionalPutIdentity(pair, res, Number(res) + 1 + '');

			return res;
		} catch (err) {
			console.log('failed, please retry');
			return '';
		}
	}
}
const identityUtil = new IdentityUtil();
export default identityUtil;
