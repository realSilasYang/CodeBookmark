import * as vscode from 'vscode'
import { CodeBookmarksViewProvider } from '../providers/CodeBookmarkViewProvider'
import { Commands } from '../util/constants/Commands'
import { Bookmark } from '../models/Bookmark'
import { ExtensionConfig } from '../config/ExtensionConfig'
import { AIService } from '../util/AIService'
import { isUserCancelledError, localize } from '../i18n/Localization'
import { ensureAIWorkspaceTrusted } from '../util/WorkspaceCapabilityPolicy'

export function bookmarkCommands(
	context: vscode.ExtensionContext,
	provider: CodeBookmarksViewProvider,
) {
	const register = <T extends unknown[]>(command: string, handler: (...args: T) => unknown) => {
		context.subscriptions.push(vscode.commands.registerCommand(command, handler))
	}

	const requireStorage = <T extends unknown[]>(handler: (...args: T) => unknown) => (...args: T) => {
		if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return
		return handler(...args)
	}

	const withEditor = (handler: (editor: vscode.TextEditor) => unknown) => requireStorage(async () => {
		const editor = vscode.window.activeTextEditor
		if (editor?.document.uri.scheme === 'file') {
			await provider.ensureEditorScope(editor)
			return handler(editor)
		}
		void vscode.window.showInformationMessage(localize('请先打开一个本地文件。', 'Open a local file first.'))
	})

	const checkAIPrerequisites = async (): Promise<vscode.TextEditor | undefined> => {
		if (!ensureAIWorkspaceTrusted()) return undefined
		if (!ExtensionConfig.ensureAIConfigured()) return undefined
		if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return undefined
		const editor = vscode.window.activeTextEditor
		if (!editor || editor.document.uri.scheme !== 'file') {
			vscode.window.showInformationMessage(localize(
				'未打开任何文件，无法进行 AI 分析。',
				'No file is open, so AI analysis cannot run.',
			))
			return undefined
		}
		return editor
	}

	const withAIEditor = async (handler: (editor: vscode.TextEditor) => Promise<unknown>) => {
		try {
			const editor = await checkAIPrerequisites()
			if (!editor) return
			await provider.ensureEditorScope(editor)
			await handler(editor)
		} catch (error) {
			vscode.window.showErrorMessage(localize(
				`AI 操作失败：${error instanceof Error ? error.message : String(error)}`,
				`AI operation failed: ${error instanceof Error ? error.message : String(error)}`,
			))
		}
	}

	const withAIConfiguration = async (handler: () => Promise<unknown>) => {
		try {
			if (!ensureAIWorkspaceTrusted()) return
			if (!ExtensionConfig.ensureAIConfigured()) return
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return
			await handler()
		} catch (error) {
			vscode.window.showErrorMessage(localize(
				`AI 操作失败：${error instanceof Error ? error.message : String(error)}`,
				`AI operation failed: ${error instanceof Error ? error.message : String(error)}`,
			))
		}
	}

	register(Commands.bookmarkCommands.toggleBookmark.command, withEditor(editor => provider.toggleBookmark(editor)))
	register(Commands.bookmarkCommands.forceAddBookmark.command, withEditor(editor => provider.forceAddBookmark(editor)))
	register(Commands.bookmarkCommands.forceDeleteBookmark.command, withEditor(editor => provider.forceDeleteBookmark(editor)))

	register(Commands.bookmarkCommands.deleteBookmark.command,
		requireStorage((bookmark?: Bookmark, selectedBookmarks?: Bookmark[]) => provider.onDeleteBookmark(bookmark, selectedBookmarks)))
	register(Commands.bookmarkCommands.editBookmark_editLabel.command,
		requireStorage((bookmark?: Bookmark, selectedBookmarks?: Bookmark[]) => provider.editBookmark_editLabel(bookmark, selectedBookmarks)))
	register(Commands.bookmarkCommands.editBookmark_updatePosOnly.command,
		requireStorage((bookmark: Bookmark) => provider.editBookmark_updatePosOnly(bookmark)))
	register(Commands.bookmarkCommands.editBookmark_updatePosAndRename.command,
		requireStorage((bookmark: Bookmark) => provider.editBookmark_updatePosAndRename(bookmark)))
	register(Commands.bookmarkCommands.editBookmark_changeIcon.command,
		requireStorage((bookmark?: Bookmark, selectedBookmarks?: Bookmark[]) => provider.editBookmark_changeIcon(bookmark, selectedBookmarks)))
	register(Commands.bookmarkCommands.editBookmark_restoreDefaultIcon.command,
		requireStorage((bookmark?: Bookmark, selectedBookmarks?: Bookmark[]) => provider.editBookmark_restoreDefaultIcon(bookmark, selectedBookmarks)))
	register(Commands.bookmarkCommands.renameBookmark.command,
		requireStorage((bookmark?: Bookmark, selectedBookmarks?: Bookmark[]) => provider.onRenameBookmark(bookmark, selectedBookmarks)))

	register(Commands.bookmarkCommands.pinView.command, requireStorage((bookmark: Bookmark) => provider.onClickPinView(bookmark)))
	register(Commands.bookmarkCommands.unpinView.command, requireStorage((bookmark: Bookmark) => provider.onClickPinView(bookmark)))
	register(Commands.bookmarkCommands.openSettings.command,
		() => vscode.commands.executeCommand('workbench.action.openSettings', 'codebookmark'))
	register(Commands.bookmarkCommands.aiOpenSettings.command,
		() => vscode.commands.executeCommand('workbench.action.openSettings', 'codebookmark.AI'))
	register(Commands.bookmarkCommands.importBookmarkConfig.command,
		requireStorage(async () => {
			try {
				await provider.importBookmarkConfiguration()
			} catch (error) {
				if (isUserCancelledError(error)) {
					vscode.window.showInformationMessage(localize('已取消导入书签配置。', 'Bookmark configuration import was cancelled.'))
				} else {
					vscode.window.showErrorMessage(localize(
						`导入书签配置失败：${error instanceof Error ? error.message : String(error)}`,
						`Failed to import bookmark configuration: ${error instanceof Error ? error.message : String(error)}`,
					))
				}
			}
		}))
	register(Commands.bookmarkCommands.manageBookmarkConfigurations.command,
		requireStorage(() => provider.openBookmarkConfigurationManager()))
	register(Commands.bookmarkCommands.searchInFile.command, withEditor(() => provider.onSearchInFile()))
	register(Commands.bookmarkCommands.sort.command, requireStorage(() => provider.onSort()))
	register(Commands.bookmarkCommands.undo.command, requireStorage(() => provider.undo()))
	register(Commands.bookmarkCommands.redo.command, requireStorage(() => provider.redo()))
	for (const command of Commands.undoCommands) register(command.command, requireStorage(() => provider.undo()))
	for (const command of Commands.redoCommands) register(command.command, requireStorage(() => provider.redo()))

	register(Commands.bookmarkCommands.aiGenerateAppend.command,
		() => withAIEditor(editor => provider.generateBookmarksWithAI(editor, 'append')))
	register(Commands.bookmarkCommands.aiGenerateOverwrite.command,
		() => withAIEditor(editor => provider.generateBookmarksWithAI(editor, 'overwrite')))
	register(Commands.bookmarkCommands.aiGenerateSkip.command,
		() => withAIEditor(editor => provider.generateBookmarksWithAI(editor, 'skip_existing')))
	register(Commands.bookmarkCommands.aiGenerateAppendFolder.command,
		() => withAIConfiguration(() => provider.generateBookmarksForFolderWithAI('append')))
	register(Commands.bookmarkCommands.aiGenerateOverwriteFolder.command,
		() => withAIConfiguration(() => provider.generateBookmarksForFolderWithAI('overwrite')))
	register(Commands.bookmarkCommands.aiGenerateAppendFolderDirect.command,
		() => withAIConfiguration(() => provider.generateBookmarksForFolderWithAI('append')))
	register(Commands.bookmarkCommands.aiGenerateOverwriteFolderDirect.command,
		() => withAIConfiguration(() => provider.generateBookmarksForFolderWithAI('overwrite')))
	register(Commands.bookmarkCommands.aiGenerateSkipFolder.command,
		() => withAIConfiguration(() => provider.generateBookmarksForFolderWithAI('skip_existing')))
	register(Commands.bookmarkCommands.aiGenerateSkipFolderDirect.command,
		() => withAIConfiguration(() => provider.generateBookmarksForFolderWithAI('skip_existing')))
	register(Commands.bookmarkCommands.aiOptimize.command,
		() => withAIEditor(editor => provider.optimizeBookmarksWithAI(editor)))
	register(Commands.bookmarkCommands.aiOptimizeDirect.command,
		() => withAIEditor(editor => provider.optimizeBookmarksWithAI(editor)))
	register(Commands.bookmarkCommands.aiOptimizeFolderDirect.command,
		() => withAIConfiguration(() => provider.optimizeBookmarksForFolderWithAI()))
	register(Commands.bookmarkCommands.aiOptimizeSelectedDirect.command,
		() => withAIConfiguration(() => provider.optimizeSelectedBookmarksWithAI()))
	register(Commands.bookmarkCommands.aiOptimizeFolder.command,
		() => withAIConfiguration(() => provider.optimizeBookmarksForFolderWithAI()))
	register(Commands.bookmarkCommands.aiOptimizeSelected.command,
		() => withAIConfiguration(() => provider.optimizeSelectedBookmarksWithAI()))
	register(Commands.bookmarkCommands.aiOptimizeContextItem.command,
		(bookmark?: Bookmark, selectedBookmarks?: Bookmark[]) => withAIConfiguration(() => provider.optimizeSelectedBookmarksWithAI(bookmark, selectedBookmarks)))
	register(Commands.bookmarkCommands.aiTestConnection.command, async () => {
		if (!ensureAIWorkspaceTrusted()) return
		if (!ExtensionConfig.ensureAIConfigured()) return
		void vscode.window.showInformationMessage(localize('正在测试 AI 连接，请稍候…', 'Testing the AI connection…'))
		let successfulAddress: string
		try {
			successfulAddress = await AIService.testConnection()
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			void vscode.window.showErrorMessage(localize(
				`AI 连接测试失败：${message}`,
				`AI connection test failed: ${message}`,
			))
			return
		}

		try {
			const updated = await ExtensionConfig.updateAIAddress(successfulAddress)
			void vscode.window.showInformationMessage(updated
				? localize(
					'AI 连接测试成功，接口地址已更新为实际可用地址。',
					'AI connection test succeeded. The address was updated to the working endpoint.',
				)
				: localize('AI 连接测试成功！', 'AI connection test succeeded.'))
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			void vscode.window.showWarningMessage(localize(
				`AI 连接测试成功，但无法更新接口地址：${message}`,
				`AI connection test succeeded, but the address could not be updated: ${message}`,
			))
		}
	})

	register(Commands.bookmarkCommands.toggleExpandCollapse.command,
		requireStorage(() => provider.toggleExpandCollapse()))
	register(Commands.bookmarkCommands.toggleExpandCollapse_collapse.command,
		requireStorage(() => provider.toggleExpandCollapse()))
	register(Commands.bookmarkCommands.openHelp.command, () => {
		const uri = vscode.Uri.joinPath(context.extensionUri, 'README.md')
		return vscode.commands.executeCommand('markdown.showPreview', uri)
	})
	register(Commands.bookmarkCommands.clearInvalidBookmarks.command,
		requireStorage(() => provider.clearInvalidBookmarks()))
}
