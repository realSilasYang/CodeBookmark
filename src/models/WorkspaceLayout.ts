/**
 * 定义工作区书签树的视觉布局，使用稳定身份表达节点顺序、父子关系和隐藏状态。
 * 布局不保存书签正文或源码路径，这些内容仍由每个脚本自己的配置文件负责。
 */
import { isJsonRecord } from '../util/JsonRecord'
import {
	decodePersistenceRecord,
	persistenceHeader,
	PersistenceFormats,
	type PersistenceHeader,
} from '../util/PersistenceSchema'
import { isScriptId } from '../util/ScriptIdentity'

interface WorkspaceScriptNodeReference {
	kind: 'script'
	scriptId: string
}

interface WorkspaceBookmarkNodeReference {
	kind: 'bookmark'
	scriptId: string
	bookmarkId: string
}

export type WorkspaceNodeReference = WorkspaceScriptNodeReference | WorkspaceBookmarkNodeReference

export interface WorkspaceLayoutEntry {
	node: WorkspaceNodeReference
	parent: WorkspaceNodeReference | null
}

export interface WorkspaceNodeExpansionState {
	node: WorkspaceNodeReference
	expanded: boolean
}

export interface WorkspaceLayout extends PersistenceHeader {
	updatedAt: number
	entries: WorkspaceLayoutEntry[]
	hiddenFiles: string[]
	pinnedContainer: WorkspaceNodeReference | null
	expansionStates: WorkspaceNodeExpansionState[]
}

const MAX_WORKSPACE_LAYOUT_NODES = 20_000

export function workspaceNodeReferenceKey(reference: WorkspaceNodeReference): string {
	return reference.kind === 'script'
		? `script:${reference.scriptId}`
		: `bookmark:${reference.scriptId}:${reference.bookmarkId}`
}

/**
 * 返回只反映视觉结构的稳定身份，刻意忽略持久化格式头和更新时间。
 * 保存协调器与加载规范化逻辑必须共用同一比较边界，避免一处认为已变化、另一处认为未变化。
 */
export function workspaceLayoutStructuralIdentity(layout: WorkspaceLayout): string {
	return JSON.stringify({
		entries: layout.entries,
		hiddenFiles: layout.hiddenFiles,
		pinnedContainer: layout.pinnedContainer,
		expansionStates: layout.expansionStates,
	})
}

function nodeReference(value: unknown): WorkspaceNodeReference | undefined {
	if (!isJsonRecord(value) || !isScriptId(value.scriptId)) return undefined
	if (value.kind === 'script') return { kind: 'script', scriptId: value.scriptId }
	if (value.kind !== 'bookmark' || !isScriptId(value.bookmarkId)) return undefined
	return { kind: 'bookmark', scriptId: value.scriptId, bookmarkId: value.bookmarkId }
}

function assertAcyclic(entries: readonly WorkspaceLayoutEntry[]): void {
	const parents = new Map(entries.map(entry => [
		workspaceNodeReferenceKey(entry.node),
		entry.parent ? workspaceNodeReferenceKey(entry.parent) : undefined,
	]))
	for (const start of parents.keys()) {
		const visited = new Set<string>()
		let current: string | undefined = start
		while (current !== undefined) {
			if (visited.has(current)) throw new Error('Workspace layout contains a cycle')
			visited.add(current)
			current = parents.get(current)
		}
	}
}

export function workspaceLayoutPersistence(
	entries: readonly WorkspaceLayoutEntry[],
	hiddenFiles: readonly string[] = [],
	pinnedContainer: WorkspaceNodeReference | null = null,
	updatedAt = Date.now(),
	expansionStates: readonly WorkspaceNodeExpansionState[] = [],
): WorkspaceLayout {
	return {
		...persistenceHeader(PersistenceFormats.workspaceLayout),
		updatedAt,
		entries: entries.map(entry => ({
			node: { ...entry.node },
			parent: entry.parent ? { ...entry.parent } : null,
		})),
		hiddenFiles: [...hiddenFiles],
		pinnedContainer: pinnedContainer ? { ...pinnedContainer } : null,
		expansionStates: expansionStates.map(state => ({ node: { ...state.node }, expanded: state.expanded })),
	}
}

export function decodeWorkspaceLayoutPersistence(value: unknown): { layout: WorkspaceLayout, migrated: boolean } {
	const decoded = decodePersistenceRecord(value, PersistenceFormats.workspaceLayout)
	const record = decoded.value
	if (!Array.isArray(record.entries) || record.entries.length > MAX_WORKSPACE_LAYOUT_NODES) {
		throw new Error('Workspace layout entries are invalid')
	}
	const entries: WorkspaceLayoutEntry[] = []
	const keys = new Set<string>()
	for (const valueEntry of record.entries) {
		if (!isJsonRecord(valueEntry)) throw new Error('Workspace layout entry is invalid')
		const node = nodeReference(valueEntry.node)
		const parsedParent = valueEntry.parent === null ? null : nodeReference(valueEntry.parent)
		if (!node || (valueEntry.parent !== null && !parsedParent)) throw new Error('Workspace layout node reference is invalid')
		const parent = parsedParent ?? null
		const key = workspaceNodeReferenceKey(node)
		if (keys.has(key) || (parent && workspaceNodeReferenceKey(parent) === key)) {
			throw new Error('Workspace layout contains a duplicate or self reference')
		}
		keys.add(key)
		entries.push({ node, parent })
	}
	for (const entry of entries) {
		if (entry.parent && !keys.has(workspaceNodeReferenceKey(entry.parent))) {
			throw new Error('Workspace layout parent reference is missing')
		}
	}
	assertAcyclic(entries)
	if (!Array.isArray(record.hiddenFiles) || record.hiddenFiles.some(value => !isScriptId(value))) {
		throw new Error('Workspace layout hidden file references are invalid')
	}
	const hiddenFiles = [...new Set(record.hiddenFiles as string[])]
	const pinnedContainer = record.pinnedContainer === null ? null : nodeReference(record.pinnedContainer)
	if (record.pinnedContainer !== null && !pinnedContainer) throw new Error('Workspace layout pinned container is invalid')
	if (pinnedContainer && !keys.has(workspaceNodeReferenceKey(pinnedContainer))) {
		throw new Error('Workspace layout pinned container is missing')
	}
	const expansionStates: WorkspaceNodeExpansionState[] = []
	const expansionKeys = new Set<string>()
	const rawExpansionStates = record.expansionStates === undefined ? [] : record.expansionStates
	if (!Array.isArray(rawExpansionStates) || rawExpansionStates.length > MAX_WORKSPACE_LAYOUT_NODES) {
		throw new Error('Workspace layout expansion states are invalid')
	}
	for (const valueState of rawExpansionStates) {
		if (!isJsonRecord(valueState) || typeof valueState.expanded !== 'boolean') {
			throw new Error('Workspace layout expansion state is invalid')
		}
		const node = nodeReference(valueState.node)
		if (!node) throw new Error('Workspace layout expansion node reference is invalid')
		const key = workspaceNodeReferenceKey(node)
		if (!keys.has(key) || expansionKeys.has(key)) {
			throw new Error('Workspace layout expansion state is missing or duplicated')
		}
		expansionKeys.add(key)
		expansionStates.push({ node, expanded: valueState.expanded })
	}
	if (typeof record.updatedAt !== 'number' || !Number.isFinite(record.updatedAt) || record.updatedAt < 0) {
		throw new Error('Workspace layout update time is invalid')
	}
	return {
		layout: workspaceLayoutPersistence(entries, hiddenFiles, pinnedContainer, record.updatedAt, expansionStates),
		migrated: decoded.migrated,
	}
}
