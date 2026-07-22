import type { Bookmark } from '../models/Bookmark'
import type { PreparedBookmarkView } from './BookmarkViewPreparation'
import type { ViewTransitionState } from '../util/ViewTransition'

interface BookmarkViewCommitPort {
	currentStorageScope(): string | undefined
	currentBookmarkCount(): number
	handleStorageScopeChange(): void
	setCurrentStorageScope(storageScope: string): void
	setCurrentScopeFilePath(scopeFilePath: string | undefined): void
	setWorkspaceOrder(order: string[] | null): void
	setBookmarks(bookmarks: PreparedBookmarkView['bookmarks']): void
	rebuildFileNodeCache(bookmarks: readonly Bookmark[]): void
	invalidatePathIndex(): void
}

export function commitBookmarkView(
	prepared: PreparedBookmarkView,
	port: BookmarkViewCommitPort,
): ViewTransitionState {
	const previousHasContent = port.currentBookmarkCount() > 0
	if (prepared.storageScope !== port.currentStorageScope()) port.handleStorageScopeChange()
	port.setCurrentStorageScope(prepared.storageScope)
	port.setCurrentScopeFilePath(prepared.scopeFilePath)
	port.setWorkspaceOrder(prepared.workspaceOrder)
	port.setBookmarks(prepared.bookmarks)
	port.rebuildFileNodeCache(prepared.bookmarks.values)
	port.invalidatePathIndex()
	return { previousHasContent, nextHasContent: prepared.bookmarks.size > 0 }
}
