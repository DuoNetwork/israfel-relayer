import moment from 'moment';
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

	public async retry(fn: any, delay: number, times: number): Promise<boolean> {
		let done = false;
		while (times > 0 && !done)
			try {
				times--;
				util.logDebug('retrying : ' + times);
				await fn();
				done = true;
			} catch (err) {
				util.sleep(delay);
			}
		if (!done) return true;
		else return false;
	}

	public defaultOption: IOption = {
		live: false,
		token: 'ZRX',
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
		option.live = argv.includes('live');
		option.server = argv.includes('server');
		option.debug = argv.includes('debug');
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
					option.spender = Number(args[1]) || option.spender;
					break;
				default:
					break;
			}
		}

		return option;
	}

	public round(num: string | number) {
		return +(Math.floor((num + 'e+8') as any) + 'e-8');
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
}

const util = new Util();
export default util;
