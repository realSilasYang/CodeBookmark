/**
 * 统一读取、规范化并缓存 CodeBookmark 设置，向调用方提供类型明确的配置值。
 * 配置变化时只失效相关缓存，地址、超时和提示词的默认值也在这一层集中确定。
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeAIRequestTimeoutSeconds } from '../util/AIRequestPolicy';
import { resolveStoragePath } from '../util/StoragePath';
import { localize } from '../i18n/Localization';
import { errorMessage } from '../util/ErrorMessage'
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
		if (!this.aiAddress) missing.push(localize("config.ExtensionConfig.apiAddress"))
		if (!this.aiModel) missing.push(localize("config.ExtensionConfig.modelName"))
		if (missing.length === 0) return true

		void vscode.commands.executeCommand('workbench.action.openSettings', 'codebookmark.AI')
		void vscode.window.showErrorMessage(localize("config.ExtensionConfig.completeTheAiSettingsFirst", {
			missingFields: missing.join(localize('common.listSeparator')),
		}))
		return false
	}

	static ensureGlobalStoragePathConfigured(): boolean {
		let folder = ExtensionConfig.globalStoragePath;
		if (!folder || folder.trim() === '') {
			void vscode.commands.executeCommand('workbench.action.openSettings', 'codebookmark.globalStoragePath');
			void vscode.window.showErrorMessage(localize("config.ExtensionConfig.configureTheGlobalBookmarkStoragePathFirstThisSetting"));
			return false;
		}

		try {
			folder = ExtensionConfig.resolveStoragePath();
		} catch (error) {
			void vscode.window.showErrorMessage(localize("config.ExtensionConfig.theBookmarkStoragePathIsInvalid", { errorMessage: errorMessage(error) }))
			return false
		}
		if (!path.isAbsolute(folder)) {
			void vscode.window.showErrorMessage(localize("config.ExtensionConfig.theBookmarkStoragePathMustBeAbsolute", { folder }))
			return false
		}
		if (folder === this.validatedStoragePath) return true;

		if (!fs.existsSync(folder)) {
			try {
				fs.mkdirSync(folder, { recursive: true });
			} catch {
				vscode.window.showErrorMessage(localize("config.ExtensionConfig.unableToCreateTheBookmarkConfigurationFolderCheckThat", { folder }));
				return false;
			}
		}

		try {
			const stat = fs.statSync(folder);
			if (!stat.isDirectory()) {
				vscode.window.showErrorMessage(localize("config.ExtensionConfig.theBookmarkConfigurationPathMustBeAFolderNot", { folder }));
				return false;
			}
			fs.accessSync(folder, fs.constants.W_OK | fs.constants.R_OK);
		} catch {
			vscode.window.showErrorMessage(localize("config.ExtensionConfig.theSelectedBookmarkConfigurationFolderIsUnavailableOrDoes", { folder }));
			return false;
		}

		this.validatedStoragePath = folder;
		return true;
	}
}
