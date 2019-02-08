import { IToken, Util } from '@finbook/israfel-common';
import child_process from 'child_process';
import { IOption, ISubProcess } from '../common/types';
import dynamoUtil from './dynamoUtil';
import osUtil from './osUtil';

class ServerMasterUtil {
	public subProcesses: { [key: string]: ISubProcess } = {};

	public async startLaunching(
		tool: string,
		option: IOption,
		startServer: (option: IOption) => any
	): Promise<void> {
		const tokens: IToken[] = await dynamoUtil.scanTokens();

		if (option.token && startServer) {
			const rawToken = tokens.find(t => t.code === option.token);
			if (!rawToken) throw new Error('invalid token specified');

			Util.logInfo(`[${option.token}]: start launching ${tool}`);
			startServer(option);
		} else {
			Util.logInfo('launching all pairs ' + tokens.map(token => token.code).join(','));
			for (const token of tokens) {
				if (option.tokens.length && !option.tokens.includes(token.code)) continue;
				Util.logInfo(`[${token.code}]: start launching ${tool}`);
				await Util.sleep(1000);
				this.subProcesses[token.code] = {
					token: token.code,
					lastFailTimestamp: 0,
					failCount: 0,
					instance: undefined as any
				};
				this.launchTokenPair(tool, token.code, option);
			}
		}
	}

	public launchTokenPair(tool: string, token: string, option: IOption) {
		const cmd = `npm run ${tool} token=${token} env=${option.env}${
			option.server ? ' server' : ''
		}${option.debug ? ' debug' : ''} ${osUtil.isWindows() ? '>>' : '&>'} ${tool}.${token}.log`;

		Util.logInfo(`[${token}]: ${cmd}`);

		const procInstance = child_process.exec(
			cmd,
			osUtil.isWindows() ? {} : { shell: '/bin/bash' }
		);

		this.subProcesses[token].instance = procInstance;
		this.subProcesses[token].lastFailTimestamp = Util.getUTCNowTimestamp();

		if (!procInstance) {
			Util.logError('Failed to launch ' + token);
			this.retry(tool, option, token);
		} else {
			Util.logInfo(`[${token}]: Launched ${tool}`);
			procInstance.on('exit', code => {
				Util.logError(`[${token}]: Exit with code ${token}`);
				if (code) this.retry(tool, option, token);
			});
		}
	}

	public retry(tool: string, option: IOption, token: string) {
		const now: number = Util.getUTCNowTimestamp();

		if (now - this.subProcesses[token].lastFailTimestamp < 30000)
			this.subProcesses[token].failCount++;
		else this.subProcesses[token].failCount = 1;

		this.subProcesses[token].lastFailTimestamp = now;

		if (this.subProcesses[token].failCount < 3)
			global.setTimeout(() => this.launchTokenPair(tool, token, option), 5000);
		else Util.logError('Retry Aborted ' + token);
	}
}

const serverMasterUtil = new ServerMasterUtil();
export default serverMasterUtil;
