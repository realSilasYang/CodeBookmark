import { Bookmark } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'
import type { WorkspaceOrderSnapshot } from './WorkspaceOrderViewLoader'

export type { WorkspaceOrderSnapshot } from './WorkspaceOrderViewLoader'

interface BookmarkViewTarget {
	storageScope: string
	scopeFilePath?: string
}

export interface PreparedBookmarkView extends BookmarkViewTarget {
	bookmarks: BookmarkSet
	workspaceOrder: string[] | null
	workspaceOrderFilePath?: string
	workspaceOrderNeedsPersist: boolean
	contentUpdated: boolean
}

interface BookmarkViewPreparationPort {
	currentStorageScope: string | undefined
	currentBookmarks: readonly Bookmark[]
	readBookmarks(activePaths: readonly string[], signal?: AbortSignal): Promise<Bookmark[]>
	readContentBookmarks(bookmarks: BookmarkSet, scopeFilePath: string | undefined, signal?: AbortSignal): Promise<number>
	readWorkspaceOrder(
		bookmarks: BookmarkSet,
		target: BookmarkViewTarget,
		signal?: AbortSignal,
	): Promise<WorkspaceOrderSnapshot>
}

export async function prepareBookmarkView(
	target: BookmarkViewTarget,
	port: BookmarkViewPreparationPort,
	signal?: AbortSignal,
): Promise<PreparedBookmarkView> {
	const pinnedIds = new Set<string>()
	const collectPinned = (bookmarks: readonly Bookmark[]): void => {
		for (const bookmark of bookmarks) {
			if (!bookmark.isFile && bookmark.isPinned) pinnedIds.add(bookmark.id)
			if (bookmark.subs.size > 0) collectPinned(bookmark.subs.values)
		}
	}
	if (target.storageScope === port.currentStorageScope) collectPinned(port.currentBookmarks)

	const activePaths = target.scopeFilePath ? [target.scopeFilePath] : []
	const loaded = await port.readBookmarks(activePaths, signal)
	const bookmarks = new BookmarkSet(loaded)
	bookmarks.mergeDuplicateFileNodes()
	const restorePinned = (items: readonly Bookmark[]): void => {
		for (const bookmark of items) {
			if (pinnedIds.has(bookmark.id)) {
				bookmark.isPinned = true
				bookmark.refreshDisplayProps()
			}
			if (bookmark.subs.size > 0) restorePinned(bookmark.subs.values)
		}
	}
	restorePinned(bookmarks.values)

	const [updated, workspaceOrderSnapshot] = await Promise.all([
		port.readContentBookmarks(bookmarks, target.scopeFilePath, signal),
		port.readWorkspaceOrder(bookmarks, target, signal),
	])
	return {
		bookmarks,
		...target,
		workspaceOrder: workspaceOrderSnapshot.order,
		workspaceOrderFilePath: workspaceOrderSnapshot.filePath,
		workspaceOrderNeedsPersist: workspaceOrderSnapshot.needsPersist,
		contentUpdated: updated > 0,
	}
}
