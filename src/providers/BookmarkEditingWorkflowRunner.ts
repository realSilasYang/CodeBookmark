/**
 * 实现重命名、移动、换图标、恢复默认图标和置顶等书签编辑操作。
 * 每次操作先验证节点仍属于当前树，再生成撤销记录并只保存实际受影响的脚本。
 */
import fs = require('fs')
import * as path from 'path'
import * as vscode from 'vscode'
import { CursorIndex, type Bookmark } from '../models/Bookmark'
import { formatBookmarkLevelSummary, summarizeBookmarks } from '../util/BookmarkStatistics'
import { ContextBookmark } from '../util/ContextValue'
import { Helper } from '../util/Helper'
import { logger } from '../util/Logger'
import { localize } from '../i18n/Localization'

type BookmarkEditingUndoAction =
	| 'renameBookmarks'
	| 'updateBookmarkPosition'
	| 'updateBookmarkAndRename'
	| 'changeBookmarkIcons'
	| 'restoreBookmarkIcons'
	| 'setBookmarkContainer'
	| 'unsetBookmarkContainer'

export interface BookmarkEditingWorkflowPort {
	resolveTargets(bookmark?: Bookmark, selectedBookmarks?: Bookmark[]): Bookmark[]
	findBookmark(bookmark: Bookmark): Bookmark | undefined
	temporaryFolder(): string | null | undefined
	registerDisposables(...disposables: vscode.Disposable[]): void
	absoluteBookmarkPath(bookmarkPath: string): string
	canUpdateBookmarkInEditor(bookmark: Bookmark, editor: vscode.TextEditor): boolean
	updateBookmarkContextAnchors(bookmark: Bookmark, document: vscode.TextDocument): void
	showIconPicker(
		initialIcon: string,
		defaultIcon: string | undefined,
		onDidSelectIcon: (iconName: string) => void,
	): void
	pinBookmark(bookmark: Bookmark): Bookmark[]
	publishTreeChange(bookmark: Bookmark): void
	revealPinnedBookmarkLater(bookmark: Bookmark): void
	saveUndoState(action: BookmarkEditingUndoAction): void
	saveBookmarks(filePaths: string[]): void
	refreshDecoration(): void
	commitTopology(): Promise<void>
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function resolveEditableTargets(
	bookmark: Bookmark | undefined,
	selectedBookmarks: Bookmark[] | undefined,
	port: BookmarkEditingWorkflowPort,
): Bookmark[] {
	return port.resolveTargets(bookmark, selectedBookmarks)
		.map(target => port.findBookmark(target))
		.filter((target): target is Bookmark => target !== undefined && !target.isBookmarkInvalid)
}

function bookmarkDepth(bookmark: Bookmark): number {
	let depth = 0
	let current = bookmark.parent
	while (current) {
		depth++
		current = current.parent
	}
	return depth
}

async function promptForLabel(bookmark: Bookmark): Promise<string | undefined> {
	const newLabel = await vscode.window.showInputBox({
		prompt: localize("providers.BookmarkEditingWorkflowRunner.editBookmarkLabel"),
		value: `${bookmark.label}`,
	})
	if (newLabel === undefined) return undefined
	if (newLabel.trim() === '') {
		logger.showWarningMessage(localize("providers.BookmarkEditingWorkflowRunner.theLabelCannotBeEmpty"))
		return undefined
	}
	return Helper.formatLabelSpacing(newLabel)
}

async function editLabel(bookmark: Bookmark, port: BookmarkEditingWorkflowPort): Promise<boolean> {
	const newLabel = await promptForLabel(bookmark)
	if (newLabel === undefined || newLabel === `${bookmark.label}`) return false
	port.saveUndoState('renameBookmarks')
	bookmark.label = newLabel
	if (bookmark.isFile) bookmark.fileLabelCustomized = true
	bookmark.refreshDisplayProps()
	port.saveBookmarks([port.absoluteBookmarkPath(bookmark.path)])
	port.refreshDecoration()
	return true
}

function replaceBookmark(
	bookmark: Bookmark,
	port: BookmarkEditingWorkflowPort,
	skipSaveState = false,
): void {
	const editor = vscode.window.activeTextEditor
	if (!editor) return
	if (!port.canUpdateBookmarkInEditor(bookmark, editor)) {
		logger.showWarningMessage(localize("providers.BookmarkEditingWorkflowRunner.aBookmarkPositionCanOnlyBeUpdatedWithinIts"))
		return
	}
	if (!skipSaveState) port.saveUndoState('updateBookmarkPosition')
	const startPosition = editor.selection.start
	const endPosition = editor.selection.end
	bookmark.content = startPosition.isEqual(endPosition)
		? editor.document.lineAt(startPosition.line).text
		: editor.document.getText(editor.selection)
	bookmark.start = CursorIndex.from(startPosition)
	bookmark.end = CursorIndex.from(endPosition)
	port.updateBookmarkContextAnchors(bookmark, editor.document)
	bookmark.contextValue = ContextBookmark.Bookmark
	bookmark.refreshDisplayProps()
	port.saveBookmarks([editor.document.uri.fsPath])
	port.refreshDecoration()
}

export async function runRenameBookmark(
	bookmark: Bookmark | undefined,
	selectedBookmarks: Bookmark[] | undefined,
	port: BookmarkEditingWorkflowPort,
): Promise<void> {
	const resolvedTargets = resolveEditableTargets(bookmark, selectedBookmarks, port)
	if (resolvedTargets.length === 0) return

	if (resolvedTargets.length === 1) {
		await editLabel(resolvedTargets[0], port)
		return
	}

	const temporaryFolder = port.temporaryFolder()
	if (!temporaryFolder) return
	await fs.promises.mkdir(temporaryFolder, { recursive: true })
	const temporaryUri = vscode.Uri.file(path.join(temporaryFolder, `batch-rename-${Date.now()}.txt`))
	const content = resolvedTargets
		.map(target => '\t'.repeat(bookmarkDepth(target)) + target.label)
		.join('\n')
	await fs.promises.writeFile(temporaryUri.fsPath, content, 'utf8')

	const document = await vscode.workspace.openTextDocument(temporaryUri)
	await vscode.window.showTextDocument(document, { preview: false })
	void vscode.window.showInformationMessage(localize("providers.BookmarkEditingWorkflowRunner.tipTabIndentationOnlyRepresentsHierarchyEditTheText"))

	const changeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
		if (event.document === document && document.isDirty) {
			void document.save().then(undefined, error => logger.error(localize("providers.BookmarkEditingWorkflowRunner.failedToSaveTheTemporaryBatchRenameFile", { errorMessage: errorMessage(error) })))
		}
	})
	const closeDisposable = vscode.workspace.onDidCloseTextDocument(closedDocument => {
		if (closedDocument !== document) return
		changeDisposable.dispose()
		closeDisposable.dispose()
		void (async () => {
			const lines = document.getText().split(/\r?\n/)
			const changes: Array<{ bookmark: Bookmark, label: string }> = []
			for (let index = 0; index < resolvedTargets.length && index < lines.length; index++) {
				const current = port.findBookmark(resolvedTargets[index])
				if (!current) continue
				const newLabel = lines[index].replace(/^\t+/, '').trim()
				const formatted = Helper.formatLabelSpacing(newLabel)
				if (formatted && formatted !== `${current.label}`) changes.push({ bookmark: current, label: formatted })
			}

			if (changes.length > 0) {
				port.saveUndoState('renameBookmarks')
				const changedPaths = new Set<string>()
				for (const change of changes) {
					change.bookmark.label = change.label
					if (change.bookmark.isFile) change.bookmark.fileLabelCustomized = true
					change.bookmark.refreshDisplayProps()
					changedPaths.add(port.absoluteBookmarkPath(change.bookmark.path))
				}
				port.refreshDecoration()
				port.saveBookmarks(Array.from(changedPaths))
				const summary = formatBookmarkLevelSummary(summarizeBookmarks(changes.map(change => change.bookmark)))
				logger.showMessage(localize("providers.BookmarkEditingWorkflowRunner.batchRenameCompletedUpdated", { summary }))
			}
		})().catch(error => logger.error(localize("providers.BookmarkEditingWorkflowRunner.failedToApplyBatchRename", { errorMessage: errorMessage(error) }))).finally(() => {
			void fs.promises.unlink(temporaryUri.fsPath)
				.catch(error => logger.error(localize("providers.BookmarkEditingWorkflowRunner.failedToCleanUpTheTemporaryBatchRenameFile", { errorMessage: errorMessage(error) })))
		})
	})
	port.registerDisposables(changeDisposable, closeDisposable)
}

export async function runUpdateBookmarkPosition(
	bookmark: Bookmark,
	port: BookmarkEditingWorkflowPort,
): Promise<void> {
	const current = port.findBookmark(bookmark)
	if (!current) return
	replaceBookmark(current, port)
}

export async function runUpdateBookmarkPositionAndRename(
	bookmark: Bookmark,
	port: BookmarkEditingWorkflowPort,
): Promise<void> {
	const current = port.findBookmark(bookmark)
	if (!current) return
	const editor = vscode.window.activeTextEditor
	if (!editor) return
	if (!port.canUpdateBookmarkInEditor(current, editor)) {
		logger.showWarningMessage(localize("providers.BookmarkEditingWorkflowRunner.aBookmarkPositionCanOnlyBeUpdatedWithinIts"))
		return
	}
	if (editor.document.lineAt(editor.selection.start.line).text === '') {
		void vscode.window.showWarningMessage(localize("providers.BookmarkEditingWorkflowRunner.theCurrentLineIsEmptySoTheBookmarkCannot"))
		return
	}
	const newLabel = await promptForLabel(current)
	if (newLabel === undefined) return
	port.saveUndoState('updateBookmarkAndRename')
	current.label = newLabel
	replaceBookmark(current, port, true)
}

export async function runChangeBookmarkIcons(
	bookmark: Bookmark | undefined,
	selectedBookmarks: Bookmark[] | undefined,
	port: BookmarkEditingWorkflowPort,
): Promise<void> {
	const resolvedTargets = resolveEditableTargets(bookmark, selectedBookmarks, port)
	if (resolvedTargets.length === 0) return

	let initialIcon = resolvedTargets[0].icon || ''
	for (let index = 1; index < resolvedTargets.length; index++) {
		if ((resolvedTargets[index].icon || '') !== initialIcon) {
			initialIcon = ''
			break
		}
	}
	const firstDefaultIcon = resolvedTargets[0].defaultIconName
	const commonDefaultIcon = resolvedTargets.every(target => target.defaultIconName === firstDefaultIcon)
		? firstDefaultIcon
		: undefined

	port.showIconPicker(initialIcon, commonDefaultIcon, iconName => {
		const changedBookmarks = resolvedTargets.filter(target => target.icon !== iconName)
		if (changedBookmarks.length === 0) return
		port.saveUndoState('changeBookmarkIcons')
		const changedPaths = new Set<string>()
		for (const changedBookmark of changedBookmarks) {
			changedBookmark.icon = iconName
			if (changedBookmark.codeMarker) {
				changedBookmark.codeMarker.iconCustomized = iconName !== changedBookmark.defaultIconName
			}
			changedBookmark.refreshDisplayProps()
			changedPaths.add(port.absoluteBookmarkPath(changedBookmark.path))
		}
		port.saveBookmarks(Array.from(changedPaths))
		port.refreshDecoration()
	})
}

export async function runRestoreDefaultBookmarkIcons(
	bookmark: Bookmark | undefined,
	selectedBookmarks: Bookmark[] | undefined,
	port: BookmarkEditingWorkflowPort,
): Promise<void> {
	const resolvedTargets = resolveEditableTargets(bookmark, selectedBookmarks, port)
	if (resolvedTargets.length === 0) return
	const changedBookmarks = resolvedTargets.filter(target => target.icon !== target.defaultIconName)
	if (changedBookmarks.length === 0) return

	port.saveUndoState('restoreBookmarkIcons')
	const changedPaths = new Set<string>()
	for (const changedBookmark of changedBookmarks) {
		changedBookmark.icon = changedBookmark.defaultIconName
		if (changedBookmark.codeMarker) changedBookmark.codeMarker.iconCustomized = false
		changedBookmark.refreshDisplayProps()
		changedPaths.add(port.absoluteBookmarkPath(changedBookmark.path))
	}
	port.saveBookmarks(Array.from(changedPaths))
	port.refreshDecoration()
}

export async function runTogglePinnedBookmark(
	bookmark: Bookmark,
	port: BookmarkEditingWorkflowPort,
): Promise<void> {
	const current = port.findBookmark(bookmark)
	if (!current || current.isBookmarkInvalid) return
	port.saveUndoState(current.isPinned ? 'unsetBookmarkContainer' : 'setBookmarkContainer')
	const modified = port.pinBookmark(current)
	for (const changedBookmark of modified) port.publishTreeChange(changedBookmark)
	await port.commitTopology()
	port.refreshDecoration()
	if (current.isPinned) port.revealPinnedBookmarkLater(current)
}
