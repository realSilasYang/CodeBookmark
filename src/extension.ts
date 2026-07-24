/**
 * 扩展激活入口：先同步注册视图、命令与订阅，再把磁盘加载和后台增强交给提供器。
 * 激活函数刻意不等待慢速 I/O，以免大型工作区或网络存储触发 VS Code 超时。
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
	// 贡献视图可能在 activate 尚未结束时就向扩展取数据，因此数据提供器和命令必须
	// 在第一次 await 之前全部就位；哪怕只先等待一次 setContext，也会留下空窗。
	initializeLocalization(vscode.env.language)
	initializeBookmarkIconRoot(context.extensionUri)
	context.globalState.setKeysForSync(SyncedGlobalStateKeys)
	void migrateRecentIconState(context).catch(error => logger.error(localize("extension.failedToMigrateTheRecentlyUsedIconState", { error })))
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
	]).catch(error => logger.error(localize("extension.failedToInitializeTheBookmarkViewContext", { error })))

	// 到这里扩展已经具备可交互外壳。磁盘加载继续在后台运行，由提供器自行发布加载状态
	// 和错误；activate 不等待它，慢速磁盘或大型工作区便不会耗尽 VS Code 的 10 秒时限。
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
