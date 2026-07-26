/**
 * 处理工作区布局文件的导入、脚本身份重映射和工作区根目录迁移。
 * 遇到目标冲突时保留可恢复副本，防止目录移动或导入过程静默覆盖已有布局。
 */
import * as fs from 'fs'
import * as path from 'path'
import { localize } from '../i18n/Localization'
import {
	decodeWorkspaceLayoutPersistence,
	workspaceLayoutPersistence,
	workspaceNodeReferenceKey,
	type WorkspaceLayout,
	type WorkspaceNodeReference,
} from '../models/WorkspaceLayout'
import type { PortableImportMode } from '../portable/PortableMerge'
import { atomicWriteFile } from '../util/AtomicFile'
import { fileUtils } from '../util/FileUtils'
import type { ScriptRelocationRecord } from './ScriptRelocationJournal'
import { pathExists, readFileIfExists } from '../util/FileSystem'
import { sha256Hex } from '../util/Sha256'

export async function relocateWorkspaceLayoutFile(
	record: ScriptRelocationRecord,
	foldersReferToSameFile: boolean,
): Promise<void> {
	if (foldersReferToSameFile) return
	const source = path.join(record.oldBookmarkFolder, '_workspace_layout.json')
	if (!await pathExists(source)) return
	await fs.promises.mkdir(record.newBookmarkFolder, { recursive: true })
	const target = path.join(record.newBookmarkFolder, '_workspace_layout.json')
	if (!await pathExists(target)) {
		await fs.promises.rename(source, target)
		return
	}
	const content = await fs.promises.readFile(source)
	const hash = sha256Hex(content).slice(0, 12)
	const conflict = path.join(record.newBookmarkFolder, `_workspace_layout.relocation-conflict_${hash}.json`)
	if (!await pathExists(conflict)) await fs.promises.writeFile(conflict, content)
	await fs.promises.unlink(source)
}

export async function importPortableWorkspaceLayout(
	source: WorkspaceLayout,
	workspaceRootPath: string,
	identities: ReadonlyMap<string, { scriptId: string, bookmarkIds: ReadonlyMap<string, string> }>,
	storageRoot: string,
	mode: PortableImportMode,
): Promise<() => Promise<void>> {
	const remap = (reference: WorkspaceNodeReference): WorkspaceNodeReference | undefined => {
		const identity = identities.get(reference.scriptId)
		if (!identity) return undefined
		return reference.kind === 'script'
			? { kind: 'script', scriptId: identity.scriptId }
			: identity.bookmarkIds.has(reference.bookmarkId)
				? {
					kind: 'bookmark',
					scriptId: identity.scriptId,
					bookmarkId: identity.bookmarkIds.get(reference.bookmarkId)!,
				}
				: undefined
	}
	const importedEntries = source.entries.flatMap(entry => {
		const node = remap(entry.node)
		return node ? [{ node, parent: entry.parent ? remap(entry.parent) ?? null : null }] : []
	})
	const importedExpansionStates = source.expansionStates.flatMap(state => {
		const node = remap(state.node)
		return node ? [{ node, expanded: state.expanded }] : []
	})
	const folder = fileUtils.getWorkspaceBookmarkFolder(workspaceRootPath, storageRoot)
	if (!folder) return async () => {}
	const targetPath = path.join(folder, '_workspace_layout.json')
	const previous = await readFileIfExists(targetPath)
	let existingEntries: typeof importedEntries = []
	let existingHidden: string[] = []
	let existingExpansionStates: typeof importedExpansionStates = []
	let pinned = source.pinnedContainer ? remap(source.pinnedContainer) ?? null : null
	const importedLocalScriptIds = new Set([...identities.values()].map(identity => identity.scriptId))
	if (await pathExists(targetPath)) {
		const existing = decodeWorkspaceLayoutPersistence(await fileUtils.readJsonFileAsync(targetPath)).layout
		existingEntries = mode === 'append' ? existing.entries
			: existing.entries.filter(entry => !importedLocalScriptIds.has(entry.node.scriptId))
		existingHidden = mode === 'append' ? existing.hiddenFiles
			: existing.hiddenFiles.filter(scriptId => !importedLocalScriptIds.has(scriptId))
		existingExpansionStates = mode === 'append' ? existing.expansionStates
			: existing.expansionStates.filter(state => !importedLocalScriptIds.has(state.node.scriptId))
		pinned = mode === 'append' && existing.pinnedContainer
			? existing.pinnedContainer
			: existing.pinnedContainer && !importedLocalScriptIds.has(existing.pinnedContainer.scriptId)
				? existing.pinnedContainer
				: pinned
	}
	const keys = new Set(existingEntries.map(entry => workspaceNodeReferenceKey(entry.node)))
	for (const entry of importedEntries) {
		const key = workspaceNodeReferenceKey(entry.node)
		if (keys.has(key)) continue
		existingEntries.push(entry)
		keys.add(key)
	}
	const mergedEntries = existingEntries.map(entry => entry.parent && !keys.has(workspaceNodeReferenceKey(entry.parent))
		? { ...entry, parent: null }
		: entry)
	const hidden = [...new Set([
		...existingHidden,
		...source.hiddenFiles.flatMap(scriptId => identities.get(scriptId)?.scriptId ?? []),
	])]
	const expansionByKey = new Map(importedExpansionStates.map(state => [workspaceNodeReferenceKey(state.node), state]))
	for (const state of existingExpansionStates) expansionByKey.set(workspaceNodeReferenceKey(state.node), state)
	if (!await fileUtils.writeJsonFileAsync(targetPath, workspaceLayoutPersistence(
		mergedEntries,
		hidden,
		pinned,
		Date.now(),
		[...expansionByKey.values()],
	))) {
		throw new Error(localize("repository.WorkspaceLayoutRepository.unableToWriteTheImportedWorkspaceBookmarkLayout"))
	}
	return async () => {
		if (previous) await atomicWriteFile(targetPath, previous)
		else await fs.promises.rm(targetPath, { force: true })
	}
}
