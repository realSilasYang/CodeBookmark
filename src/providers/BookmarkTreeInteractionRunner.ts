/**
 * 实现书签树拖放、展开收起、搜索和排序选择，统一校验节点层级与目标位置。
 * 拖放先计算新树再提交，非法跨作用域移动或排序模式不允许的操作不会改动原树。
 */
import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import { errorMessage } from '../util/ErrorMessage'
import type { Bookmark } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'
import { SortModeBookmark } from '../models/ViewMode'
import { Commands } from '../util/constants/Commands'
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
	absoluteToRelative(filePath: string): string
	bookmarksForPath(bookmarkPath: string): Bookmark[]
	captureUndoState(workspaceOrder?: string[] | null): CapturedUndoState
	commitUndoState(captured: CapturedUndoState, action: 'reorderFiles' | 'moveBookmarks'): boolean
	commitTopology(): Promise<void>
	refreshDecoration(): void
	fireTreeChanged(): void
	expansionRoots(): readonly Bookmark[]
	getChildren(bookmark?: Bookmark): Bookmark[]
	defaultExpandLevel(): number
	treeViewAvailable(): boolean
	revealTreeItem(bookmark: Bookmark, options: BookmarkTreeRevealOptions): Thenable<void> | undefined
	setExpandCollapseContext(expanded: boolean): Promise<void>
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
		logger.showWarningMessage(localize("providers.BookmarkTreeInteractionRunner.editTheInvalidBookmarkBeforeMovingIt"))
		return
	}
	treeDataTransfer.set(BOOKMARK_TREE_MIME_TYPE, new vscode.DataTransferItem(source))
}

function selectedNodeGroup(sourceItems: Bookmark[], bookmarks: BookmarkSet): BookmarkSet {
	const resolvedSources = sourceItems
		.map(source => bookmarks.findBookmark(source))
		.filter((source): source is Bookmark => source !== undefined)
	const uniqueSources = [...new Map(resolvedSources.map(source => [source.id, source])).values()]
	return new BookmarkSet(uniqueSources.filter(sourceItem =>
		!sourceItem.isChildOf(new BookmarkSet(uniqueSources.filter(other => other !== sourceItem))),
	))
}

async function moveNodes(
	sourceItems: Bookmark[],
	target: Bookmark | undefined,
	port: BookmarkTreeInteractionPort,
): Promise<void> {
	const bookmarks = port.bookmarks()
	const source = selectedNodeGroup(sourceItems, bookmarks)
	if (source.size === 0) return

	const currentTarget = target ? bookmarks.findBookmark(target) : undefined
	for (const bookmark of source) {
		if (currentTarget && bookmark.equals(currentTarget)) return
	}

	const captured = port.captureUndoState()
	const shouldNest = currentTarget?.isPinned === true
		|| (currentTarget?.isFile === true && source.values.some(bookmark => !bookmark.isFile))
	const destinationParent = shouldNest ? currentTarget : currentTarget?.parent
	const isFileReorder = source.values.every(bookmark =>
		bookmark.isFile && bookmark.parent === destinationParent,
	)
	const changed = !currentTarget || shouldNest
		? bookmarks.moveGroupToNode(source, currentTarget)
		: bookmarks.changeIndexNode(source, currentTarget)
	if (!changed) return

	port.commitUndoState(captured, isFileReorder ? 'reorderFiles' : 'moveBookmarks')
	await port.commitTopology()
	if (currentTarget && shouldNest) {
		void runExpandFolderTreeView(currentTarget, port)
	}
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
		void vscode.window.showInformationMessage(localize("providers.BookmarkTreeInteractionRunner.draggingDetectedTheViewAutomaticallySwitchedBackToCustom"))
	}

	const sourceItems = Array.isArray(transferItem.value) ? transferItem.value as Bookmark[] : []
	if (sourceItems.length === 0) return
	await moveNodes(sourceItems, target, port)
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
		.catch(error => logger.error(localize("providers.BookmarkTreeInteractionRunner.failedToUpdateTheBookmarkExpandCollapseButtonState", { errorMessage: errorMessage(error) })))
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
				const shouldExpand = maximumLevel === 0 || item.treeDepth < maximumLevel
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
		logger.showWarningMessage(localize("providers.BookmarkTreeInteractionRunner.noFileIsCurrentlyOpen"))
		return
	}
	const bookmarkPath = port.absoluteToRelative(editor.document.uri.fsPath)
	const bookmarks = port.bookmarksForPath(bookmarkPath)
	if (bookmarks.length === 0) {
		logger.showWarningMessage(localize("providers.BookmarkTreeInteractionRunner.theCurrentFileHasNoBookmarks"))
		return
	}

	const items: (vscode.QuickPickItem & { bookmark: Bookmark })[] = bookmarks.map(bookmark => ({
		label: `$(bookmark) ${bookmark.label}`,
		description: localize("providers.BookmarkTreeInteractionRunner.line", { line: bookmark.start.line + 1 }),
		detail: bookmark.content,
		bookmark,
	}))
	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: localize("providers.BookmarkTreeInteractionRunner.searchBookmarksInTheCurrentFile"),
		matchOnDescription: true,
		matchOnDetail: true,
	})
	if (selected) void vscode.commands.executeCommand(Commands.openBookmark, selected.bookmark)
}

export async function runSelectBookmarkSortMode(port: BookmarkTreeInteractionPort): Promise<void> {
	const current = localize("providers.BookmarkTreeInteractionRunner.current")
	const options: Array<vscode.QuickPickItem & { mode: number }> = [
		{ mode: SortModeBookmark.Custom, label: localize("providers.BookmarkTreeInteractionRunner.customOrder"), description: SortModeBookmark.mode === SortModeBookmark.Custom ? current : '' },
		{ mode: SortModeBookmark.TimeAsc, label: localize("providers.BookmarkTreeInteractionRunner.timeAscending"), description: SortModeBookmark.mode === SortModeBookmark.TimeAsc ? current : localize("providers.BookmarkTreeInteractionRunner.oldestFirst") },
		{ mode: SortModeBookmark.TimeDesc, label: localize("providers.BookmarkTreeInteractionRunner.timeDescending"), description: SortModeBookmark.mode === SortModeBookmark.TimeDesc ? current : localize("providers.BookmarkTreeInteractionRunner.newestFirst") },
		{ mode: SortModeBookmark.LineAsc, label: localize("providers.BookmarkTreeInteractionRunner.positionAscending"), description: SortModeBookmark.mode === SortModeBookmark.LineAsc ? current : localize("providers.BookmarkTreeInteractionRunner.topToBottom") },
		{ mode: SortModeBookmark.LineDesc, label: localize("providers.BookmarkTreeInteractionRunner.positionDescending"), description: SortModeBookmark.mode === SortModeBookmark.LineDesc ? current : localize("providers.BookmarkTreeInteractionRunner.bottomToTop") },
	]
	const selected = await vscode.window.showQuickPick(options, {
		placeHolder: localize("providers.BookmarkTreeInteractionRunner.chooseTheViewOrderDoesNotChangeTheUnderlying"),
	})
	if (!selected) return
	SortModeBookmark.mode = selected.mode
	port.fireTreeChanged()
}
