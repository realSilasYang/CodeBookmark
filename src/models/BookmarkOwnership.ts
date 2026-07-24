/**
 * 把视觉书签树投影回各脚本独立的持久化树，并维护节点的稳定脚本所有权。
 * 视觉父级可以跨文件，但 ownerScriptId 一经分配就不会因拖拽而改变。
 */
import type { Bookmark, BookmarkJSON } from './Bookmark'
import { BookmarkSet } from './BookmarkSet'
import {
	workspaceLayoutPersistence,
	type WorkspaceLayout,
	type WorkspaceLayoutEntry,
	type WorkspaceNodeExpansionState,
	type WorkspaceNodeReference,
	workspaceNodeReferenceKey,
} from './WorkspaceLayout'

export interface OwnedBookmarkProjection {
	scriptId: string
	path: string
	fileNode?: Bookmark
	bookmarks: BookmarkJSON[]
}

export function bookmarkOwnerScriptId(bookmark: Bookmark): string | undefined {
	return bookmark.isFile ? bookmark.scriptId : bookmark.ownerScriptId
}

function workspaceNodeReference(bookmark: Bookmark): WorkspaceNodeReference | undefined {
	const scriptId = bookmarkOwnerScriptId(bookmark)
	if (!scriptId) return undefined
	return bookmark.isFile
		? { kind: 'script', scriptId }
		: { kind: 'bookmark', scriptId, bookmarkId: bookmark.id }
}

export function assignFileNodeOwnership(fileNode: Bookmark): void {
	if (!fileNode.isFile || !fileNode.scriptId) return
	const visit = (items: readonly Bookmark[]): void => {
		for (const bookmark of items) {
			if (!bookmark.isFile) bookmark.ownerScriptId = fileNode.scriptId
			visit(bookmark.subs.values)
		}
	}
	visit(fileNode.subs.values)
}

export function allBookmarks(bookmarks: BookmarkSet): Bookmark[] {
	const result: Bookmark[] = []
	const visit = (items: readonly Bookmark[]): void => {
		for (const bookmark of items) {
			result.push(bookmark)
			visit(bookmark.subs.values)
		}
	}
	visit(bookmarks.values)
	return result
}

function ensureMissingOwnership(nodes: readonly Bookmark[]): void {
	const fileByPath = new Map<string, Bookmark>()
	for (const node of nodes) {
		if (node.isFile && node.scriptId) fileByPath.set(node.path.replace(/\\/g, '/').toLowerCase(), node)
	}
	for (const node of nodes) {
		if (node.isFile || node.ownerScriptId) continue
		let ancestor = node.parent
		while (ancestor && !ancestor.isFile) ancestor = ancestor.parent
		const owner = ancestor?.scriptId
			?? fileByPath.get(node.path.replace(/\\/g, '/').toLowerCase())?.scriptId
		if (owner) node.ownerScriptId = owner
	}
}

export function projectBookmarksByOwner(bookmarks: BookmarkSet): OwnedBookmarkProjection[] {
	const nodes = allBookmarks(bookmarks)
	ensureMissingOwnership(nodes)
	const projections = new Map<string, OwnedBookmarkProjection>()
	for (const node of nodes) {
		const scriptId = bookmarkOwnerScriptId(node)
		if (!scriptId) continue
		const projection = projections.get(scriptId) ?? {
			scriptId,
			path: node.path,
			bookmarks: [],
		}
		if (node.isFile) {
			projection.fileNode = node
			projection.path = node.path
		}
		projections.set(scriptId, projection)
	}

	const serialized = new Map<Bookmark, BookmarkJSON>()
	for (const node of nodes) {
		if (!node.isFile && node.ownerScriptId) serialized.set(node, node.toJSONShallow())
	}
	for (const node of nodes) {
		if (node.isFile || !node.ownerScriptId) continue
		const projection = projections.get(node.ownerScriptId)
		const value = serialized.get(node)
		if (!projection || !value) continue
		let ancestor = node.parent
		while (ancestor && bookmarkOwnerScriptId(ancestor) !== node.ownerScriptId) ancestor = ancestor.parent
		if (ancestor && !ancestor.isFile) serialized.get(ancestor)?.subs.push(value)
		else projection.bookmarks.push(value)
	}
	return [...projections.values()]
}

export function captureWorkspaceLayout(
	bookmarks: BookmarkSet,
	hiddenFiles: readonly string[] = [],
	pinnedContainer?: Bookmark,
): WorkspaceLayout {
	const entries: WorkspaceLayoutEntry[] = []
	const expansionStates: WorkspaceNodeExpansionState[] = []
	const hidden = new Set(hiddenFiles)
	const visit = (items: readonly Bookmark[], parent: WorkspaceNodeReference | null): void => {
		for (const bookmark of items) {
			if (bookmark.isFile && bookmark.scriptId && hidden.has(bookmark.scriptId)) {
				visit(bookmark.subs.values, parent)
				continue
			}
			const reference = workspaceNodeReference(bookmark)
			if (!reference) continue
			entries.push({ node: reference, parent })
			if (bookmark.subs.size > 0) {
				expansionStates.push({ node: reference, expanded: bookmark.collapsibleState === 2 })
			}
			visit(bookmark.subs.values, reference)
		}
	}
	visit(bookmarks.values, null)
	const pinnedReference = pinnedContainer && !(pinnedContainer.isFile && pinnedContainer.scriptId
		&& hidden.has(pinnedContainer.scriptId))
		? workspaceNodeReference(pinnedContainer) ?? null
		: null
	return workspaceLayoutPersistence(entries, hiddenFiles, pinnedReference, Date.now(), expansionStates)
}

export function applyWorkspaceLayout(bookmarks: BookmarkSet, layout: WorkspaceLayout): WorkspaceLayout {
	const nodes = allBookmarks(bookmarks)
	for (const node of nodes) if (node.isFile) assignFileNodeOwnership(node)
	const byKey = new Map<string, Bookmark>()
	const originalParents = new Map<Bookmark, Bookmark | undefined>()
	for (const node of nodes) {
		const reference = workspaceNodeReference(node)
		if (reference) byKey.set(workspaceNodeReferenceKey(reference), node)
		originalParents.set(node, node.parent)
	}
	for (const node of nodes) {
		node.subs.clear()
		node.parent = undefined
		node.isPinned = false
	}
	bookmarks.clear()

	const hidden = new Set(layout.hiddenFiles)
	const placed = new Set<Bookmark>()
	const attach = (node: Bookmark, parent: Bookmark | undefined): void => {
		if (placed.has(node) || (node.isFile && node.scriptId && hidden.has(node.scriptId))) return
		node.parent = parent
		if (parent) parent.subs.add(node)
		else bookmarks.add(node)
		placed.add(node)
	}
	for (const entry of layout.entries) {
		const node = byKey.get(workspaceNodeReferenceKey(entry.node))
		if (!node) continue
		const parent = entry.parent ? byKey.get(workspaceNodeReferenceKey(entry.parent)) : undefined
		if (parent && parent.isFile && parent.scriptId && hidden.has(parent.scriptId)) attach(node, undefined)
		else attach(node, parent)
	}
	for (const node of nodes) {
		if (placed.has(node) || (node.isFile && node.scriptId && hidden.has(node.scriptId))) continue
		let parent = originalParents.get(node)
		while (parent && (!placed.has(parent) || (parent.isFile && parent.scriptId && hidden.has(parent.scriptId)))) {
			parent = originalParents.get(parent)
		}
		attach(node, parent)
	}
	const pinnedKey = layout.pinnedContainer ? workspaceNodeReferenceKey(layout.pinnedContainer) : undefined
	const pinned = pinnedKey ? byKey.get(pinnedKey) : undefined
	if (pinned && placed.has(pinned)) pinned.isPinned = true
	const expansionByKey = new Map(layout.expansionStates.map(state => [
		workspaceNodeReferenceKey(state.node),
		state.expanded,
	]))
	for (const node of nodes) {
		const reference = workspaceNodeReference(node)
		const expanded = reference ? expansionByKey.get(workspaceNodeReferenceKey(reference)) : undefined
		if (placed.has(node) && node.subs.size > 0 && !node.isPinned && expanded !== undefined) {
			node.collapsibleState = expanded ? 2 : 1
		}
	}
	for (const node of nodes) node.refreshDisplayProps()
	return captureWorkspaceLayout(bookmarks, layout.hiddenFiles, pinned)
}
