/**
 * 校验并导入单个配置文件或整个配置目录，处理目标冲突、身份重写和作用域切换。
 * 所有候选先完成扫描与确认，再交给仓库提交，避免导入到一半留下不一致目录。
 */
import fs = require('fs')
import * as path from 'path'
import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import type { Bookmark } from '../models/Bookmark'
import type { BookmarkConfigurationFolderImportResult } from '../repository/BookmarkRepository'
import { formatBookmarkLevelSummary, summarizeBookmarkTrees } from '../util/BookmarkStatistics'
import type { CapturedUndoState } from './UndoManager'

export interface BookmarkImportWorkflowPort {
	ensureEditorScope(editor: vscode.TextEditor): Promise<void>
	absoluteToRelative(filePath: string): string
	bookmarksForPath(bookmarkPath: string): Bookmark[]
	storageScopeForUri(uri?: vscode.Uri): string
	runImportTransaction<T>(operation: () => Promise<T>): Promise<T>
	captureUndoState(): CapturedUndoState
	commitImportUndo(captured: CapturedUndoState): void
	importFolder(configFolderPath: string, workspaceRootPath: string): Promise<BookmarkConfigurationFolderImportResult>
	importFile(configPath: string, targetAbsolutePath: string): Promise<Bookmark>
	refresh(editor: vscode.TextEditor | undefined, expectedScope: string): Promise<void>
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

async function chooseImportWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
	const folders = vscode.workspace.workspaceFolders ?? []
	if (folders.length === 0) return undefined
	if (folders.length === 1) return folders[0]
	const selected = await vscode.window.showQuickPick(
		folders.map(folder => ({
			label: folder.name,
			description: folder.uri.fsPath,
			workspaceFolder: folder,
		})),
		{
			title: localize("providers.BookmarkImportWorkflowRunner.chooseAWorkspaceRootForTheBookmarkConfigurationImport"),
			placeHolder: localize("providers.BookmarkImportWorkflowRunner.chooseTheDestinationRootInAMultiRootWorkspace"),
		},
	)
	return selected?.workspaceFolder
}

export async function runImportBookmarkConfiguration(port: BookmarkImportWorkflowPort): Promise<void> {
	const editor = vscode.window.activeTextEditor
	const hasLocalEditor = editor?.document.uri.scheme === 'file'
	const editorWorkspaceFolder = hasLocalEditor
		? vscode.workspace.getWorkspaceFolder(editor.document.uri)
		: undefined
	const workspaceFolder = editorWorkspaceFolder ?? (!hasLocalEditor ? await chooseImportWorkspaceFolder() : undefined)
	if (!hasLocalEditor && !workspaceFolder) {
		void vscode.window.showInformationMessage(localize("providers.BookmarkImportWorkflowRunner.openTheLocalScriptToBindOrOpenA"))
		return
	}
	if (hasLocalEditor) await port.ensureEditorScope(editor)

	const absolutePath = hasLocalEditor ? editor.document.uri.fsPath : undefined
	if (absolutePath) {
		const bookmarkPath = port.absoluteToRelative(absolutePath)
		if (port.bookmarksForPath(bookmarkPath).length > 0) {
			void vscode.window.showInformationMessage(localize("providers.BookmarkImportWorkflowRunner.theCurrentScriptAlreadyHasBookmarksSoNoConfiguration"))
			return
		}
	}

	const selected = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectFolders: workspaceFolder !== undefined,
		canSelectMany: false,
		openLabel: localize("providers.BookmarkImportWorkflowRunner.importAndBind"),
		title: workspaceFolder
			? localize("providers.BookmarkImportWorkflowRunner.chooseABookmarkConfigurationFileOrFolder")
			: localize("providers.BookmarkImportWorkflowRunner.importBookmarkConfigurationFor", { fileName: path.basename(absolutePath!) }),
		defaultUri: workspaceFolder?.uri,
		filters: { [localize("providers.BookmarkImportWorkflowRunner.codebookmarkConfiguration")]: ['json'] },
	})
	if (!selected?.[0]) return

	let selectedStat: fs.Stats
	try {
		selectedStat = await fs.promises.stat(selected[0].fsPath)
	} catch (error) {
		throw new Error(localize("providers.BookmarkImportWorkflowRunner.unableToReadTheSelectedConfigurationPath", { errorMessage: errorMessage(error) }), { cause: error })
	}
	const scopeUri = editor?.document.uri ?? workspaceFolder?.uri
	if (selectedStat.isDirectory()) {
		if (!workspaceFolder) {
			void vscode.window.showInformationMessage(localize("providers.BookmarkImportWorkflowRunner.anEntireBookmarkConfigurationFolderCanOnlyBeImported"))
			return
		}
		const expectedScope = port.storageScopeForUri(scopeUri)
		const result = await port.runImportTransaction(async () => {
			const captured = port.captureUndoState()
			const imported = await port.importFolder(selected[0].fsPath, workspaceFolder.uri.fsPath)
			if (!imported.cancelled && imported.imported > 0) {
				port.commitImportUndo(captured)
				if (port.storageScopeForUri(scopeUri) !== expectedScope) {
					throw new Error(localize("providers.BookmarkImportWorkflowRunner.theWorkspaceScopeChangedBeforeTheImportCompletedReload"))
				}
				await port.refresh(editor, expectedScope)
			}
			return imported
		})
		if (result.cancelled) {
			void vscode.window.showInformationMessage(localize("providers.BookmarkImportWorkflowRunner.bookmarkConfigurationFolderImportWasCancelled"))
			return
		}
		if (result.imported === 0) {
			if (result.total === 0) throw new Error(localize("providers.BookmarkImportWorkflowRunner.noImportableBookmarkConfigurationFilesWereFoundInThe"))
			throw new Error(localize("providers.BookmarkImportWorkflowRunner.noConfigurationsInTheFolderWereImportedSkippedFailed", { skipped: result.skipped, failed: result.failed }))
		}
		const skippedText = result.skipped + result.failed > 0
			? localize("providers.BookmarkImportWorkflowRunner.skippedFailed", { skipped: result.skipped, failed: result.failed })
			: ''
		void vscode.window.showInformationMessage(
			localize("providers.BookmarkImportWorkflowRunner.importedBookmarkConfigurationsForScriptsFromTheFolderImported", { imported: result.imported, skippedText, formatBookmarkLevelSummary: formatBookmarkLevelSummary(result.bookmarkSummary) }),
		)
		return
	}

	if (!absolutePath || !editor) {
		void vscode.window.showInformationMessage(localize("providers.BookmarkImportWorkflowRunner.openTheLocalScriptToBindBeforeImportingA"))
		return
	}
	const expectedScope = port.storageScopeForUri(editor.document.uri)
	const importedFileNode = await port.runImportTransaction(async () => {
		const captured = port.captureUndoState()
		const imported = await port.importFile(selected[0].fsPath, absolutePath)
		port.commitImportUndo(captured)
		if (port.storageScopeForUri(editor.document.uri) !== expectedScope) {
			throw new Error(localize("providers.BookmarkImportWorkflowRunner.theActiveScriptScopeChangedBeforeTheImportCompleted"))
		}
		await port.refresh(editor, expectedScope)
		return imported
	})
	void vscode.window.showInformationMessage(
		localize("providers.BookmarkImportWorkflowRunner.importedAndBoundTheBookmarkConfigurationForImported", { fileName: path.basename(absolutePath), formatBookmarkLevelSummary: formatBookmarkLevelSummary(summarizeBookmarkTrees(importedFileNode.subs)) }),
	)
}
