/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `AIFolderPresenceCache`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`AIFolderBookmarkPresence`、`bookmarkPathPresenceSignature`、`AIFolderPresenceCache`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import type { Bookmark } from '../models/Bookmark'
import { normalizedAbsolutePath } from '../util/AbsolutePath'

interface CachedFolderPresence {
	directory: string
	bookmarkSignature: string
	sourceGeneration: number
	expiresAt: number
	result: AIFolderBookmarkPresence
}

export interface AIFolderBookmarkPresence {
	readonly hasBookmarkedScript: boolean
	readonly hasUnbookmarkedScript: boolean
}

export function bookmarkPathPresenceSignature(bookmarks: readonly Bookmark[]): string {
	const paths = new Set<string>()
	const collect = (items: readonly Bookmark[]): void => {
		for (const bookmark of items) {
			if (bookmark.path && !bookmark.isFile) paths.add(bookmark.path)
			if (bookmark.subs.size > 0) collect(bookmark.subs.values)
		}
	}
	collect(bookmarks)
	return [...paths].sort().join('\0')
}

export class AIFolderPresenceCache {
	private sourceGeneration = 0
	private cached: CachedFolderPresence | undefined

	constructor(
		private readonly ttlMs = 5_000,
		private readonly now: () => number = Date.now,
	) {}

	invalidateSourceFiles(): void {
		this.sourceGeneration++
	}

	async getPresence(
		dirPath: string,
		bookmarkSignature: string,
		scan: () => AIFolderBookmarkPresence | Promise<AIFolderBookmarkPresence>,
	): Promise<AIFolderBookmarkPresence> {
		const directory = normalizedAbsolutePath(dirPath)
		const sourceGeneration = this.sourceGeneration
		const cached = this.cached
		if (cached
			&& cached.directory === directory
			&& cached.bookmarkSignature === bookmarkSignature
			&& cached.sourceGeneration === sourceGeneration
			&& cached.expiresAt > this.now()) {
			return cached.result
		}

		const result = await scan()
		this.cached = {
			directory,
			bookmarkSignature,
			sourceGeneration,
			expiresAt: this.now() + this.ttlMs,
			result,
		}
		return result
	}
}
