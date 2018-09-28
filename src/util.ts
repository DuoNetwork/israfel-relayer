import { BigNumber } from '0x.js';
import moment from 'moment';
import * as os from 'os';
import * as CST from './constants';
import { IOption } from './types';

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

	public getRandomFutureDateInSeconds() {
		return new BigNumber(Date.now() + CST.TEN_MINUTES_MS).div(CST.ONE_SECOND_MS).ceil();
	}

	public stringToBN(value: string): BigNumber {
		return new BigNumber(value);
	}

	public defaultOption: IOption = {
		token: 'ZRX',
		amount: 1,
		maker: 0,
		spender: 1
	};

	public parseOptions(argv: string[]): IOption {
		const option: IOption = this.defaultOption;

		for (let i = 3; i < argv.length; i++) {
			const args = argv[i].split('=');
			switch (args[0]) {
				case 'token':
					option.token = args[1] || option.token;
					break;
				case 'amount':
					option.amount = Number(args[1]) || option.amount;
					break;
				case 'maker':
					option.maker = Number(args[1]) || option.maker;
					break;
				case 'spender':
					option.maker = Number(args[1]) || option.spender;
					break;
				default:
					break;
			}
		}

		return option;
	}
}

const util = new Util();
export default util;
