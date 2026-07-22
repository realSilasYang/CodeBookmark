import * as vscode from 'vscode'
import type { Bookmark } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'
import { SortModeBookmark } from '../models/ViewMode'
import { bookmarkPathKey } from '../util/BookmarkPath'
import { Commands } from '../util/constants/Commands'
import { ContextBookmark } from '../util/ContextValue'
import { logger } from '../util/Logger'
import { isTreeExpandedToLevel } from '../util/TreeExpansionState'
import type { CapturedUndoState } from './UndoManager'

export const BOOKMARK_TREE_MIME_TYPE = 'application/vnd.code.tree.codebookmarktreeview'

interface BookmarkTreeRevealOptions {
	select?: boolean
	focus?: boolean
	expand?: boolean | number
}

export interface BookmarkTreeInteractionPort {
	bookmarks(): BookmarkSet
	workspaceOrder(): string[] | null
	persistWorkspaceOrder(order: string[]): Promise<void>
	absoluteBookmarkPath(bookmarkPath: string): string
	absoluteToRelative(filePath: string): string
	bookmarksForPath(bookmarkPath: string): Bookmark[]
	captureUndoState(workspaceOrder?: string[] | null): CapturedUndoState
	commitUndoState(captured: CapturedUndoState, action: 'reorderFiles' | 'moveBookmarks'): boolean
	saveBookmarks(filePaths: string[]): void
	refreshDecoration(): void
	fireTreeChanged(): void
	expansionRoots(): readonly Bookmark[]
	getChildren(bookmark?: Bookmark): Bookmark[]
	defaultExpandLevel(): number
	treeViewAvailable(): boolean
	revealTreeItem(bookmark: Bookmark, options: BookmarkTreeRevealOptions): Thenable<void> | undefined
	setExpandCollapseContext(expanded: boolean): Promise<void>
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

export function sortBookmarkTreeItems(items: Bookmark[]): Bookmark[] {
	if (SortModeBookmark.mode === SortModeBookmark.Custom) return items
	return [...items].sort((first, second) => {
		if (first.isCodeMarker !== second.isCodeMarker) return first.isCodeMarker ? -1 : 1
		switch (SortModeBookmark.mode) {
			case SortModeBookmark.TimeAsc:
				return first.createdAt - second.createdAt
			case SortModeBookmark.TimeDesc:
				return second.createdAt - first.createdAt
			case SortModeBookmark.LineAsc: {
				const pathComparison = first.path.localeCompare(second.path)
				if (pathComparison !== 0) return pathComparison
				return (first.start?.line || 0) - (second.start?.line || 0)
			}
			case SortModeBookmark.LineDesc: {
				const pathComparison = second.path.localeCompare(first.path)
				if (pathComparison !== 0) return pathComparison
				return (second.start?.line || 0) - (first.start?.line || 0)
			}
			default:
				return 0
		}
	})
}

export function runBookmarkTreeDrag(source: Bookmark[], treeDataTransfer: vscode.DataTransfer): void {
	for (const bookmark of source) {
		if (!bookmark.isBookmarkInvalid) continue
		logger.showWarningMessage('请编辑失效的书签')
		return
	}
	treeDataTransfer.set(BOOKMARK_TREE_MIME_TYPE, new vscode.DataTransferItem(source))
}

async function reorderWorkspaceFiles(
	sourceItems: Bookmark[],
	target: Bookmark | undefined,
	port: BookmarkTreeInteractionPort,
): Promise<boolean> {
	const fileSources = sourceItems.filter(bookmark => bookmark.contextValue === ContextBookmark.File)
	if (fileSources.length === 0) return false
	if (fileSources.length !== sourceItems.length) {
		logger.showWarningMessage('不能同时拖动文件节点和书签节点。')
		return true
	}
	const sourcePaths = [...new Set(fileSources.map(bookmark => bookmark.path))]
	if (sourcePaths.length === 0) return true
	if (target && !target.isFile) {
		logger.showWarningMessage('文件节点只能拖放到文件节点之间或列表空白处。')
		return true
	}

	let savedOrder = port.workspaceOrder() || []
	const currentPaths = new Set<string>()
	for (const child of port.bookmarks().values) {
		if (child.path) currentPaths.add(child.path)
	}
	const currentPathsArray = Array.from(currentPaths)
	savedOrder = savedOrder.filter(savedPath => currentPaths.has(savedPath))
	currentPathsArray.forEach(currentPath => {
		if (!savedOrder.includes(currentPath)) savedOrder.push(currentPath)
	})
	const previousOrder = [...savedOrder]

	const targetPath = target?.contextValue === ContextBookmark.File ? target.path : undefined
	const sourcePathSet = new Set(sourcePaths)
	if (targetPath && sourcePathSet.has(targetPath)) return true
	const orderedSourcePaths = [
		...savedOrder.filter(savedPath => sourcePathSet.has(savedPath)),
		...sourcePaths.filter(sourcePath => !savedOrder.includes(sourcePath)),
	]

	savedOrder = savedOrder.filter(savedPath => !sourcePathSet.has(savedPath))
	if (targetPath) {
		const targetIndex = savedOrder.indexOf(targetPath)
		if (targetIndex >= 0) savedOrder.splice(targetIndex, 0, ...orderedSourcePaths)
		else savedOrder.push(...orderedSourcePaths)
	} else {
		savedOrder.push(...orderedSourcePaths)
	}
	if (savedOrder.length === previousOrder.length
		&& savedOrder.every((savedPath, index) => savedPath === previousOrder[index])) return true

	const captured = port.captureUndoState(previousOrder)
	await port.persistWorkspaceOrder(savedOrder)
	port.commitUndoState(captured, 'reorderFiles')
	port.fireTreeChanged()
	return true
}

function selectedBookmarkGroup(sourceItems: Bookmark[], bookmarks: BookmarkSet): BookmarkSet {
	const resolvedSources = sourceItems
		.map(source => bookmarks.findBookmark(source))
		.filter((source): source is Bookmark => source !== undefined && !source.isFile)
	const uniqueSources = [...new Map(resolvedSources.map(source => [source.id, source])).values()]
	return new BookmarkSet(uniqueSources.filter(sourceItem =>
		!sourceItem.isChildOf(new BookmarkSet(uniqueSources.filter(other => other !== sourceItem))),
	))
}

function moveBookmarks(
	sourceItems: Bookmark[],
	target: Bookmark | undefined,
	port: BookmarkTreeInteractionPort,
): void {
	const bookmarks = port.bookmarks()
	const source = selectedBookmarkGroup(sourceItems, bookmarks)
	if (source.size === 0) return
	const sourcePaths = new Set(source.values.map(bookmark => bookmarkPathKey(bookmark.path)))
	if (sourcePaths.size !== 1) {
		logger.showWarningMessage('不能同时移动来自不同文件的书签。')
		return
	}

	const currentTarget = target ? bookmarks.findBookmark(target) : undefined
	const sourcePath = source.values[0].path
	let destination = currentTarget
	if (!destination) {
		destination = bookmarks.values.find(bookmark => bookmark.isFile && bookmark.path === sourcePath)
	}
	if (!destination) return
	if (bookmarkPathKey(destination.path) !== [...sourcePaths][0]) {
		logger.showWarningMessage('暂不支持跨文件移动书签。')
		return
	}
	for (const bookmark of source) {
		if (bookmark.equals(destination)) return
	}

	const captured = port.captureUndoState()
	const changed = destination.isFile || destination.isPinned
		? bookmarks.moveGroupToNode(source, destination)
		: bookmarks.changeIndexNode(source, destination)
	if (!changed) return

	port.commitUndoState(captured, 'moveBookmarks')
	port.saveBookmarks([port.absoluteBookmarkPath(sourcePath)])
	if (!destination.isFile) void runExpandFolderTreeView(destination, port)
	port.refreshDecoration()
}

export async function runBookmarkTreeDrop(
	target: Bookmark | undefined,
	treeDataTransfer: vscode.DataTransfer,
	port: BookmarkTreeInteractionPort,
): Promise<void> {
	const transferItem = treeDataTransfer.get(BOOKMARK_TREE_MIME_TYPE)
	if (!transferItem) return
	if (SortModeBookmark.mode !== SortModeBookmark.Custom) {
		SortModeBookmark.mode = SortModeBookmark.Custom
		void vscode.window.showInformationMessage('检测到拖拽操作，已自动切换回“自定义排序”模式。')
	}

	const sourceItems = Array.isArray(transferItem.value) ? transferItem.value as Bookmark[] : []
	if (sourceItems.length === 0) return
	if (await reorderWorkspaceFiles(sourceItems, target, port)) return
	moveBookmarks(sourceItems, target, port)
}

function hasReachedDefaultExpandLevel(port: BookmarkTreeInteractionPort): boolean {
	return isTreeExpandedToLevel(
		port.expansionRoots(),
		port.defaultExpandLevel(),
		vscode.TreeItemCollapsibleState.Expanded,
	)
}

export function publishExpandCollapseContext(port: BookmarkTreeInteractionPort): void {
	const expanded = hasReachedDefaultExpandLevel(port)
	void port.setExpandCollapseContext(expanded)
		.catch(error => logger.error(`更新书签展开按钮状态失败: ${errorMessage(error)}`))
}

export async function runToggleExpandCollapse(port: BookmarkTreeInteractionPort): Promise<void> {
	let expanded: boolean
	if (hasReachedDefaultExpandLevel(port)) {
		await vscode.commands.executeCommand(`${Commands.codeBookmarkViewName}.focus`)
		await vscode.commands.executeCommand('list.collapseAll')
		expanded = false
	} else {
		const maximumLevel = port.defaultExpandLevel()
		const expandRecursively = async (items: Bookmark[]): Promise<void> => {
			for (const item of items) {
				const shouldExpand = maximumLevel === 0 || item.level === 0 || item.level < maximumLevel
				try {
					await port.revealTreeItem(item, { expand: shouldExpand, select: false, focus: false })
					if (shouldExpand && item.subs.size > 0) {
						item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
					}
				} catch {}
				if (!shouldExpand) continue
				const children = await port.getChildren(item)
				if (children.length > 0) await expandRecursively(children)
			}
		}
		const roots = await port.getChildren()
		await expandRecursively(roots)
		expanded = hasReachedDefaultExpandLevel(port)
	}
	await port.setExpandCollapseContext(expanded)
}

export async function runExpandFolderTreeView(
	bookmark: Bookmark,
	port: BookmarkTreeInteractionPort,
): Promise<void> {
	if (!port.treeViewAvailable()) return
	try {
		await port.revealTreeItem(bookmark, { select: true, focus: false, expand: true })
		if (bookmark.subs.size > 0) {
			bookmark.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
			publishExpandCollapseContext(port)
		}
	} catch {}
}

export async function runSearchBookmarksInActiveFile(port: BookmarkTreeInteractionPort): Promise<void> {
	const editor = vscode.window.activeTextEditor
	if (!editor) {
		logger.showWarningMessage('当前没有打开的文件')
		return
	}
	const bookmarkPath = port.absoluteToRelative(editor.document.uri.fsPath)
	const bookmarks = port.bookmarksForPath(bookmarkPath)
	if (bookmarks.length === 0) {
		logger.showWarningMessage('当前文件无书签')
		return
	}

	const items: (vscode.QuickPickItem & { bookmark: Bookmark })[] = bookmarks.map(bookmark => ({
		label: `$(bookmark) ${bookmark.label}`,
		description: `第 ${bookmark.start.line + 1} 行`,
		detail: bookmark.content,
		bookmark,
	}))
	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: '搜索当前文件的书签',
		matchOnDescription: true,
		matchOnDetail: true,
	})
	if (selected) void vscode.commands.executeCommand(Commands.openBookmark, selected.bookmark)
}

export async function runSelectBookmarkSortMode(port: BookmarkTreeInteractionPort): Promise<void> {
	const options: vscode.QuickPickItem[] = [
		{ label: '自定义排序', description: SortModeBookmark.mode === SortModeBookmark.Custom ? '（当前）' : '' },
		{ label: '按时间升序', description: SortModeBookmark.mode === SortModeBookmark.TimeAsc ? '（当前）' : '最早添加在前' },
		{ label: '按时间降序', description: SortModeBookmark.mode === SortModeBookmark.TimeDesc ? '（当前）' : '最新添加在前' },
		{ label: '按位置升序', description: SortModeBookmark.mode === SortModeBookmark.LineAsc ? '（当前）' : '从上到下' },
		{ label: '按位置降序', description: SortModeBookmark.mode === SortModeBookmark.LineDesc ? '（当前）' : '从下到上' },
	]
	const selected = await vscode.window.showQuickPick(options, {
		placeHolder: '选择视图排序方式（不影响底层拖拽原始顺序）',
	})
	if (!selected) return
	if (selected.label === '自定义排序') SortModeBookmark.mode = SortModeBookmark.Custom
	else if (selected.label === '按时间升序') SortModeBookmark.mode = SortModeBookmark.TimeAsc
	else if (selected.label === '按时间降序') SortModeBookmark.mode = SortModeBookmark.TimeDesc
	else if (selected.label === '按位置升序') SortModeBookmark.mode = SortModeBookmark.LineAsc
	else if (selected.label === '按位置降序') SortModeBookmark.mode = SortModeBookmark.LineDesc
	port.fireTreeChanged()
}
