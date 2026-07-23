/**
 * 模块说明：本文件负责书签领域模型与展示投影，具体对象为 `SerializedBookmarkTree`。
 *
 * 实现要点：定义书签领域数据、父子关系和展示投影，并在对象内部维护不变量。
 * 核心边界：领域对象负责维持自身不变量；序列化字段、父子关系和展示状态不得被调用方绕过。
 * 主要入口：`rewriteSerializedBookmarkIds`、`serializedBookmarkContentIdentity`、`setSerializedBookmarkPaths`、`mergeSerializedBookmarks`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import { createBookmarkId } from '../util/ScriptIdentity'
import { isJsonRecord } from '../util/JsonRecord'

function bookmarkIdentity(value: unknown): string {
	if (isJsonRecord(value) && typeof value.id === 'string') return value.id
	return JSON.stringify(value)
}

export function rewriteSerializedBookmarkIds(value: unknown): void {
	if (!isJsonRecord(value)) return
	if (typeof value.id === 'string') value.id = createBookmarkId()
	if (Array.isArray(value.subs)) value.subs.forEach(rewriteSerializedBookmarkIds)
}

export function serializedBookmarkContentIdentity(value: unknown): string {
	const clone = structuredClone(value)
	const removeIdentity = (item: unknown): void => {
		if (!isJsonRecord(item)) return
		delete item.id
		delete item.path
		if (Array.isArray(item.subs)) item.subs.forEach(removeIdentity)
	}
	removeIdentity(clone)
	return JSON.stringify(clone)
}

export function setSerializedBookmarkPaths(items: unknown[], bookmarkPath: string): void {
	for (const item of items) {
		if (!isJsonRecord(item)) continue
		item.path = bookmarkPath
		if (Array.isArray(item.subs)) setSerializedBookmarkPaths(item.subs, bookmarkPath)
	}
}

export function mergeSerializedBookmarks(
	primary: unknown[],
	secondary: unknown[],
	bookmarkPath: string,
): unknown[] {
	const merged = primary.map(item => structuredClone(item))
	const contentIdentities = new Set(merged.map(serializedBookmarkContentIdentity))
	const byId = new Map<string, unknown>()
	for (const item of merged) byId.set(bookmarkIdentity(item), item)
	for (const item of secondary) {
		const clone = structuredClone(item)
		const contentIdentity = serializedBookmarkContentIdentity(clone)
		if (contentIdentities.has(contentIdentity)) continue
		const key = bookmarkIdentity(clone)
		const existing = byId.get(key)
		if (existing && JSON.stringify(existing) === JSON.stringify(clone)) continue
		if (existing) rewriteSerializedBookmarkIds(clone)
		merged.push(clone)
		contentIdentities.add(contentIdentity)
		byId.set(bookmarkIdentity(clone), clone)
	}
	setSerializedBookmarkPaths(merged, bookmarkPath)
	return merged
}
