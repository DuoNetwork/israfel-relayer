import child_process from 'child_process';
import { IOption, ISubProcess, IToken } from '../common/types';
import dynamoUtil from '../utils/dynamoUtil';
import util from '../utils/util';
import Web3Util from '../utils/Web3Util';

class ServerMasterUtil {
	public subProcesses: { [key: string]: ISubProcess } = {};

	public async startLaunching(
		web3Util: Web3Util,
		tool: string,
		option: IOption,
		startServer: (web3Util: Web3Util, option: IOption) => any
	): Promise<void> {
		const tokens: IToken[] = await dynamoUtil.scanTokens();

		if (option.token) {
			const rawToken = tokens.find(t => t.code === option.token);
			if (!rawToken) throw new Error('invalid token specified');

			util.logInfo(
				`[${option.token}]:` + 'start launching orderBookServer for pair ' + option.token
			);
			startServer(web3Util, option);
		} else if (!option.tokens.length) {
			util.logInfo('launching all pairs ' + tokens.map(token => token.code).join(','));
			for (const token of tokens) {
				await util.sleep(1000);
				this.subProcesses[token.code] = {
					token: token.code,
					lastFailTimestamp: 0,
					failCount: 0,
					instance: undefined as any
				};
				this.launchTokenPair(tool, token.code, option);
			}
		} else if (option.tokens.length)
			for (const token of option.tokens) {
				const rawToken = tokens.find(t => t.code === token);
				if (!rawToken) throw new Error('invalid token specified');

				util.logInfo(`[${token}]:` + 'start launching orderBookServer for pair ' + token);
				await util.sleep(1000);
				this.subProcesses[token] = {
					token: token,
					lastFailTimestamp: 0,
					failCount: 0,
					instance: undefined as any
				};
				this.launchTokenPair(tool, token, option);
			}
	}

	public launchTokenPair(tool: string, token: string, option: IOption) {
		const cmd =
			`npm run ${tool} token=${token} ${option.server ? ' server' : ''}${
				option.debug ? ' debug' : ''
			}` +
			(process.platform === 'win32' ? ' >>' : ' &>') +
			` ${tool}.${token}.log`;

		util.logInfo(`[${token}]: ${cmd}`);

		const procInstance = child_process.exec(
			cmd,
			process.platform === 'win32' ? {} : { shell: '/bin/bash' }
		);

		this.subProcesses[token].instance = procInstance;
		this.subProcesses[token].lastFailTimestamp = util.getUTCNowTimestamp();

		if (!procInstance) {
			util.logError('Failed to launch ' + token);
			this.retry(tool, option, token);
		} else {
			util.logInfo(`[${token}]: Launched ${tool}`);
			procInstance.on('exit', code => {
				util.logError(`[${token}]: Exit with code ${token}`);
				if (code) this.retry(tool, option, token);
			});
		}
	}

	public retry(tool: string, option: IOption, token: string) {
		const now: number = util.getUTCNowTimestamp();

		if (now - this.subProcesses[token].lastFailTimestamp < 30000)
			this.subProcesses[token].failCount++;
		else this.subProcesses[token].failCount = 1;

		this.subProcesses[token].lastFailTimestamp = now;

		if (this.subProcesses[token].failCount < 3)
			setTimeout(() => this.launchTokenPair(tool, token, option), 5000);
		else util.logError('Retry Aborted ' + token);
	}
}

const serverMasterUtil = new ServerMasterUtil();
export default serverMasterUtil;
