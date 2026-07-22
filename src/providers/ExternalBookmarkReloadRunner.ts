import * as path from 'path'
import { Bookmark } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'
import type { ViewTransitionState } from '../util/ViewTransition'

interface ExternalBookmarkReloadPort {
	enqueue<T>(generation: number, operation: () => Promise<T>): Promise<T | undefined>
	readBookmarks(activePaths: readonly string[], filenames: readonly string[], signal?: AbortSignal): Promise<Bookmark[]>
	isCurrent(scope: string, generation: number): boolean
	currentBookmarks(): BookmarkSet
	clearExternalBookmarkCaches(): void
	publishTransition(transition: ViewTransitionState, generation: number): Promise<void>
	refreshDecorations(): void
}

export async function reloadExternalBookmarkFiles(
	fileNames: readonly string[],
	scope: string | undefined,
	scopeFilePath: string | undefined,
	generation: number,
	signal: AbortSignal | undefined,
	port: ExternalBookmarkReloadPort,
): Promise<void> {
	if (!scope || fileNames.length === 0) return
	const normalizedNames = [...new Set(fileNames
		.filter(name => name.toLowerCase().endsWith('.json'))
		.map(name => path.basename(name)))]
	if (normalizedNames.length === 0) return

	const activePaths = scopeFilePath ? [scopeFilePath] : []
	const loaded = await port.enqueue(
		generation,
		() => port.readBookmarks(activePaths, normalizedNames, signal),
	)
	if (!loaded || !port.isCurrent(scope, generation)) return

	const bookmarks = port.currentBookmarks()
	const previousHasContent = bookmarks.size > 0
	const scriptIds = new Set(normalizedNames.map(name => path.basename(name, path.extname(name)).toLowerCase()))
	const pinnedIds = new Set<string>()
	const collectPinned = (items: readonly Bookmark[]): void => {
		for (const bookmark of items) {
			if (!bookmark.isFile && bookmark.isPinned) pinnedIds.add(bookmark.id)
			if (bookmark.subs.size > 0) collectPinned(bookmark.subs.values)
		}
	}
	collectPinned(bookmarks.values)
	bookmarks.values = bookmarks.values.filter(bookmark => !scriptIds.has(bookmark.scriptId?.toLowerCase() ?? ''))
	bookmarks.addAll(loaded)
	bookmarks.mergeDuplicateFileNodes(scriptIds)

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
	port.clearExternalBookmarkCaches()
	await port.publishTransition({
		previousHasContent,
		nextHasContent: bookmarks.size > 0,
	}, generation)
	if (port.isCurrent(scope, generation)) port.refreshDecorations()
}
