import moment, { DurationInputArg2 } from 'moment';
import WebSocket from 'ws';
import * as CST from '../common/constants';
import { IOption } from '../common/types';

class Util {
	public logLevel: string = CST.LOG_INFO;

	public logInfo(text: any): void {
		this.log(text, CST.LOG_INFO);
	}

	public logDebug(text: any): void {
		this.log(text, CST.LOG_DEBUG);
	}

	public logError(text: any): void {
		this.log(text, CST.LOG_ERROR);
	}

	private log(text: any, level: string): void {
		if (CST.LOG_RANKING[this.logLevel] >= CST.LOG_RANKING[level])
			console.log(`${moment().format('HH:mm:ss.SSS')} [${level}]: ` + text);
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

	public defaultOption: IOption = {
		env: CST.DB_DEV,
		tokens: [],
		token: '',
		amount: 1,
		maker: 0,
		spender: 1,
		debug: false,
		server: false
	};

	public getUTCNowTimestamp() {
		return moment().valueOf();
	}

	public parseOptions(argv: string[]): IOption {
		const option: IOption = this.defaultOption;
		option.server = argv.includes('server');
		option.debug = argv.includes('debug');
		for (let i = 3; i < argv.length; i++) {
			const args = argv[i].split('=');
			switch (args[0]) {
				case 'env':
					option.env = [CST.DB_LIVE, CST.DB_UAT].includes(args[1]) ? args[1] : option.env;
					break;
				case 'tokens':
					option.tokens = args[1].split(',');
					break;
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
					option.spender = Number(args[1]) || option.spender;
					break;
				default:
					break;
			}
		}

		return option;
	}

	public round(num: string | number) {
		return +(Math.round((num + 'e+8') as any) + 'e-8');
	}

	public safeWsSend(ws: WebSocket, message: string) {
		try {
			ws.send(message);
			return true;
		} catch (error) {
			this.logError(error);
			return false;
		}
	}

	public sleep(ms: number) {
		return new Promise(resolve => {
			setTimeout(resolve, ms);
		});
	}

	public clone(obj: object) {
		return JSON.parse(JSON.stringify(obj));
	}

	public getDates(length: number, step: number, stepSize: DurationInputArg2, format: string) {
		const dates: string[] = [];
		const date = moment.utc(this.getUTCNowTimestamp());
		for (let i = 0; i < length; i++) {
			dates.push(date.format(format));
			date.subtract(step, stepSize);
		}
		dates.sort((a, b) => a.localeCompare(b));

		return dates;
	}

	public getMonthEndExpiry(timestamp: number) {
		const dateObj = moment
			.utc(timestamp)
			.endOf('month')
			.startOf('day');
		const day = dateObj.day();
		if (day === 6) dateObj.subtract(1, 'day');
		else if (day < 5) dateObj.subtract(day + 2, 'day');

		dateObj.add(8, 'hour');

		return dateObj.valueOf();
	}

	public getDayExpiry(timestamp: number) {
		const dateObj = moment.utc(timestamp).startOf('day');
		dateObj.add(8, 'hour');

		return dateObj.valueOf();
	}

	public getExpiryTimestamp(isMonth: boolean) {
		const now = this.getUTCNowTimestamp();
		if (isMonth) {
			const thisMonthEndExpiry = this.getMonthEndExpiry(now);
			if (now > thisMonthEndExpiry - 4 * 3600000)
				return this.getMonthEndExpiry(
					moment
						.utc(thisMonthEndExpiry)
						.add(1, 'week')
						.valueOf()
				);
			return thisMonthEndExpiry;
		} else {
			const todayExpiry = this.getDayExpiry(now);
			if (now > todayExpiry - 4 * 3600000) return todayExpiry + 24 * 3600000;
			return todayExpiry;
		}
	}

	public formatFixedNumber(num: number, precision: number) {
		const decimal = precision && precision < 1 ? (precision + '').length - 2 : 0;
		const roundedNumber = Math.round(Number(num) / precision) * precision;
		return precision ? roundedNumber.toFixed(decimal) : num + '';
	}
}

const util = new Util();
export default util;
