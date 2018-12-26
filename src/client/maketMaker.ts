import {
	IOption
} from '../common/types';
import util from '../utils/util';

class MarketMaker {
	public startProcessing(config: object, option: IOption) {
		util.logInfo(config);
		util.logInfo(option);
	}
}

const marketMaker = new MarketMaker();
export default marketMaker;
