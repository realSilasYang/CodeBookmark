import { bookmarkPathKey, isSameOrDescendantBookmarkPath } from '../util/BookmarkPath'

type DocumentChangeTimer = ReturnType<typeof setTimeout>

interface BookmarkDocumentChangeScheduling {
	setTimer(callback: () => void, delay: number): DocumentChangeTimer
	clearTimer(timer: DocumentChangeTimer): void
}

interface BookmarkDocumentMarkerResult {
	changed: boolean
}

export interface BookmarkDocumentChangePort<Document, Uri, BookmarkState> {
	isFileDocument(document: Document): boolean
	documentUri(document: Document): Uri
	isCurrentScope(uri: Uri): boolean
	filePath(uri: Uri): string
	relativeBookmarkPath(absolutePath: string): string
	currentViewGeneration(): number
	currentBookmarkState(): BookmarkState
	bookmarkCount(bookmarkPath: string): number
	relocateBookmarks(bookmarkState: BookmarkState, bookmarkPath: string, uri: Uri): Promise<number>
	documentLines(document: Document): readonly string[]
	documentLanguage(document: Document): string | undefined
	synchronizeCodeMarkers(uri: Uri, lines: readonly string[], languageId?: string): BookmarkDocumentMarkerResult
	persistCodeMarkerChanges(absolutePaths: readonly string[]): void
	saveBookmarks(absolutePaths: readonly string[]): void
	refreshDecorations(): void
	reportFailure(error: unknown): void
}

const defaultScheduling: BookmarkDocumentChangeScheduling = {
	setTimer: (callback, delay) => setTimeout(callback, delay),
	clearTimer: timer => clearTimeout(timer),
}

export class BookmarkDocumentChangeCoordinator<Document, Uri, BookmarkState> {
	private readonly timers = new Map<string, DocumentChangeTimer>()

	constructor(
		private readonly scheduling: BookmarkDocumentChangeScheduling = defaultScheduling,
		private readonly debounceMs = 300,
	) {}

	handleChange(
		document: Document,
		hasContentChanges: boolean,
		port: BookmarkDocumentChangePort<Document, Uri, BookmarkState>,
	): void {
		if (!hasContentChanges || !port.isFileDocument(document)) return
		const uri = port.documentUri(document)
		if (!port.isCurrentScope(uri)) return

		const absolutePath = port.filePath(uri)
		const bookmarkPath = port.relativeBookmarkPath(absolutePath)
		const timerKey = bookmarkPathKey(bookmarkPath)
		const viewGeneration = port.currentViewGeneration()
		const pendingTimer = this.timers.get(timerKey)
		if (pendingTimer) this.scheduling.clearTimer(pendingTimer)

		const timer = this.scheduling.setTimer(() => {
			if (this.timers.get(timerKey) === timer) this.timers.delete(timerKey)
			void this.processChange(document, uri, absolutePath, bookmarkPath, viewGeneration, port)
				.catch(error => port.reportFailure(error))
		}, this.debounceMs)
		this.timers.set(timerKey, timer)
	}

	cancelBookmarkPath(bookmarkPath: string): void {
		for (const [key, timer] of this.timers) {
			if (!isSameOrDescendantBookmarkPath(key, bookmarkPath)) continue
			this.scheduling.clearTimer(timer)
			this.timers.delete(key)
		}
	}

	dispose(): void {
		for (const timer of this.timers.values()) this.scheduling.clearTimer(timer)
		this.timers.clear()
	}

	private async processChange(
		document: Document,
		uri: Uri,
		absolutePath: string,
		bookmarkPath: string,
		viewGeneration: number,
		port: BookmarkDocumentChangePort<Document, Uri, BookmarkState>,
	): Promise<void> {
		if (viewGeneration !== port.currentViewGeneration() || !port.isCurrentScope(uri)) return
		const bookmarkState = port.currentBookmarkState()

		// Debouncing can collapse intermediate edits, so relocation must use the
		// final document state rather than incremental line arithmetic.
		const relocated = port.bookmarkCount(bookmarkPath) > 0
			? await port.relocateBookmarks(bookmarkState, bookmarkPath, uri)
			: 0
		if (viewGeneration !== port.currentViewGeneration()
			|| bookmarkState !== port.currentBookmarkState()) return

		const markerResult = port.synchronizeCodeMarkers(
			uri,
			port.documentLines(document),
			port.documentLanguage(document),
		)
		if (markerResult.changed) {
			port.persistCodeMarkerChanges([absolutePath])
		} else if (relocated > 0) {
			port.saveBookmarks([absolutePath])
			port.refreshDecorations()
		}
	}
}
