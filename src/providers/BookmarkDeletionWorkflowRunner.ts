/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `BookmarkDeletionWorkflowRunner`。
 *
 * 实现要点：执行一次边界清晰的工作流，通过端口注入副作用以便独立验证每条分支。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`BookmarkDeletionWorkflowPort`、`hasInvalidBookmarks`、`runClearInvalidBookmarks`、`runDeleteBookmarks`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as vscode from 'vscode'
import { Bookmark } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'
import { formatBookmarkLevelSummary, summarizeBookmarks, summarizeBookmarkTrees } from '../util/BookmarkStatistics'
import { logger } from '../util/Logger'
import { localize } from '../i18n/Localization'

type BookmarkDeletionUndoAction = 'clearInvalidBookmarks' | 'deleteBookmarks'

export interface BookmarkDeletionWorkflowPort {
	bookmarks(): BookmarkSet
	resolveTargets(bookmark?: Bookmark, selectedBookmarks?: Bookmark[]): Bookmark[]
	findBookmark(bookmark: Bookmark): Bookmark | undefined
	bookmarkContainsCodeMarker(bookmark: Bookmark): boolean
	warnProtectedCodeMarkers(count: number): void
	deleteBookmark(id: string): boolean
	absoluteBookmarkPath(bookmarkPath: string): string
	saveUndoState(action: BookmarkDeletionUndoAction): void
	saveBookmarks(filePaths: string[]): void
	refreshDecoration(): void
}

function collectInvalidBookmarks(bookmarks: BookmarkSet): Bookmark[] {
	const invalid: Bookmark[] = []
	for (const bookmark of bookmarks.values) {
		if (bookmark.isBookmarkInvalid) {
			invalid.push(bookmark)
		} else if (bookmark.subs.size > 0) {
			invalid.push(...collectInvalidBookmarks(bookmark.subs))
		}
	}
	return invalid
}

export function hasInvalidBookmarks(bookmarks: BookmarkSet): boolean {
	for (const bookmark of bookmarks.values) {
		if (bookmark.isBookmarkInvalid) return true
		if (bookmark.subs.size > 0 && hasInvalidBookmarks(bookmark.subs)) return true
	}
	return false
}

function moveChildrenToParentWhenDelete(
	bookmark: Bookmark,
	port: BookmarkDeletionWorkflowPort,
): boolean {
	const bookmarks = port.bookmarks()
	const subs = bookmarks.findBookmark(bookmark)?.subs
	const parent = bookmarks.findParentBookmark(bookmark)
	if (!subs) return false
	if (!bookmarks.moveGroupToNode(subs, parent)) return false
	port.deleteBookmark(bookmark.id)
	return true
}

export function runClearInvalidBookmarks(port: BookmarkDeletionWorkflowPort): void {
	const invalidBookmarks = collectInvalidBookmarks(port.bookmarks())
	const deletableBookmarks = invalidBookmarks.filter(bookmark => !port.bookmarkContainsCodeMarker(bookmark))
	const protectedCount = invalidBookmarks.length - deletableBookmarks.length
	if (protectedCount > 0) port.warnProtectedCodeMarkers(protectedCount)
	if (deletableBookmarks.length === 0) return

	const changedPaths = deletableBookmarks.map(bookmark => port.absoluteBookmarkPath(bookmark.path))
	port.saveUndoState('clearInvalidBookmarks')
	for (const bookmark of deletableBookmarks) port.deleteBookmark(bookmark.id)
	port.refreshDecoration()
	port.saveBookmarks(changedPaths)
}

type DeletionMode = 'delete' | 'keepChildren'

async function confirmDeletion(targets: Bookmark[]): Promise<DeletionMode | undefined> {
	const prompt = targets.length > 1
		? localize(
			`选中了 ${targets.length} 项，其中包含带子书签的文件夹，确定要删除吗？`,
			`${targets.length} items are selected, including folders with child bookmarks. Delete them?`,
		)
		: localize('确定要删除包含子书签的文件夹吗？', 'Delete the folder that contains child bookmarks?')
	const choices = [
		{ title: localize('是', 'Delete'), mode: 'delete' as const },
		{ title: localize('保留子书签，仅删除当前项', 'Keep Children and Delete This Item'), mode: 'keepChildren' as const },
		{ title: localize('否', 'Cancel'), mode: 'cancel' as const },
	]
	const confirm = await vscode.window.showInformationMessage(prompt, ...choices)
	if (!confirm || confirm.mode === 'cancel') return undefined
	return confirm.mode
}

export async function runDeleteBookmarks(
	bookmark: Bookmark | undefined,
	selectedBookmarks: Bookmark[] | undefined,
	port: BookmarkDeletionWorkflowPort,
): Promise<void> {
	const candidateTargets = port.resolveTargets(bookmark, selectedBookmarks)
		.map(target => port.findBookmark(target))
		.filter((target): target is Bookmark => target !== undefined)
	const uniqueTargets = [...new Map(candidateTargets.map(target => [target.id, target])).values()]
	let targets = uniqueTargets.filter(target =>
		!target.isChildOf(new BookmarkSet(uniqueTargets.filter(other => other !== target))),
	)
	if (targets.length === 0) return

	const protectedTargets = targets.filter(target => port.bookmarkContainsCodeMarker(target))
	if (protectedTargets.length > 0) port.warnProtectedCodeMarkers(protectedTargets.length)
	targets = targets.filter(target => !port.bookmarkContainsCodeMarker(target))
	if (targets.length === 0) return

	const hasAnySubs = targets.some(target => target.subs.size > 0)
	let confirmMode: DeletionMode = 'delete'
	if (hasAnySubs) {
		const confirmed = await confirmDeletion(targets)
		if (!confirmed) return
		confirmMode = confirmed
	}

	let hasChanges = false
	const deletedSummary = confirmMode === 'keepChildren'
		? summarizeBookmarks(targets)
		: summarizeBookmarkTrees(targets)
	const changedPaths = targets.map(target => port.absoluteBookmarkPath(target.path))
	port.saveUndoState('deleteBookmarks')
	for (const target of targets) {
		if (target.subs.size > 0 && confirmMode === 'keepChildren') {
			if (moveChildrenToParentWhenDelete(target, port)) hasChanges = true
		} else {
			port.deleteBookmark(target.id)
			hasChanges = true
		}
	}

	if (!hasChanges) return
	port.saveBookmarks(changedPaths)
	port.refreshDecoration()
	if (targets.length > 1) {
		const summary = formatBookmarkLevelSummary(deletedSummary)
		logger.showMessage(localize(
			`批量删除完成，删除结果：${summary}。`,
			`Batch deletion completed. Deleted: ${summary}.`,
		))
	}
}
