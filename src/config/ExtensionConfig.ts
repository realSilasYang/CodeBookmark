/**
 * 模块说明：本文件负责扩展配置读取与约束，具体对象为 `ExtensionConfig`。
 *
 * 实现要点：缓存并规范化设置值，在配置变化时集中失效，避免调用方自行解释原始配置。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`ExtensionConfig`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeAIRequestTimeoutSeconds } from '../util/AIRequestPolicy';
import { resolveStoragePath } from '../util/StoragePath';
import { localize } from '../i18n/Localization';
export class ExtensionConfig {
	private static validatedStoragePath: string | undefined
	private static snapshot: {
		globalStoragePath: string
		aiAddress: string
		aiAPIKey: string
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
				aiAddress: String(ai.get('address') || '').trim(),
				aiAPIKey: String(ai.get('APIKey') || '').trim(),
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

	static get aiAddress(): string {
		return this.values().aiAddress;
	}
	static get aiAPIKey(): string {
		return this.values().aiAPIKey;
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

	static async updateAIAddress(address: string): Promise<boolean> {
		const successfulAddress = address.trim()
		if (!successfulAddress || successfulAddress === this.aiAddress) return false

		const configuration = vscode.workspace.getConfiguration('codebookmark.AI')
		const inspection = configuration.inspect<string>('address')
		const target = inspection?.workspaceFolderValue !== undefined
			? vscode.ConfigurationTarget.WorkspaceFolder
			: inspection?.workspaceValue !== undefined
				? vscode.ConfigurationTarget.Workspace
				: vscode.ConfigurationTarget.Global
		await configuration.update('address', successfulAddress, target)
		this.invalidate()
		return true
	}

	static ensureAIConfigured(): boolean {
		const missing: string[] = []
		if (!this.aiAddress) missing.push(localize('接口地址', 'API address'))
		if (!this.aiModel) missing.push(localize('模型名称', 'model name'))
		if (missing.length === 0) return true

		void vscode.commands.executeCommand('workbench.action.openSettings', 'codebookmark.AI')
		void vscode.window.showErrorMessage(localize(
			`请先补全 AI 配置：${missing.join('、')}。`,
			`Complete the AI settings first: ${missing.join(', ')}.`,
		))
		return false
	}

	static ensureGlobalStoragePathConfigured(): boolean {
		let folder = ExtensionConfig.globalStoragePath;
		if (!folder || folder.trim() === '') {
			void vscode.commands.executeCommand('workbench.action.openSettings', 'codebookmark.globalStoragePath');
			void vscode.window.showErrorMessage(localize(
				'请先配置全局书签存储路径；该设置不能为空。',
				'Configure the global bookmark storage path first; this setting cannot be empty.',
			));
			return false;
		}

		try {
			folder = ExtensionConfig.resolveStoragePath();
		} catch (error) {
			void vscode.window.showErrorMessage(localize(
				`书签存储路径无效：${error instanceof Error ? error.message : String(error)}`,
				`The bookmark storage path is invalid: ${error instanceof Error ? error.message : String(error)}`,
			))
			return false
		}
		if (!path.isAbsolute(folder)) {
			void vscode.window.showErrorMessage(localize(
				`书签存储路径必须是绝对路径：${folder}`,
				`The bookmark storage path must be absolute: ${folder}`,
			))
			return false
		}
		if (folder === this.validatedStoragePath) return true;

		if (!fs.existsSync(folder)) {
			try {
				fs.mkdirSync(folder, { recursive: true });
			} catch {
				vscode.window.showErrorMessage(localize(
					`无法创建书签配置文件夹：${folder}。请检查路径是否合法以及是否具有访问权限。`,
					`Unable to create the bookmark configuration folder: ${folder}. Check that the path is valid and accessible.`,
				));
				return false;
			}
		}

		try {
			const stat = fs.statSync(folder);
			if (!stat.isDirectory()) {
				vscode.window.showErrorMessage(localize(
					`书签配置路径必须是文件夹，不能是文件：${folder}`,
					`The bookmark configuration path must be a folder, not a file: ${folder}`,
				));
				return false;
			}
			fs.accessSync(folder, fs.constants.W_OK | fs.constants.R_OK);
		} catch {
			vscode.window.showErrorMessage(localize(
				`指定的书签配置文件夹无读写权限或不可用：${folder}`,
				`The selected bookmark configuration folder is unavailable or does not allow reading and writing: ${folder}`,
			));
			return false;
		}

		this.validatedStoragePath = folder;
		return true;
	}
}
