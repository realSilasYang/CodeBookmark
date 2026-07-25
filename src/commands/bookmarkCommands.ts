/**
 * 集中注册编辑器、书签树和工具栏命令，把 VS Code 传入的节点或 URI 转交给对应工作流。
 * 这里负责命令参数与用户反馈，不直接复制书签领域规则或持久化实现。
 */
import * as vscode from 'vscode'
import { CodeBookmarksViewProvider } from '../providers/CodeBookmarkViewProvider'
import { Commands } from '../util/constants/Commands'
import { Bookmark } from '../models/Bookmark'
import { ExtensionConfig } from '../config/ExtensionConfig'
import { AIService } from '../util/AIService'
import { currentLanguage, isUserCancelledError, localize } from '../i18n/Localization'
import { readmeDocumentForLanguage } from '../i18n/ReadmeDocuments'
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
		void vscode.window.showInformationMessage(localize("commands.bookmarkCommands.openALocalFileFirst"))
	})

	const checkAIPrerequisites = async (): Promise<vscode.TextEditor | undefined> => {
		if (!ensureAIWorkspaceTrusted()) return undefined
		if (!ExtensionConfig.ensureAIConfigured()) return undefined
		if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return undefined
		const editor = vscode.window.activeTextEditor
		if (!editor || editor.document.uri.scheme !== 'file') {
			vscode.window.showInformationMessage(localize("commands.bookmarkCommands.noFileIsOpenSoAiAnalysisCannotRun"))
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
			vscode.window.showErrorMessage(localize("commands.bookmarkCommands.aiOperationFailed", { errorMessage: error instanceof Error ? error.message : String(error) }))
		}
	}

	const withAIConfiguration = async (handler: () => Promise<unknown>) => {
		try {
			if (!ensureAIWorkspaceTrusted()) return
			if (!ExtensionConfig.ensureAIConfigured()) return
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return
			await handler()
		} catch (error) {
			vscode.window.showErrorMessage(localize("commands.bookmarkCommands.aiOperationFailed", { errorMessage: error instanceof Error ? error.message : String(error) }))
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
					vscode.window.showInformationMessage(localize("commands.bookmarkCommands.bookmarkConfigurationImportWasCancelled"))
				} else {
					vscode.window.showErrorMessage(localize("commands.bookmarkCommands.failedToImportBookmarkConfiguration", { errorMessage: error instanceof Error ? error.message : String(error) }))
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
		void vscode.window.showInformationMessage(localize("commands.bookmarkCommands.testingTheAiConnection"))
		let successfulAddress: string
		try {
			successfulAddress = await AIService.testConnection()
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			void vscode.window.showErrorMessage(localize("commands.bookmarkCommands.aiConnectionTestFailed", { message }))
			return
		}

		try {
			const updated = await ExtensionConfig.updateAIAddress(successfulAddress)
			void vscode.window.showInformationMessage(updated
				? localize("commands.bookmarkCommands.aiConnectionTestSucceededTheAddressWasUpdatedTo")
				: localize("commands.bookmarkCommands.aiConnectionTestSucceeded"))
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			void vscode.window.showWarningMessage(localize("commands.bookmarkCommands.aiConnectionTestSucceededButTheAddressCouldNot", { message }))
		}
	})

	register(Commands.bookmarkCommands.toggleExpandCollapse.command,
		requireStorage(() => provider.toggleExpandCollapse()))
	register(Commands.bookmarkCommands.toggleExpandCollapse_collapse.command,
		requireStorage(() => provider.toggleExpandCollapse()))
	register(Commands.bookmarkCommands.openHelp.command, () => {
		const documentPath = readmeDocumentForLanguage(currentLanguage())
		const uri = vscode.Uri.joinPath(context.extensionUri, ...documentPath.split('/'))
		return vscode.commands.executeCommand('markdown.showPreview', uri)
	})
	register(Commands.bookmarkCommands.clearInvalidBookmarks.command,
		requireStorage(() => provider.clearInvalidBookmarks()))
}
