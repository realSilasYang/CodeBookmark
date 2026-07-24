/**
 * 处理已序列化书签树的身份重写、路径替换、内容比较与合并。
 * 这些操作直接面向 JSON 结构，用于导入和迁移时避免先构造带运行时引用的 Bookmark 对象。
 */
import { createBookmarkId } from '../util/ScriptIdentity'
import { isJsonRecord } from '../util/JsonRecord'

function collectSerializedBookmarkIds(value: unknown, output: Set<string>): void {
	if (!isJsonRecord(value)) return
	if (typeof value.id === 'string') output.add(value.id)
	if (Array.isArray(value.subs)) value.subs.forEach(item => collectSerializedBookmarkIds(item, output))
}

function recordSerializedBookmarkIds(value: unknown, output: Map<string, string>): void {
	if (!isJsonRecord(value)) return
	if (typeof value.id === 'string') output.set(value.id, value.id)
	if (Array.isArray(value.subs)) value.subs.forEach(item => recordSerializedBookmarkIds(item, output))
}

export function rewriteSerializedBookmarkIdsWithMap(value: unknown, output: Map<string, string>): void {
	if (!isJsonRecord(value)) return
	if (typeof value.id === 'string') {
		const previous = value.id
		const next = createBookmarkId()
		value.id = next
		output.set(previous, next)
	}
	if (Array.isArray(value.subs)) value.subs.forEach(item => rewriteSerializedBookmarkIdsWithMap(item, output))
}

function mapEquivalentBookmarkTreeIds(source: unknown, target: unknown, output: Map<string, string>): void {
	if (!isJsonRecord(source) || !isJsonRecord(target)) return
	if (typeof source.id === 'string' && typeof target.id === 'string') output.set(source.id, target.id)
	const sourceChildren = Array.isArray(source.subs) ? source.subs : []
	const targetChildren = Array.isArray(target.subs) ? target.subs : []
	for (let index = 0; index < Math.min(sourceChildren.length, targetChildren.length); index++) {
		mapEquivalentBookmarkTreeIds(sourceChildren[index], targetChildren[index], output)
	}
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
	return mergeSerializedBookmarksWithIdMap(primary, secondary, bookmarkPath).bookmarks
}

export function mergeSerializedBookmarksWithIdMap(
	primary: unknown[],
	secondary: unknown[],
	bookmarkPath: string,
): { bookmarks: unknown[], idMap: Map<string, string> } {
	const merged = primary.map(item => structuredClone(item))
	const contentIdentities = new Map(merged.map(item => [serializedBookmarkContentIdentity(item), item]))
	const usedIds = new Set<string>()
	for (const item of merged) collectSerializedBookmarkIds(item, usedIds)
	const idMap = new Map<string, string>()
	for (const item of secondary) {
		const clone = structuredClone(item)
		const contentIdentity = serializedBookmarkContentIdentity(clone)
		const equivalent = contentIdentities.get(contentIdentity)
		if (equivalent) {
			mapEquivalentBookmarkTreeIds(item, equivalent, idMap)
			continue
		}
		const cloneIds = new Set<string>()
		collectSerializedBookmarkIds(clone, cloneIds)
		if ([...cloneIds].some(id => usedIds.has(id))) rewriteSerializedBookmarkIdsWithMap(clone, idMap)
		else recordSerializedBookmarkIds(clone, idMap)
		merged.push(clone)
		contentIdentities.set(contentIdentity, clone)
		collectSerializedBookmarkIds(clone, usedIds)
	}
	setSerializedBookmarkPaths(merged, bookmarkPath)
	return { bookmarks: merged, idMap }
}
