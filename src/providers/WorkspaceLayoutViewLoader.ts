/**
 * 读取工作区视觉布局；首次升级时以旧文件顺序和各脚本本地树生成完整布局。
 * 布局损坏时保留原文件，只在内存中使用安全的本地树，避免覆盖未来版本数据。
 */
import * as path from 'path'
import { BookmarkSet } from '../models/BookmarkSet'
import {
	applyWorkspaceLayout,
	captureWorkspaceLayout,
} from '../models/BookmarkOwnership'
import {
	decodeWorkspaceLayoutPersistence,
	workspaceLayoutStructuralIdentity,
	type WorkspaceLayout,
} from '../models/WorkspaceLayout'
import { bookmarkPathKey } from '../util/BookmarkPath'
import type { PreparedBookmarkView } from './BookmarkViewPreparation'
import { isFileNotFoundError } from '../util/FileSystem'

interface WorkspaceLayoutSnapshot {
	layout: WorkspaceLayout | null
	filePath?: string
	needsPersist: boolean
	legacyOrderFilePath?: string
	writeBlocked: boolean
}

interface WorkspaceLayoutViewLoaderPort {
	resolveBookmarkFolder(scopeFilePath?: string): string | undefined
	readFile(filePath: string): Promise<string>
	reportReadFailure(error: unknown): void
}

export async function prepareBookmarkViewWithWorkspaceLayout(
	prepareBaseView: () => Promise<PreparedBookmarkView>,
	signal: AbortSignal | undefined,
	port: WorkspaceLayoutViewLoaderPort,
): Promise<PreparedBookmarkView> {
	const prepared = await prepareBaseView()
	const snapshot = await readWorkspaceLayoutForView(
		prepared.bookmarks,
		prepared.workspaceOrder,
		prepared.workspaceOrderFilePath,
		prepared.storageScope,
		prepared.scopeFilePath,
		signal,
		port,
	)
	return {
		...prepared,
		workspaceLayout: snapshot.layout,
		workspaceLayoutFilePath: snapshot.filePath,
		workspaceLayoutNeedsPersist: snapshot.needsPersist,
		workspaceLayoutWriteBlocked: snapshot.writeBlocked,
		legacyOrderFilePath: snapshot.legacyOrderFilePath,
	}
}

function reorderLegacyRoots(bookmarks: BookmarkSet, order: readonly string[]): void {
	if (order.length === 0) return
	const indices = new Map(order.map((value, index) => [bookmarkPathKey(value), index]))
	bookmarks.values.sort((left, right) => {
		const leftIndex = indices.get(bookmarkPathKey(left.path)) ?? Number.MAX_SAFE_INTEGER
		const rightIndex = indices.get(bookmarkPathKey(right.path)) ?? Number.MAX_SAFE_INTEGER
		return leftIndex - rightIndex
	})
}

async function readWorkspaceLayoutForView(
	bookmarks: BookmarkSet,
	legacyOrder: readonly string[] | null,
	legacyOrderFilePath: string | undefined,
	storageScope: string,
	scopeFilePath: string | undefined,
	signal: AbortSignal | undefined,
	port: WorkspaceLayoutViewLoaderPort,
): Promise<WorkspaceLayoutSnapshot> {
	if (signal?.aborted || !storageScope.startsWith('workspace:')) {
		return { layout: null, needsPersist: false, writeBlocked: false }
	}
	const folder = port.resolveBookmarkFolder(scopeFilePath)
	const filePath = folder ? path.join(folder, '_workspace_layout.json') : undefined
	if (!filePath) return { layout: null, needsPersist: false, writeBlocked: false }
	try {
		const decoded = decodeWorkspaceLayoutPersistence(JSON.parse(await port.readFile(filePath)))
		if (signal?.aborted) return { layout: null, needsPersist: false, writeBlocked: false }
		const normalized = applyWorkspaceLayout(bookmarks, decoded.layout)
		const changed = workspaceLayoutStructuralIdentity(normalized) !== workspaceLayoutStructuralIdentity(decoded.layout)
		if (!changed) normalized.updatedAt = decoded.layout.updatedAt
		return {
			layout: normalized,
			filePath,
			needsPersist: decoded.migrated || changed,
			legacyOrderFilePath,
			writeBlocked: false,
		}
	} catch (error) {
		if (!isFileNotFoundError(error)) {
			port.reportReadFailure(error)
			return {
				layout: captureWorkspaceLayout(bookmarks),
				filePath,
				needsPersist: false,
				writeBlocked: true,
			}
		}
	}

	reorderLegacyRoots(bookmarks, legacyOrder ?? [])
	return {
		layout: captureWorkspaceLayout(bookmarks),
		filePath,
		needsPersist: bookmarks.size > 0 || (legacyOrder?.length ?? 0) > 0,
		legacyOrderFilePath,
		writeBlocked: false,
	}
}
