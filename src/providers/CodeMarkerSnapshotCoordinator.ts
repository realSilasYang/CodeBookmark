import type { Bookmark } from '../models/Bookmark'
import type { BookmarkSet } from '../models/BookmarkSet'
import {
	synchronizeCodeMarkerBookmarks,
	type CodeMarkerSyncResult,
} from '../util/CodeMarkerBookmarks'
import {
	MAX_CODE_MARKERS_PER_FILE,
	scanCodeMarkers,
	type CodeMarkerSyntaxProfile,
} from '../util/CodeMarkerScanner'
import { bookmarkPathKey } from '../util/BookmarkPath'

export interface CodeMarkerSnapshotPort<Uri> {
	isFileUri(uri: Uri): boolean
	isCurrentScope(uri: Uri): boolean
	filePath(uri: Uri): string
	relativeBookmarkPath(absolutePath: string): string
	bookmarks(): BookmarkSet
	profileFor(languageId: string | undefined, filePath: string): CodeMarkerSyntaxProfile | undefined
	warnFileTruncated(filePath: string, limit: number): void
	warnFileCapacityLimited(filePath: string): void
	warnWorkspaceDiscoveryTruncated(scope: string, maxFiles: number): void
	invalidatePathIndex(): void
	saveBookmarks(absolutePaths: readonly string[]): void
	refreshDecorations(): void
}

const unchangedResult = (): CodeMarkerSyncResult => ({ changed: false, created: 0, removed: 0 })

export class CodeMarkerSnapshotCoordinator<Uri> {
	private readonly warnedFiles = new Set<string>()
	private readonly warnedWorkspaceScopes = new Set<string>()

	constructor(private readonly maxMarkersPerFile = MAX_CODE_MARKERS_PER_FILE) {}

	synchronizeSnapshot(
		uri: Uri,
		lines: readonly string[],
		languageId: string | undefined,
		port: CodeMarkerSnapshotPort<Uri>,
	): CodeMarkerSyncResult {
		if (!port.isFileUri(uri) || !port.isCurrentScope(uri)) return unchangedResult()
		const filePath = port.filePath(uri)
		const profile = port.profileFor(languageId, filePath)
		const scan = scanCodeMarkers(lines, languageId, filePath, this.maxMarkersPerFile, profile)
		if (scan.truncated) {
			this.warnFileOnce(filePath, () => port.warnFileTruncated(filePath, this.maxMarkersPerFile))
		}
		const result = synchronizeCodeMarkerBookmarks(
			port.bookmarks(),
			port.relativeBookmarkPath(filePath),
			lines,
			scan.occurrences,
		)
		if (result.capacityLimited) {
			this.warnFileOnce(filePath, () => port.warnFileCapacityLimited(filePath))
		}
		return result
	}

	removeMarkers(uri: Uri, port: CodeMarkerSnapshotPort<Uri>): boolean {
		return synchronizeCodeMarkerBookmarks(
			port.bookmarks(),
			port.relativeBookmarkPath(port.filePath(uri)),
			[],
			[],
		).changed
	}

	persistChanges(changedPaths: readonly string[], port: CodeMarkerSnapshotPort<Uri>): void {
		if (changedPaths.length === 0) return
		port.invalidatePathIndex()
		port.saveBookmarks([...new Set(changedPaths)])
		port.refreshDecorations()
	}

	fileNodeHasCodeMarkers(fileNode: Bookmark): boolean {
		const visit = (bookmarks: readonly Bookmark[]): boolean => bookmarks.some(bookmark => bookmark.isCodeMarker
			|| (bookmark.subs.size > 0 && visit(bookmark.subs.values)))
		return visit(fileNode.subs.values)
	}

	warnWorkspaceDiscoveryTruncated(
		scope: string,
		maxFiles: number,
		port: CodeMarkerSnapshotPort<Uri>,
	): void {
		if (this.warnedWorkspaceScopes.has(scope)) return
		this.warnedWorkspaceScopes.add(scope)
		port.warnWorkspaceDiscoveryTruncated(scope, maxFiles)
	}

	private warnFileOnce(filePath: string, warn: () => void): void {
		const key = bookmarkPathKey(filePath)
		if (this.warnedFiles.has(key)) return
		this.warnedFiles.add(key)
		warn()
	}
}
