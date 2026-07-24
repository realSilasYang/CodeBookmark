/**
 * 保存尚未落盘的请求、重试次数和替换关系，为防抖保存提供可变但可快照的状态。
 * 定时器和真正写盘不在这里，因而请求合并与失败重排可以脱离 VS Code 单独验证。
 */
import type { Bookmark } from '../models/Bookmark'

export interface PendingSaveRequest {
	bookmarks: Bookmark[]
	attempts: number
	sequence: number
	storageRoot: string
	dirtyPaths?: string[]
}

interface FailedSaveResult {
	retried: boolean
	exhausted: boolean
}

/**
 * 保存尚未执行的请求和各自重试次数。定时器与磁盘提交留给 BookmarkSaveCoordinator，
 * 本类只回答请求如何合并、替换和取出，因而这些状态规则可以独立测试。
 */
export class PendingSaveStore {
	private readonly requests = new Map<string, PendingSaveRequest>()
	private sequence = 0

	get size(): number {
		return this.requests.size
	}

	has(filePath: string): boolean {
		return this.requests.has(filePath)
	}

	values(): IterableIterator<PendingSaveRequest> {
		return this.requests.values()
	}

	entries(): IterableIterator<[string, PendingSaveRequest]> {
		return this.requests.entries()
	}

	queue(
		filePaths: Iterable<string>,
		bookmarks: Bookmark[],
		storageRoot: string,
		dirtyPaths?: readonly string[],
	): void {
		const normalizedDirtyPaths = dirtyPaths ? [...dirtyPaths] : undefined
		for (const filePath of filePaths) {
			const previous = this.requests.get(filePath)
			let mergedDirtyPaths: string[] | undefined
			if (!previous) {
				mergedDirtyPaths = normalizedDirtyPaths
			} else if (previous.dirtyPaths === undefined || normalizedDirtyPaths === undefined) {
				mergedDirtyPaths = undefined
			} else {
				mergedDirtyPaths = Array.from(new Set([...previous.dirtyPaths, ...normalizedDirtyPaths]))
			}
			this.requests.set(filePath, {
				bookmarks,
				attempts: 0,
				sequence: ++this.sequence,
				storageRoot,
				dirtyPaths: mergedDirtyPaths,
			})
		}
	}

	takeSnapshot(): Map<string, PendingSaveRequest> {
		const snapshot = new Map(this.requests)
		this.requests.clear()
		return snapshot
	}

	rebase(bookmarks: Bookmark[]): void {
		for (const request of this.requests.values()) request.bookmarks = bookmarks
	}

	requeueFailed(
		requests: ReadonlyMap<string, PendingSaveRequest>,
		failedKeys: Iterable<string>,
		maxAttempts: number,
	): FailedSaveResult {
		let retried = false
		let exhausted = false
		for (const key of failedKeys) {
			if (this.requests.has(key)) continue
			const failed = requests.get(key)
			if (!failed) continue
			const attempts = failed.attempts + 1
			if (attempts < maxAttempts) {
				this.requests.set(key, { ...failed, attempts })
				retried = true
			} else {
				exhausted = true
			}
		}
		return { retried, exhausted }
	}
}
