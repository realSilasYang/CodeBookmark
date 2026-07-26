/**
 * 从当前书签树生成与机器路径无关的便携快照，并延续该作用域最近使用的交换系列身份。
 * 导出只读取领域状态和源码摘要；布局中的跨文件关系保持稳定 ID，不复制任何本机存储路径。
 */
import * as path from 'path'
import * as vscode from 'vscode'
import { projectBookmarksByOwner } from '../models/BookmarkOwnership'
import type { BookmarkSet } from '../models/BookmarkSet'
import { workspaceLayoutPersistence, type WorkspaceLayout, type WorkspaceNodeReference } from '../models/WorkspaceLayout'
import { isSameOrDescendantAbsolutePath, normalizedAbsolutePath } from '../util/AbsolutePath'
import { fileUtils } from '../util/FileUtils'
import { createOperationId } from '../util/ScriptIdentity'
import { createPortableArchive } from './PortableArchive'
import {
	PORTABLE_PACKAGE_FORMAT,
	PORTABLE_PACKAGE_SCHEMA_VERSION,
	PORTABLE_SCRIPT_FORMAT,
	portableBookmarkItems,
	type PortableManifest,
	type PortableScript,
} from './PortablePackage'
import {
	findPortableExchangeRecordForScope,
	newPortableExchangeRecord,
	type PortableExchangeRecord,
} from './PortableExchangeStore'
import { fingerprintPortableSource } from './PortableSourceFingerprint'

export interface PortableExportSnapshot {
	bookmarks: BookmarkSet
	storageScope: string
	scopeFilePath?: string
	layout?: WorkspaceLayout
}

interface PreparedPortableExport {
	archive: Uint8Array
	record: PortableExchangeRecord
	manifest: Omit<PortableManifest, 'scripts' | 'layout' | 'base'>
	scripts: PortableScript[]
}

interface PortableExportOptions {
	rootPath?: string
}

function portablePath(value: string): string {
	return value.split(path.sep).join('/')
}

function scopeRoot(snapshot: PortableExportSnapshot): string {
	if (snapshot.storageScope.startsWith('workspace:')) return snapshot.storageScope.slice('workspace:'.length)
	if (snapshot.scopeFilePath) return path.dirname(snapshot.scopeFilePath)
	throw new Error('No source scope is available for portable export')
}

function remapBookmarkIds(
	items: readonly unknown[],
	reverseMappings: ReadonlyMap<string, string>,
	output: Record<string, string>,
): unknown[] {
	const clones = portableBookmarkItems(items)
	const visit = (item: unknown): void => {
		if (!item || typeof item !== 'object') return
		const record = item as { id?: unknown, subs?: unknown }
		if (typeof record.id === 'string') {
			const localId = record.id
			const portableId = reverseMappings.get(localId) ?? localId
			record.id = portableId
			output[portableId] = localId
		}
		if (Array.isArray(record.subs)) record.subs.forEach(visit)
	}
	clones.forEach(visit)
	return clones
}

function portableLayout(
	layout: WorkspaceLayout | undefined,
	reverseScriptMappings: ReadonlyMap<string, string>,
	reverseBookmarkMappings: ReadonlyMap<string, string>,
	includedLocalScriptIds: ReadonlySet<string>,
): WorkspaceLayout | undefined {
	if (!layout) return undefined
	const remap = (reference: WorkspaceNodeReference): WorkspaceNodeReference | undefined => {
		if (!includedLocalScriptIds.has(reference.scriptId)) return undefined
		const scriptId = reverseScriptMappings.get(reference.scriptId) ?? reference.scriptId
		return reference.kind === 'script' ? { kind: 'script', scriptId } : {
			kind: 'bookmark',
			scriptId,
			bookmarkId: reverseBookmarkMappings.get(reference.bookmarkId) ?? reference.bookmarkId,
		}
	}
	const entries = layout.entries.flatMap(entry => {
		const node = remap(entry.node)
		return node ? [{ node, parent: entry.parent ? remap(entry.parent) ?? null : null }] : []
	})
	const entryKeys = new Set(entries.map(entry => entry.node.kind === 'script'
		? `script:${entry.node.scriptId}` : `bookmark:${entry.node.scriptId}:${entry.node.bookmarkId}`))
	const expansionStates = layout.expansionStates.flatMap(state => {
		const node = remap(state.node)
		if (!node) return []
		const key = node.kind === 'script' ? `script:${node.scriptId}` : `bookmark:${node.scriptId}:${node.bookmarkId}`
		return entryKeys.has(key) ? [{ node, expanded: state.expanded }] : []
	})
	return workspaceLayoutPersistence(
		entries,
		layout.hiddenFiles.flatMap(scriptId => includedLocalScriptIds.has(scriptId)
			? [reverseScriptMappings.get(scriptId) ?? scriptId] : []),
		layout.pinnedContainer ? remap(layout.pinnedContainer) ?? null : null,
		layout.updatedAt,
		expansionStates,
	)
}

export async function preparePortableExport(
	snapshot: PortableExportSnapshot,
	storageRoot: string,
	options: PortableExportOptions = {},
): Promise<PreparedPortableExport> {
	const sourceScopeRoot = scopeRoot(snapshot)
	const rootPath = normalizedAbsolutePath(options.rootPath ?? sourceScopeRoot)
	const rootId = 'root-1'
	const projections = projectBookmarksByOwner(snapshot.bookmarks)
		.filter(projection => {
			if (!projection.fileNode || projection.bookmarks.length === 0) return false
			const absolutePath = normalizedAbsolutePath(path.isAbsolute(projection.path)
				? projection.path : fileUtils.relativeToAbsolute(projection.path, vscode.Uri.file(sourceScopeRoot)))
			return isSameOrDescendantAbsolutePath(absolutePath, rootPath)
		})
	if (projections.length === 0) throw new Error('There are no bookmarks to export')
	const existing = await findPortableExchangeRecordForScope(storageRoot, snapshot.storageScope)
	const reverseScriptMappings = new Map(Object.entries(existing?.scriptMappings ?? {}).map(([portable, local]) => [local, portable]))
	const reverseBookmarkMappings = new Map(Object.entries(existing?.bookmarkMappings ?? {}).map(([portable, local]) => [local, portable]))
	const exchangeId = existing?.exchangeId ?? createOperationId()
	const revisionId = createOperationId()
	const scripts: PortableScript[] = []
	const indexes: Array<{ index: Omit<PortableManifest['scripts'][number], 'sha256'>, value: PortableScript }> = []
	const scriptMappings: Record<string, string> = {}
	const bookmarkMappings: Record<string, string> = {}
	for (const projection of projections) {
		const absolutePath = normalizedAbsolutePath(path.isAbsolute(projection.path)
			? projection.path
			: fileUtils.relativeToAbsolute(projection.path, vscode.Uri.file(sourceScopeRoot)))
		const relative = path.relative(rootPath, absolutePath)
		if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
			throw new Error(`Bookmark source is outside the portable export root: ${absolutePath}`)
		}
		const fingerprint = await fingerprintPortableSource(absolutePath)
		const label = projection.fileNode?.fileLabelCustomized ? `${projection.fileNode.label}` : undefined
		const icon = projection.fileNode?.icon || undefined
		const portableScriptId = reverseScriptMappings.get(projection.scriptId) ?? projection.scriptId
		const bookmarks = remapBookmarkIds(projection.bookmarks, reverseBookmarkMappings, bookmarkMappings)
		const value: PortableScript = {
			format: PORTABLE_SCRIPT_FORMAT,
			schemaVersion: PORTABLE_PACKAGE_SCHEMA_VERSION,
			scriptId: portableScriptId,
			presentation: label || icon ? { label, icon } : undefined,
			fingerprint,
			bookmarks,
		}
		scripts.push(value)
		scriptMappings[portableScriptId] = projection.scriptId
		indexes.push({
			index: {
				scriptId: portableScriptId,
				rootId,
				relativePath: portablePath(relative),
				entry: `scripts/${portableScriptId}.json`,
			},
			value,
		})
	}
	const includedLocalScriptIds = new Set(Object.values(scriptMappings))
	const exportedLayout = portableLayout(snapshot.layout, reverseScriptMappings, reverseBookmarkMappings, includedLocalScriptIds)
	const exportedScriptIds = new Set(scripts.map(script => script.scriptId))
	const baseScripts = (existing?.baseScripts ?? []).filter(script => exportedScriptIds.has(script.scriptId))
	const manifest = {
		format: PORTABLE_PACKAGE_FORMAT,
		schemaVersion: PORTABLE_PACKAGE_SCHEMA_VERSION,
		exchangeId,
		revisionId,
		parentRevisionIds: existing ? [existing.lastRevisionId] : [],
		createdAt: Date.now(),
		title: path.basename(rootPath),
		scope: snapshot.storageScope.startsWith('workspace:') ? 'workspace' as const : 'script' as const,
		roots: [{ id: rootId, name: path.basename(rootPath) }],
	}
	return {
		archive: createPortableArchive(
			manifest,
			indexes,
			exportedLayout,
			existing && baseScripts.length > 0 ? { revisionId: existing.lastRevisionId, scripts: baseScripts } : undefined,
		),
		record: newPortableExchangeRecord(exchangeId, snapshot.storageScope, revisionId, scripts, scriptMappings, bookmarkMappings),
		manifest,
		scripts,
	}
}
