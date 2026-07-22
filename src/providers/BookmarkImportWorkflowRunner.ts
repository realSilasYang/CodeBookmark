import fs = require('fs')
import * as path from 'path'
import * as vscode from 'vscode'
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
		{ title: '选择要导入书签配置的工作区根目录', placeHolder: '多根工作区需要先选择目标根目录' },
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
		void vscode.window.showInformationMessage('请先打开要绑定书签配置的本地脚本，或打开一个工作区后导入配置文件夹。')
		return
	}
	if (hasLocalEditor) await port.ensureEditorScope(editor)

	const absolutePath = hasLocalEditor ? editor.document.uri.fsPath : undefined
	if (absolutePath) {
		const bookmarkPath = port.absoluteToRelative(absolutePath)
		if (port.bookmarksForPath(bookmarkPath).length > 0) {
			void vscode.window.showInformationMessage('当前脚本已经存在书签，无需导入配置。')
			return
		}
	}

	const selected = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectFolders: workspaceFolder !== undefined,
		canSelectMany: false,
		openLabel: '导入并绑定',
		title: workspaceFolder ? '选择书签配置文件或配置文件夹' : `为 ${path.basename(absolutePath!)} 导入书签配置`,
		defaultUri: workspaceFolder?.uri,
		filters: { 'CodeBookmark 配置': ['json'] },
	})
	if (!selected?.[0]) return

	let selectedStat: fs.Stats
	try {
		selectedStat = await fs.promises.stat(selected[0].fsPath)
	} catch (error) {
		throw new Error(`无法读取所选配置路径：${errorMessage(error)}`, { cause: error })
	}
	const scopeUri = editor?.document.uri ?? workspaceFolder?.uri
	if (selectedStat.isDirectory()) {
		if (!workspaceFolder) {
			void vscode.window.showInformationMessage('只有工作区模式支持导入整个书签配置文件夹。')
			return
		}
		const expectedScope = port.storageScopeForUri(scopeUri)
		const result = await port.runImportTransaction(async () => {
			const captured = port.captureUndoState()
			const imported = await port.importFolder(selected[0].fsPath, workspaceFolder.uri.fsPath)
			if (!imported.cancelled && imported.imported > 0) {
				port.commitImportUndo(captured)
				if (port.storageScopeForUri(scopeUri) !== expectedScope) {
					throw new Error('导入完成前工作区作用域发生变化，请重新加载工作区确认结果。')
				}
				await port.refresh(editor, expectedScope)
			}
			return imported
		})
		if (result.cancelled) {
			void vscode.window.showInformationMessage('已取消导入书签配置文件夹。')
			return
		}
		if (result.imported === 0) {
			if (result.total === 0) throw new Error('所选文件夹中没有找到可导入的书签配置文件。')
			throw new Error(`文件夹中的配置均未导入（跳过 ${result.skipped} 个，失败 ${result.failed} 个）。`)
		}
		const skippedText = result.skipped + result.failed > 0
			? `（跳过 ${result.skipped} 个，失败 ${result.failed} 个）`
			: ''
		void vscode.window.showInformationMessage(
			`已从配置文件夹导入 ${result.imported} 个脚本的书签配置${skippedText}；导入结果：${formatBookmarkLevelSummary(result.bookmarkSummary)}。`,
		)
		return
	}

	if (!absolutePath || !editor) {
		void vscode.window.showInformationMessage('导入单个配置文件前，请先打开要绑定的本地脚本；工作区模式可直接选择配置文件夹。')
		return
	}
	const expectedScope = port.storageScopeForUri(editor.document.uri)
	const importedFileNode = await port.runImportTransaction(async () => {
		const captured = port.captureUndoState()
		const imported = await port.importFile(selected[0].fsPath, absolutePath)
		port.commitImportUndo(captured)
		if (port.storageScopeForUri(editor.document.uri) !== expectedScope) {
			throw new Error('导入完成前活动脚本作用域发生变化，请重新打开目标脚本确认结果。')
		}
		await port.refresh(editor, expectedScope)
		return imported
	})
	void vscode.window.showInformationMessage(
		`已导入并绑定书签配置：${path.basename(absolutePath)}；导入结果：${formatBookmarkLevelSummary(summarizeBookmarkTrees(importedFileNode.subs))}。`,
	)
}
