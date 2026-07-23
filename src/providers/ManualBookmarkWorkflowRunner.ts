/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `ManualBookmarkWorkflowRunner`。
 *
 * 实现要点：执行一次边界清晰的工作流，通过端口注入副作用以便独立验证每条分支。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`ManualBookmarkWorkflowPort`、`runForceAddBookmark`、`runForceDeleteBookmark`、`runToggleBookmark`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as vscode from 'vscode'
import { Bookmark, CursorIndex } from '../models/Bookmark'
import { formatBookmarkLevelSummary, summarizeBookmarks } from '../util/BookmarkStatistics'
import { logger } from '../util/Logger'
import { localize } from '../i18n/Localization'

type ManualBookmarkUndoAction = 'addBookmarks' | 'deleteBookmarks' | 'toggleBookmarks'

export interface ManualBookmarkWorkflowPort {
	showInputBox(options: vscode.InputBoxOptions): Thenable<string | undefined>
	absoluteToRelative(filePath: string): string
	updateBookmarkContextAnchors(bookmark: Bookmark, document: vscode.TextDocument): void
	bookmarksForPath(pathRel: string): Bookmark[]
	findBookmarkById(id: string): Bookmark | undefined
	bookmarkContainsCodeMarker(bookmark: Bookmark): boolean
	warnProtectedCodeMarkers(count: number): void
	deleteBookmark(id: string): boolean
	addBookmark(bookmark: Bookmark): Bookmark | undefined
	saveUndoState(action: ManualBookmarkUndoAction): void
	saveBookmarks(filePaths: string[]): void
	refreshDecoration(): void
	expandPinnedContainer(bookmark: Bookmark): void
}

function uniqueSelections(selections: readonly vscode.Selection[]): vscode.Selection[] {
	const seenLines = new Set<number>()
	return selections.filter(selection => {
		if (seenLines.has(selection.start.line)) return false
		seenLines.add(selection.start.line)
		return true
	})
}

function defaultLabel(document: vscode.TextDocument, selection: vscode.Selection, maxLength: number): string {
	const selected = document.getText(selection).split(/\r?\n/, 1)[0].trim()
	const value = selected || document.lineAt(selection.start.line).text.trim() || localize('未命名', 'Untitled')
	return value.slice(0, maxLength)
}

function createBookmarkFromDocument(
	document: vscode.TextDocument,
	pathRel: string,
	label: string,
	start: vscode.Position,
	end: vscode.Position,
	port: ManualBookmarkWorkflowPort,
): Bookmark {
	const content = start.isEqual(end)
		? document.lineAt(start.line).text
		: document.getText(new vscode.Range(start, end))
	const bookmark = new Bookmark({
		path: pathRel,
		label,
		content,
		start: CursorIndex.from(start),
		end: CursorIndex.from(end),
	})
	port.updateBookmarkContextAnchors(bookmark, document)
	return bookmark
}

async function prepareBookmarks(
	editor: vscode.TextEditor,
	selections: readonly vscode.Selection[],
	port: ManualBookmarkWorkflowPort,
): Promise<Bookmark[] | undefined> {
	const deduplicated = uniqueSelections(selections)
	if (deduplicated.length === 0) return []
	const pathRel = port.absoluteToRelative(editor.document.uri.fsPath)

	if (deduplicated.length === 1) {
		const selection = deduplicated[0]
		const label = await port.showInputBox({
			prompt: localize('请输入书签标签', 'Enter a bookmark label'),
			value: defaultLabel(editor.document, selection, 80),
		})
		if (label === undefined) return undefined
		if (label.trim() === '') {
			logger.showWarningMessage(localize('标签不能为空', 'The label cannot be empty.'))
			return undefined
		}
		return [createBookmarkFromDocument(
			editor.document,
			pathRel,
			label,
			selection.start,
			selection.end,
			port,
		)]
	}

	const defaultLabels = deduplicated.map(selection => defaultLabel(editor.document, selection, 30))
	const labelString = await port.showInputBox({
		prompt: localize(
			`请输入 ${deduplicated.length} 个书签标签（使用“│”分隔）`,
			`Enter ${deduplicated.length} bookmark labels, separated by “│”`,
		),
		value: defaultLabels.join(' │ '),
	})
	if (labelString === undefined) return undefined
	const labels = labelString.split('│').map(label => label.trim())
	return deduplicated.map((selection, index) => createBookmarkFromDocument(
		editor.document,
		pathRel,
		labels[index] || defaultLabels[index],
		selection.start,
		selection.end,
		port,
	))
}

function addPreparedBookmarks(
	bookmarks: readonly Bookmark[],
	port: ManualBookmarkWorkflowPort,
): Bookmark | undefined {
	let pinnedContainer: Bookmark | undefined
	for (const bookmark of bookmarks) pinnedContainer = port.addBookmark(bookmark) ?? pinnedContainer
	return pinnedContainer
}

function bookmarkIdsByLine(editor: vscode.TextEditor, port: ManualBookmarkWorkflowPort): Map<number, string[]> {
	const bookmarkPath = port.absoluteToRelative(editor.document.uri.fsPath)
	const lines = new Map<number, string[]>()
	for (const bookmark of port.bookmarksForPath(bookmarkPath)) {
		const ids = lines.get(bookmark.start.line)
		if (ids) ids.push(bookmark.id)
		else lines.set(bookmark.start.line, [bookmark.id])
	}
	return lines
}

export async function runForceAddBookmark(
	editor: vscode.TextEditor,
	port: ManualBookmarkWorkflowPort,
): Promise<void> {
	const bookmarks = await prepareBookmarks(editor, editor.selections, port)
	if (!bookmarks || bookmarks.length === 0) return
	port.saveUndoState('addBookmarks')
	const pinnedContainer = addPreparedBookmarks(bookmarks, port)
	if (pinnedContainer) port.expandPinnedContainer(pinnedContainer)
	port.saveBookmarks([editor.document.uri.fsPath])
	port.refreshDecoration()
	if (bookmarks.length > 1) {
		const summary = formatBookmarkLevelSummary(summarizeBookmarks(bookmarks))
		logger.showMessage(localize(
			`批量添加完成，新增结果：${summary}。`,
			`Batch add completed. Added: ${summary}.`,
		))
	}
}

export async function runForceDeleteBookmark(
	editor: vscode.TextEditor,
	port: ManualBookmarkWorkflowPort,
): Promise<void> {
	const processedLines = new Set<number>()
	let protectedCount = 0
	let hasChange = false
	const lines = bookmarkIdsByLine(editor, port)

	for (const selection of editor.selections) {
		const lineNumber = selection.start.line
		if (processedLines.has(lineNumber)) continue
		processedLines.add(lineNumber)
		const bookmarkIds = lines.get(lineNumber)
		if (!bookmarkIds) continue
		for (const id of bookmarkIds) {
			const bookmark = port.findBookmarkById(id)
			if (!bookmark) continue
			if (port.bookmarkContainsCodeMarker(bookmark)) {
				protectedCount++
				continue
			}
			if (!hasChange) port.saveUndoState('deleteBookmarks')
			if (port.deleteBookmark(id)) hasChange = true
		}
	}
	if (protectedCount > 0) port.warnProtectedCodeMarkers(protectedCount)

	if (hasChange) {
		port.saveBookmarks([editor.document.uri.fsPath])
		port.refreshDecoration()
	}
}

export async function runToggleBookmark(
	editor: vscode.TextEditor,
	port: ManualBookmarkWorkflowPort,
): Promise<void> {
	const lines = bookmarkIdsByLine(editor, port)
	const idsToDelete = new Set<string>()
	const selectionsToAdd: vscode.Selection[] = []

	for (const selection of uniqueSelections(editor.selections)) {
		const bookmarkIds = lines.get(selection.start.line)
		if (bookmarkIds) {
			for (const id of bookmarkIds) idsToDelete.add(id)
		} else {
			selectionsToAdd.push(selection)
		}
	}
	let protectedCount = 0
	for (const id of idsToDelete) {
		const bookmark = port.findBookmarkById(id)
		if (bookmark && port.bookmarkContainsCodeMarker(bookmark)) {
			idsToDelete.delete(id)
			protectedCount++
		}
	}
	if (protectedCount > 0) port.warnProtectedCodeMarkers(protectedCount)

	const bookmarksToAdd = selectionsToAdd.length > 0
		? await prepareBookmarks(editor, selectionsToAdd, port)
		: []
	if (bookmarksToAdd === undefined) return
	if (idsToDelete.size === 0 && bookmarksToAdd.length === 0) return

	port.saveUndoState(idsToDelete.size > 0 && bookmarksToAdd.length > 0
		? 'toggleBookmarks'
		: idsToDelete.size > 0 ? 'deleteBookmarks' : 'addBookmarks')
	for (const id of idsToDelete) port.deleteBookmark(id)
	const pinnedContainer = addPreparedBookmarks(bookmarksToAdd, port)
	if (pinnedContainer) port.expandPinnedContainer(pinnedContainer)
	port.saveBookmarks([editor.document.uri.fsPath])
	port.refreshDecoration()
}
