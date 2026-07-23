/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `PendingSaveStore`。
 *
 * 实现要点：维护可变状态及其索引，对外提供原子更新和一致快照。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`PendingSaveRequest`、`PendingSaveStore`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
 * 持有保存请求的可变快照；定时器、持久化以及按作用域分组由保存协调器负责。
 * 这种拆分让重试计数与请求替换规则可以作为纯状态逻辑验证。
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
