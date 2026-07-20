import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
export class ExtensionConfig {
	static globalStoragePath: string = ''

	static get aiEndpoint(): string {
		return String(vscode.workspace.getConfiguration('codebookmark.ai').get('endpoint') || '').trim();
	}
	static get aiApiKey(): string {
		return String(vscode.workspace.getConfiguration('codebookmark.ai').get('apiKey') || '').trim();
	}
	static get aiModel(): string {
		return String(vscode.workspace.getConfiguration('codebookmark.ai').get('model') || '').trim();
	}
	static get aiPrompt(): string {
		return String(vscode.workspace.getConfiguration('codebookmark.ai').get('prompt') || '').trim();
	}
	static get aiOptimizePrompt(): string {
		return String(vscode.workspace.getConfiguration('codebookmark.ai').get('optimizePrompt') || '').trim();
	}
	static get autoSpace(): boolean {
		return vscode.workspace.getConfiguration('codebookmark').get<boolean>('autoSpace') ?? true;
	}
	static get inlineLabel(): boolean {
		return vscode.workspace.getConfiguration('codebookmark').get<boolean>('inlineLabel') ?? true;
	}

	static ensureGlobalStoragePathConfigured(): boolean {
		let folder = ExtensionConfig.globalStoragePath;
		if (!folder || folder.trim() === '') {
			vscode.commands.executeCommand('workbench.action.openSettings', 'codebookmark.globalStoragePath');
			vscode.window.showErrorMessage('请先配置全局书签存储的绝对路径后方可使用！该路径禁止留空！');
			return false;
		}

		folder = folder.trim();
		folder = folder.replace(/^~([\\/].*)?$/, (match, p1) => path.join(os.homedir(), p1 || ''));
		folder = folder.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');
		folder = path.normalize(folder);

		if (!fs.existsSync(folder)) {
			try {
				fs.mkdirSync(folder, { recursive: true });
			} catch (error) {
				vscode.window.showErrorMessage(`无法创建书签配置文件夹： ${folder}，请检查是否具有权限或路径是否合法。`);
				return false;
			}
		}

		try {
			const stat = fs.statSync(folder);
			if (!stat.isDirectory()) {
				vscode.window.showErrorMessage(`书签配置路径必须是一个文件夹，不能是文件： ${folder}`);
				return false;
			}
			fs.accessSync(folder, fs.constants.W_OK | fs.constants.R_OK);
		} catch (error) {
			vscode.window.showErrorMessage(`指定的书签配置文件夹无读写权限或不可用： ${folder}`);
			return false;
		}

		return true;
	}
}
