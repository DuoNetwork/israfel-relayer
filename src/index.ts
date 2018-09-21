import * as CST from './constants';

import assetsUtil from './assetsUtil';
import util from './util';

const tool = process.argv[2];

util.log('tool ' + tool);

const option = util.parseOptions(process.argv);

switch (tool) {
	case CST.CMD_MODIFY_STATE:
		assetsUtil.setTokenAllowance(option);
		break;
	default:
		break;
}
