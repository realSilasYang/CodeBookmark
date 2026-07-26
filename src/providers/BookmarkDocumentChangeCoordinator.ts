/**
 * 对编辑中的文档变化进行防抖，在稳定后运行粘性重定位和自动标记对账。
 * 合并期间不依赖逐次行号增减，而是使用文档最终内容，避免快速编辑积累位置误差。
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

export class BookmarkDocumentChangeCoordinator<Document, Uri, BookmarkState> {
	private readonly timers: KeyedTimerStore<string, DocumentChangeTimer>

	constructor(
		scheduling: TimerScheduling<DocumentChangeTimer> = defaultTimerScheduling,
		private readonly debounceMs = 300,
	) {
		this.timers = new KeyedTimerStore(scheduling)
	}

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
		this.timers.replace(timerKey, () => {
			void this.processChange(document, uri, absolutePath, bookmarkPath, viewGeneration, port)
				.catch(error => port.reportFailure(error))
		}, this.debounceMs)
	}

	cancelBookmarkPath(bookmarkPath: string): void {
		this.timers.cancelWhere(key => isSameOrDescendantBookmarkPath(key, bookmarkPath))
	}

	dispose(): void {
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

		// 防抖期间可能已经发生多轮插入和删除；回调真正执行时只相信文档最终文本，
		// 不能把那些已被合并掉的中间事件继续折算成行号偏移。
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
