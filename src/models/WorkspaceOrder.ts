/**
 * 模块说明：本文件负责书签领域模型与展示投影，具体对象为 `WorkspaceOrder`。
 *
 * 实现要点：定义书签领域数据、父子关系和展示投影，并在对象内部维护不变量。
 * 核心边界：领域对象负责维持自身不变量；序列化字段、父子关系和展示状态不得被调用方绕过。
 * 主要入口：`workspaceOrderPersistence`、`decodeWorkspaceOrderPersistence`、`appendWorkspaceOrderPath`、`removeWorkspaceOrderTree`、`removeWorkspaceOrderFile`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import {
	bookmarkPathKey,
	isSameOrDescendantBookmarkPath,
	renamedBookmarkPath,
} from '../util/BookmarkPath'
import {
	decodePersistenceList,
	PersistenceFormats,
	versionPersistenceList,
} from '../util/PersistenceSchema'

interface WorkspaceOrderChange {
	order: string[]
	changed: boolean
}

interface WorkspaceOrderFileRemoval {
	order: string[]
	index: number | undefined
}

interface WorkspaceOrderDirectoryMove {
	remaining: string[]
	moved: string[]
}

export function workspaceOrderPersistence(order: readonly string[]): unknown {
	return versionPersistenceList(PersistenceFormats.workspaceOrder, 'order', order)
}

export function decodeWorkspaceOrderPersistence(value: unknown): { order: string[], migrated: boolean, value: unknown } {
	const decoded = decodePersistenceList(value, PersistenceFormats.workspaceOrder, 'order')
	const order = (decoded.value.order as unknown[])
		.filter((entry): entry is string => typeof entry === 'string')
	return {
		order,
		migrated: decoded.migrated,
		value: workspaceOrderPersistence(order),
	}
}

export function appendWorkspaceOrderPath(order: readonly string[], bookmarkPath: string): string[] {
	return order.some(entry => bookmarkPathKey(entry) === bookmarkPathKey(bookmarkPath))
		? [...order]
		: [...order, bookmarkPath]
}

export function removeWorkspaceOrderTree(
	order: readonly string[],
	bookmarkPath: string,
): WorkspaceOrderChange {
	const remaining = order.filter(entry => !isSameOrDescendantBookmarkPath(entry, bookmarkPath))
	return { order: remaining, changed: remaining.length !== order.length }
}

export function removeWorkspaceOrderFile(
	order: readonly string[],
	bookmarkPath: string,
): WorkspaceOrderFileRemoval {
	const next = [...order]
	const index = workspaceOrderFileIndex(next, bookmarkPath)
	if (index >= 0) next.splice(index, 1)
	return { order: next, index: index >= 0 ? index : undefined }
}

export function workspaceOrderFileIndex(order: readonly string[], bookmarkPath: string): number {
	return order.findIndex(entry => bookmarkPathKey(entry) === bookmarkPathKey(bookmarkPath))
}

export function insertWorkspaceOrderFile(
	order: readonly string[],
	bookmarkPath: string,
	preferredIndex?: number,
): WorkspaceOrderChange {
	if (order.some(entry => bookmarkPathKey(entry) === bookmarkPathKey(bookmarkPath))) {
		return { order: [...order], changed: false }
	}
	const next = [...order]
	const insertionIndex = Math.min(preferredIndex ?? next.length, next.length)
	next.splice(insertionIndex, 0, bookmarkPath)
	return { order: next, changed: true }
}

export function renameWorkspaceOrderFile(
	order: readonly string[],
	oldBookmarkPath: string,
	newBookmarkPath: string,
	preferredIndex?: number,
): WorkspaceOrderChange {
	const next = [...order]
	const index = workspaceOrderFileIndex(next, oldBookmarkPath)
	if (index >= 0) {
		next[index] = newBookmarkPath
		return { order: [...new Set(next)], changed: true }
	}
	const inserted = insertWorkspaceOrderFile(next, newBookmarkPath, preferredIndex)
	return inserted.changed
		? { order: [...new Set(inserted.order)], changed: true }
		: inserted
}

export function renameWorkspaceOrderDirectory(
	order: readonly string[],
	oldBookmarkPath: string,
	newBookmarkPath: string,
): string[] {
	return [...new Set(order.map(entry => isSameOrDescendantBookmarkPath(entry, oldBookmarkPath)
		? renamedBookmarkPath(entry, oldBookmarkPath, newBookmarkPath)
		: entry))]
}

export function moveWorkspaceOrderDirectory(
	order: readonly string[],
	oldBookmarkPath: string,
	newBookmarkPath: string,
): WorkspaceOrderDirectoryMove {
	const moved: string[] = []
	const remaining: string[] = []
	for (const entry of order) {
		if (isSameOrDescendantBookmarkPath(entry, oldBookmarkPath)) {
			moved.push(renamedBookmarkPath(entry, oldBookmarkPath, newBookmarkPath))
		} else {
			remaining.push(entry)
		}
	}
	return { remaining, moved }
}

export function mergeWorkspaceOrder(order: readonly string[], additions: readonly string[]): string[] {
	return [...new Set([...order, ...additions])]
}
