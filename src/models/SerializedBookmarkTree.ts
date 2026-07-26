/**
 * 处理已序列化书签树的身份重写、路径替换、内容比较与合并。
 * 这些操作直接面向 JSON 结构，用于导入和迁移时避免先构造带运行时引用的 Bookmark 对象。
 */
import { createBookmarkId } from '../util/ScriptIdentity'
import { isJsonRecord } from '../util/JsonRecord'
import { isSameOrDescendantBookmarkPath, renamedBookmarkPath } from '../util/BookmarkPath'

/**
 * 以前序方式访问序列化书签及其 subs。非对象和数组中的无效成员会被跳过，
 * 让身份、路径和迁移逻辑共享同一棵“有效结构树”，不各自形成不同的容错边界。
 */
function visitSerializedBookmarkTree(
	value: unknown,
	visitor: (item: Record<string, unknown>) => void,
): void {
	if (Array.isArray(value)) {
		value.forEach(item => visitSerializedBookmarkTree(item, visitor))
		return
	}
	if (!isJsonRecord(value)) return
	visitor(value)
	if (Array.isArray(value.subs)) visitSerializedBookmarkTree(value.subs, visitor)
}

function collectSerializedBookmarkIds(value: unknown, output: Set<string>): void {
	visitSerializedBookmarkTree(value, item => {
		if (typeof item.id === 'string') output.add(item.id)
	})
}

function recordSerializedBookmarkIds(value: unknown, output: Map<string, string>): void {
	visitSerializedBookmarkTree(value, item => {
		if (typeof item.id === 'string') output.set(item.id, item.id)
	})
}

function rewriteSerializedBookmarkIdsWithMap(value: unknown, output: Map<string, string>): void {
	visitSerializedBookmarkTree(value, item => {
		if (typeof item.id !== 'string') return
		const previous = item.id
		const next = createBookmarkId()
		item.id = next
		output.set(previous, next)
	})
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
	visitSerializedBookmarkTree(clone, item => {
		delete item.id
		delete item.path
	})
	return JSON.stringify(clone)
}

export function setSerializedBookmarkPaths(items: unknown[], bookmarkPath: string): void {
	visitSerializedBookmarkTree(items, item => {
		item.path = bookmarkPath
	})
}

export function renameSerializedBookmarkPaths(value: unknown, oldBookmarkPath: string, newBookmarkPath: string): void {
	visitSerializedBookmarkTree(value, item => {
		if (typeof item.path === 'string' && isSameOrDescendantBookmarkPath(item.path, oldBookmarkPath)) {
			item.path = renamedBookmarkPath(item.path, oldBookmarkPath, newBookmarkPath)
		}
	})
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
