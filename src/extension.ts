/**
 * 模块说明：本文件负责扩展激活入口与资源装配，具体对象为 `extension`。
 *
 * 实现要点：同步装配命令、视图和订阅，再把慢速加载交给后台生命周期处理。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`activate`、`deactivate`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as vscode from 'vscode'

import { fileEditorSubscriber } from './subscriptions/fileEditorSubscriber'

import { CodeBookmarksViewProvider } from './providers/CodeBookmarkViewProvider'
import { createCodeBookmarkView } from './providers/createCodeBookmarkView'
import { bookmarkCommands } from './commands/bookmarkCommands'
import { openNodeCommand } from './commands/openNodeCommand'
import { registerExportCommand } from './commands/exportCommand'
import { Commands } from './util/constants/Commands'
import { logger } from './util/Logger'
import { undoManager } from './providers/UndoManager'
import { SyncedGlobalStateKeys } from './util/constants/ExtensionStateKeys'
import {
	currentLanguage,
	initializeLocalization,
	localize,
	type SupportedLanguage,
} from './i18n/Localization'
import { initializeBookmarkIconRoot } from './util/BookmarkIcon'
import { migrateRecentIconState } from './util/RecentIconState'
import {
	createIntegrationTestApi,
	type CodeBookmarkIntegrationTestApi,
} from './testing/IntegrationTestApi'

let activeProvider: CodeBookmarksViewProvider | undefined

interface CodeBookmarkExtensionApi {
	readonly language: SupportedLanguage
	readonly integration?: CodeBookmarkIntegrationTestApi
}

function hasActiveTextFile(): boolean {
	if (vscode.window.activeTextEditor?.document.uri.scheme === 'file') return true
	const input = vscode.window.tabGroups?.activeTabGroup?.activeTab?.input
	if (input instanceof vscode.TabInputText) return input.uri.scheme === 'file'
	if (input instanceof vscode.TabInputTextDiff) {
		return input.original.scheme === 'file' || input.modified.scheme === 'file'
	}
	return false
}

function hasWorkspaceFolder(): boolean {
	return (vscode.workspace.workspaceFolders?.length ?? 0) > 0
}

export function activate(context: vscode.ExtensionContext): CodeBookmarkExtensionApi {
	// 在启动任何 I/O 前同步注册数据提供器与全部命令。VS Code 可能立即请求贡献视图；
	// 即使这里只等待一次 setContext，也可能让视图在数据提供器尚未注册时被创建。
	initializeLocalization(vscode.env.language)
	initializeBookmarkIconRoot(context.extensionUri)
	context.globalState.setKeysForSync(SyncedGlobalStateKeys)
	void migrateRecentIconState(context).catch(error => logger.error(localize(
		`迁移最近使用图标状态失败：${error}`,
		`Failed to migrate the recently used icon state: ${error}`,
	)))
	undoManager.initialize(context)
	const codeBookmarkProvider = new CodeBookmarksViewProvider(context)
	activeProvider = codeBookmarkProvider
	context.subscriptions.push(logger)

	const viewCodeBookmark = createCodeBookmarkView(context, codeBookmarkProvider)
	bookmarkCommands(context, codeBookmarkProvider)
	openNodeCommand(context)
	registerExportCommand(context, codeBookmarkProvider)

	fileEditorSubscriber(context, codeBookmarkProvider)

	void Promise.all([
		vscode.commands.executeCommand('setContext', Commands.varBookmarkLoaded, false),
		vscode.commands.executeCommand('setContext', Commands.varBookmarkLoadFailed, false),
		vscode.commands.executeCommand('setContext', Commands.varHasBookmark, false),
		vscode.commands.executeCommand('setContext', Commands.varActiveFileAvailable, hasActiveTextFile()),
		vscode.commands.executeCommand('setContext', Commands.varActiveFileHasBookmark, false),
		vscode.commands.executeCommand('setContext', Commands.varCurrentFolderHasUnbookmarkedScript, false),
		vscode.commands.executeCommand('setContext', Commands.varCurrentFolderHasBookmarkedScript, false),
		vscode.commands.executeCommand(
			'setContext',
			Commands.varAIAnalysisAvailable,
			hasActiveTextFile() || hasWorkspaceFolder(),
		),
		vscode.commands.executeCommand('setContext', Commands.varIsExpanded, false),
	]).catch(error => logger.error(localize(
		`初始化书签视图上下文失败: ${error}`,
		`Failed to initialize the bookmark view context: ${error}`,
	)))

	// 激活函数必须立即返回。加载状态和错误恢复由提供器负责，避免慢速磁盘或大型工作区
	// 触发 VS Code 的 10 秒激活超时。
	codeBookmarkProvider.init(viewCodeBookmark)
	const language = currentLanguage()
	return process.env.CODEBOOKMARK_INTEGRATION_TEST === '1'
		? Object.freeze({ language, integration: createIntegrationTestApi(codeBookmarkProvider) })
		: Object.freeze({ language })
}

export async function deactivate() {
	await Promise.all([
		activeProvider?.flushPendingSaves(),
		undoManager.flushPersistence(),
	])
	activeProvider = undefined
}
