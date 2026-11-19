/**
 * 按事件顺序追踪手动书签，对只需最终文本的自动标记扫描进行防抖。
 * 视图切换或路径移动后，旧任务不再读取文档或写入书签。
 */
import { bookmarkPathKey, isSameOrDescendantBookmarkPath } from '../util/BookmarkPath'
import {
	defaultTimerScheduling,
	KeyedTimerStore,
	type TimerScheduling,
} from '../util/KeyedTimerStore'

type DocumentChangeTimer = ReturnType<typeof setTimeout>

interface BookmarkDocumentMarkerResult {
	changed: boolean
}

export interface BookmarkDocumentChangePort<Document, Uri, Change> {
	isFileDocument(document: Document): boolean
	documentUri(document: Document): Uri
	isCurrentScope(uri: Uri): boolean
	filePath(uri: Uri): string
	relativeBookmarkPath(absolutePath: string): string
	currentViewGeneration(): number
	relocateBookmarks(document: Document, changes: readonly Change[]): void
	documentLines(document: Document): readonly string[]
	documentLanguage(document: Document): string | undefined
	synchronizeCodeMarkers(uri: Uri, lines: readonly string[], languageId?: string): BookmarkDocumentMarkerResult
	persistCodeMarkerChanges(absolutePaths: readonly string[]): void
	reportFailure(error: unknown): void
}

export class BookmarkDocumentChangeCoordinator<Document, Uri, Change> {
	private readonly timers: KeyedTimerStore<string, DocumentChangeTimer>

	constructor(
		scheduling: TimerScheduling<DocumentChangeTimer> = defaultTimerScheduling,
		private readonly debounceMs = 300,
	) {
		this.timers = new KeyedTimerStore(scheduling)
	}

	handleChange(
		document: Document,
		changes: readonly Change[],
		port: BookmarkDocumentChangePort<Document, Uri, Change>,
	): void {
		if (changes.length === 0 || !port.isFileDocument(document)) return
		const uri = port.documentUri(document)
		if (!port.isCurrentScope(uri)) return

		const absolutePath = port.filePath(uri)
		const bookmarkPath = port.relativeBookmarkPath(absolutePath)
		const timerKey = bookmarkPathKey(bookmarkPath)
		const viewGeneration = port.currentViewGeneration()
		port.relocateBookmarks(document, changes)
		this.timers.replace(timerKey, () => {
			if (viewGeneration !== port.currentViewGeneration() || !port.isCurrentScope(uri)) return
			try {
				const markerResult = port.synchronizeCodeMarkers(uri, port.documentLines(document), port.documentLanguage(document))
				if (markerResult.changed) port.persistCodeMarkerChanges([absolutePath])
			} catch (error) {
				port.reportFailure(error)
			}
		}, this.debounceMs)
	}

	cancelBookmarkPath(bookmarkPath: string): void {
		this.timers.cancelWhere(key => isSameOrDescendantBookmarkPath(key, bookmarkPath))
	}

	dispose(): void {
		this.timers.clear()
	}
}
