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
	// Register the provider and all commands synchronously before starting any I/O.
	// VS Code may request the contributed view immediately; awaiting even a setContext
	// command here can leave the view with no registered data provider.
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

	// Activation must complete immediately. The provider owns loading state and error
	// recovery, so slow disks or a large workspace cannot trigger VS Code's 10s timeout.
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
