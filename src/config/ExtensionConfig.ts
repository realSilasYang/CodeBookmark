import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeAIRequestTimeoutSeconds } from '../util/AIRequestPolicy';
import { resolveStoragePath } from '../util/StoragePath';
export class ExtensionConfig {
	private static validatedStoragePath: string | undefined
	private static snapshot: {
		globalStoragePath: string
		aiEndpoint: string
		aiApiKey: string
		aiModel: string
		aiTimeoutS: number
		aiPrompt: string
		aiOptimizePrompt: string
		aiAssignIcons: boolean
		autoSpace: boolean
		inlineLabel: boolean
		defaultExpandLevel: number
	} | undefined

	private static values() {
		if (!this.snapshot) {
			const root = vscode.workspace.getConfiguration('codebookmark')
			const ai = vscode.workspace.getConfiguration('codebookmark.AI')
			const expandLevel = root.get<number>('defaultExpandLevel') ?? 3
			this.snapshot = {
				globalStoragePath: String(root.get('globalStoragePath') || ''),
				aiEndpoint: String(ai.get('endpoint') || '').trim(),
				aiApiKey: String(ai.get('apiKey') || '').trim(),
				aiModel: String(ai.get('model') || '').trim(),
				aiTimeoutS: normalizeAIRequestTimeoutSeconds(ai.get('timeoutS')),
				aiPrompt: String(ai.get('prompt') || '').trim(),
				aiOptimizePrompt: String(ai.get('optimizePrompt') || '').trim(),
				aiAssignIcons: ai.get<boolean>('assignIcons') ?? true,
				autoSpace: root.get<boolean>('autoSpace') ?? true,
				inlineLabel: root.get<boolean>('inlineLabel') ?? true,
				defaultExpandLevel: Number.isFinite(expandLevel) ? Math.max(0, Math.floor(expandLevel)) : 3,
			}
		}
		return this.snapshot
	}

	static invalidate(): void {
		this.snapshot = undefined
		this.validatedStoragePath = undefined
	}

	static get globalStoragePath(): string {
		return this.values().globalStoragePath
	}

	static resolveStoragePath(): string {
		return resolveStoragePath(this.globalStoragePath)
	}

	static get aiEndpoint(): string {
		return this.values().aiEndpoint;
	}
	static get aiApiKey(): string {
		return this.values().aiApiKey;
	}
	static get aiModel(): string {
		return this.values().aiModel;
	}
	static get aiTimeoutS(): number {
		return this.values().aiTimeoutS;
	}
	static get aiPrompt(): string {
		return this.values().aiPrompt;
	}
	static get aiOptimizePrompt(): string {
		return this.values().aiOptimizePrompt;
	}
	static get aiAssignIcons(): boolean {
		return this.values().aiAssignIcons;
	}
	static get autoSpace(): boolean {
		return this.values().autoSpace;
	}
	static get inlineLabel(): boolean {
		return this.values().inlineLabel;
	}
	static get defaultExpandLevel(): number {
		return this.values().defaultExpandLevel;
	}

	static ensureAIConfigured(): boolean {
		const missing: string[] = []
		if (!this.aiEndpoint) missing.push('Endpoint')
		if (!this.aiApiKey) missing.push('API Key')
		if (!this.aiModel) missing.push('模型名称')
		if (missing.length === 0) return true

		void vscode.commands.executeCommand('workbench.action.openSettings', 'codebookmark.AI')
		void vscode.window.showErrorMessage(`请先补全 AI 配置：${missing.join('、')}。`)
		return false
	}

	static ensureGlobalStoragePathConfigured(): boolean {
		let folder = ExtensionConfig.globalStoragePath;
		if (!folder || folder.trim() === '') {
			void vscode.commands.executeCommand('workbench.action.openSettings', 'codebookmark.globalStoragePath');
			void vscode.window.showErrorMessage('请先配置全局书签存储路径；该设置不能为空。');
			return false;
		}

		try {
			folder = ExtensionConfig.resolveStoragePath();
		} catch (error) {
			void vscode.window.showErrorMessage(`书签存储路径无效：${error instanceof Error ? error.message : String(error)}`)
			return false
		}
		if (!path.isAbsolute(folder)) {
			void vscode.window.showErrorMessage(`书签存储路径必须是绝对路径：${folder}`)
			return false
		}
		if (folder === this.validatedStoragePath) return true;

		if (!fs.existsSync(folder)) {
			try {
				fs.mkdirSync(folder, { recursive: true });
			} catch {
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
		} catch {
			vscode.window.showErrorMessage(`指定的书签配置文件夹无读写权限或不可用： ${folder}`);
			return false;
		}

		this.validatedStoragePath = folder;
		return true;
	}
}
