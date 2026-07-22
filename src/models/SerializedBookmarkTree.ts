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
