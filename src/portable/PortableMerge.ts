/**
 * 以顶层书签子树为原子执行便携包三方合并，兼顾稳定身份、层级完整和绝不静默覆盖。
 * 双方同时修改同一子树时保留本机树并追加重写身份后的导入树，让冲突可见且信息不丢失。
 */
import { isJsonRecord } from '../util/JsonRecord'
import { createBookmarkId } from '../util/ScriptIdentity'
import { portableBookmarkItems, type PortableScript } from './PortablePackage'

interface PortableMergeResult {
	bookmarks: unknown[]
	bookmarkMappings: Record<string, string>
	added: number
	updated: number
	removed: number
	conflicts: number
}

export type PortableImportMode = 'append' | 'overwrite'

function itemId(value: unknown): string | undefined {
	return isJsonRecord(value) && typeof value.id === 'string' ? value.id : undefined
}

function visitIds(value: unknown, visitor: (id: string, item: Record<string, unknown>) => void): void {
	if (!isJsonRecord(value) || typeof value.id !== 'string') return
	visitor(value.id, value)
	if (Array.isArray(value.subs)) value.subs.forEach(child => visitIds(child, visitor))
}

function canonical(value: unknown, reverseMappings?: ReadonlyMap<string, string>): string {
	const clone = portableBookmarkItems([value])[0]
	visitIds(clone, (id, item) => {
		const portableId = reverseMappings?.get(id)
		if (portableId) item.id = portableId
	})
	return JSON.stringify(clone)
}

function rootMap(items: readonly unknown[]): Map<string, unknown> {
	return new Map(items.flatMap(item => {
		const id = itemId(item)
		return id ? [[id, item] as const] : []
	}))
}

function collectUsedIds(items: readonly unknown[]): Set<string> {
	const ids = new Set<string>()
	items.forEach(item => visitIds(item, id => ids.add(id)))
	return ids
}

function cloneIncoming(
	value: unknown,
	mappings: Record<string, string>,
	usedIds: Set<string>,
	forceNew: boolean,
): unknown {
	const clone = structuredClone(value)
	visitIds(clone, (portableId, item) => {
		let localId = forceNew ? undefined : mappings[portableId]
		if (!localId) localId = !forceNew && !usedIds.has(portableId) ? portableId : createBookmarkId()
		while (usedIds.has(localId) && localId !== mappings[portableId]) localId = createBookmarkId()
		mappings[portableId] = localId
		item.id = localId
		usedIds.add(localId)
	})
	return clone
}

export function mergePortableBookmarks(
	existingInternal: readonly unknown[],
	incoming: PortableScript,
	base: PortableScript | undefined,
	previousMappings: Readonly<Record<string, string>>,
	mode: PortableImportMode = 'append',
): PortableMergeResult {
	if (mode === 'overwrite') {
		const mappings = { ...previousMappings }
		const usedIds = new Set<string>()
		const currentRoots = rootMap(existingInternal)
		const incomingRoots = rootMap(incoming.bookmarks)
		const bookmarks = incoming.bookmarks.map(item => cloneIncoming(item, mappings, usedIds, false))
		const incomingLocalIds = new Set(bookmarks.flatMap(item => itemId(item) ?? []))
		const retainedCurrentIds = new Set(Object.entries(mappings)
			.filter(([portableId]) => incomingRoots.has(portableId))
			.map(([, localId]) => localId))
		const updated = [...retainedCurrentIds].filter(id => currentRoots.has(id)).length
		return {
			bookmarks,
			bookmarkMappings: mappings,
			added: [...incomingLocalIds].filter(id => !currentRoots.has(id)).length,
			updated,
			removed: [...currentRoots.keys()].filter(id => !incomingLocalIds.has(id)).length,
			conflicts: 0,
		}
	}
	const output = existingInternal.map(item => structuredClone(item))
	const mappings = { ...previousMappings }
	const usedIds = collectUsedIds(output)
	const currentRoots = rootMap(output)
	const incomingRoots = rootMap(incoming.bookmarks)
	const baseRoots = rootMap(base?.bookmarks ?? [])
	const reverseMappings = new Map(Object.entries(mappings).map(([portable, local]) => [local, portable]))
	let added = 0
	let updated = 0
	let removed = 0
	let conflicts = 0

	for (const [portableId, incomingRoot] of incomingRoots) {
		const mappedId = mappings[portableId]
		const current = mappedId ? currentRoots.get(mappedId) : currentRoots.get(portableId)
		const baseRoot = baseRoots.get(portableId)
		if (!current) {
			const imported = cloneIncoming(incomingRoot, mappings, usedIds, baseRoot !== undefined)
			output.push(imported)
			added++
			if (baseRoot !== undefined) conflicts++
			continue
		}
		const currentIndex = output.findIndex(item => itemId(item) === itemId(current))
		const currentValue = canonical(current, reverseMappings)
		const incomingValue = canonical(incomingRoot)
		const baseValue = baseRoot === undefined ? undefined : canonical(baseRoot)
		if (currentValue === incomingValue || incomingValue === baseValue) {
			if (!mappedId) visitIds(incomingRoot, id => { mappings[id] = id })
			continue
		}
		if (baseValue !== undefined && currentValue === baseValue) {
			const idsWithoutCurrent = collectUsedIds(output.filter((_, index) => index !== currentIndex))
			output[currentIndex] = cloneIncoming(incomingRoot, mappings, idsWithoutCurrent, false)
			updated++
			continue
		}
		const imported = cloneIncoming(incomingRoot, mappings, usedIds, true)
		output.push(imported)
		added++
		conflicts++
	}

	for (const [portableId, baseRoot] of baseRoots) {
		if (incomingRoots.has(portableId)) continue
		const localId = mappings[portableId]
		const currentIndex = output.findIndex(item => itemId(item) === localId)
		if (currentIndex < 0) continue
		if (canonical(output[currentIndex], reverseMappings) === canonical(baseRoot)) {
			const [deleted] = output.splice(currentIndex, 1)
			visitIds(deleted, id => {
				const portable = reverseMappings.get(id)
				if (portable) delete mappings[portable]
			})
			removed++
		} else {
			conflicts++
		}
	}

	return { bookmarks: output, bookmarkMappings: mappings, added, updated, removed, conflicts }
}
