import moment from 'moment';
import * as os from 'os';

class Util {
	public log(text: any): void {
		console.log(moment().format('HH:mm:ss.SSS') + ' ' + text);
	}

	public isNumber(input: any): boolean {
		const num = Number(input);
		return isFinite(num) && !isNaN(num);
	}

	public isEmptyObject(obj: object | undefined | null): boolean {
		if (!obj) return true;

		for (const prop in obj) if (obj.hasOwnProperty(prop)) return false;

		return true;
	}

	public getHostName() {
		return os.hostname();
	}

}

const util = new Util();
export default util;
