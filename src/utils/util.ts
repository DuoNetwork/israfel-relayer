import { Constants } from '@finbook/israfel-common';
import { IOption } from '../common/types';

export default class Util {
	public static defaultOption: IOption = {
		env: Constants.DB_DEV,
		tokens: [],
		token: '',
		debug: false,
		server: false
	};

	public static parseOptions(argv: string[]): IOption {
		const option: IOption = this.defaultOption;
		option.server = argv.includes('server');
		option.debug = argv.includes('debug');
		for (let i = 3; i < argv.length; i++) {
			const args = argv[i].split('=');
			switch (args[0]) {
				case 'env':
					option.env = [Constants.DB_LIVE, Constants.DB_UAT].includes(args[1])
						? args[1]
						: option.env;
					break;
				case 'tokens':
					option.tokens = args[1].split(',');
					break;
				case 'token':
					option.token = args[1] || option.token;
					break;
				default:
					break;
			}
		}

		return option;
	}
}
