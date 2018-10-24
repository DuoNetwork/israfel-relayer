import * as os from 'os';

class OsUtil {
	public getHostName() {
		return os.hostname();
	}
}

const osUtil = new OsUtil();
export default osUtil;
