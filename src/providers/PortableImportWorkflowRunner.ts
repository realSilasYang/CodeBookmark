/**
 * 驱动 `.codebookmark` 包的选择、类型识别、跨设备源码匹配和显式追加/覆盖。
 * 所有目标会在写入前一次性解析；无法唯一绑定的脚本只报告冲突，不会被猜测性导入。
 */
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import type { WorkspaceLayout } from '../models/WorkspaceLayout'
import { readPortableArchive } from '../portable/PortableArchive'
import {
	newPortableExchangeRecord,
	readPortableExchangeRecord,
	writePortableExchangeRecord,
} from '../portable/PortableExchangeStore'
import type { PortableImportMode } from '../portable/PortableMerge'
import { PORTABLE_PACKAGE_EXTENSION, type PortableScript, type PortableScriptIndexEntry } from '../portable/PortablePackage'
import {
	discoverPortableTargetCandidates,
	resolvePortableScriptTarget,
	type PortableTargetCandidate,
} from '../portable/PortableTargetResolver'
import { formatBookmarkLevelSummary, mergeBookmarkLevelSummaries, summarizeBookmarkTrees } from '../util/BookmarkStatistics'
import type { CapturedUndoState } from './UndoManager'

interface PortableImportResult {
	imported: number
	matchingConflicts: number
	updated: number
	removed: number
	mergeConflicts: number
	bookmarkSummary: ReturnType<typeof summarizeBookmarkTrees>
}

interface ResolvedPortableScript {
	index: PortableScriptIndexEntry
	portable: PortableScript
	targetAbsolutePath: string
}

export interface PortableImportWorkflowPort {
	storageRoot(): string | undefined
	ensureScope(uri: vscode.Uri): Promise<void>
	storageScopeForUri(uri?: vscode.Uri): string
	flushPendingSaves(requireSuccess: boolean): Promise<void>
	runImportTransaction<T>(operation: () => Promise<T>): Promise<T>
	captureUndoState(): CapturedUndoState
	commitImportUndo(captured: CapturedUndoState): void
	targetHasBookmarks(targetAbsolutePath: string): Promise<boolean>
	importScript(
		portable: PortableScript,
		targetAbsolutePath: string,
		base: PortableScript | undefined,
		previousScriptId: string | undefined,
		previousBookmarkMappings: Readonly<Record<string, string>>,
		mode: PortableImportMode,
	): Promise<{
		localScriptId: string
		bookmarkMappings: Record<string, string>
		fileNode: { subs: { values: readonly unknown[] } }
		updated: number
		removed: number
		conflicts: number
		rollback(): Promise<void>
	}>
	importLayout(
		layout: WorkspaceLayout,
		workspaceRootPath: string,
		identities: ReadonlyMap<string, { scriptId: string, bookmarkIds: ReadonlyMap<string, string> }>,
		storageRoot: string,
		mode: PortableImportMode,
	): Promise<() => Promise<void>>
	refresh(expectedScope: string): Promise<void>
}

function normalizedName(value: string): string {
	return value.normalize('NFC').toLocaleLowerCase('en-US')
}

function containingWorkspaceFolder(filePath: string, folders: readonly vscode.WorkspaceFolder[]): vscode.WorkspaceFolder | undefined {
	const resolved = path.resolve(filePath)
	return folders.find(folder => {
		const relative = path.relative(folder.uri.fsPath, resolved)
		return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
	})
}

async function candidatesForScript(
	index: PortableScriptIndexEntry,
	rootName: string,
	folders: readonly vscode.WorkspaceFolder[],
	activePath: string | undefined,
	discoveryCache: Map<string, Promise<string[]>>,
): Promise<PortableTargetCandidate[]> {
	if (folders.length === 0) return activePath ? [{ absolutePath: activePath, isActive: true }] : []
	const candidates: PortableTargetCandidate[] = []
	for (const folder of folders) {
		const rootNameMatches = normalizedName(folder.name) === normalizedName(rootName)
		const exactPath = path.resolve(folder.uri.fsPath, ...index.relativePath.split('/'))
		candidates.push({
			absolutePath: exactPath,
			relativePath: index.relativePath,
			rootNameMatches,
			isActive: activePath !== undefined && path.resolve(activePath) === exactPath,
		})
	}
	const exactAvailability = await Promise.all(candidates.map(async candidate => {
		try { return (await fs.promises.stat(candidate.absolutePath)).isFile() } catch { return false }
	}))
	if (!exactAvailability.some(Boolean)) {
		for (const folder of folders) {
			const rootNameMatches = normalizedName(folder.name) === normalizedName(rootName)
			const cacheKey = `${normalizedName(path.resolve(folder.uri.fsPath))}\0${normalizedName(path.basename(index.relativePath))}`
			let discovery = discoveryCache.get(cacheKey)
			if (!discovery) {
				discovery = discoverPortableTargetCandidates(folder.uri.fsPath, path.basename(index.relativePath))
				discoveryCache.set(cacheKey, discovery)
			}
			for (const discovered of await discovery) {
				candidates.push({
					absolutePath: discovered,
					relativePath: path.relative(folder.uri.fsPath, discovered),
					rootNameMatches,
					isActive: activePath !== undefined && path.resolve(activePath) === path.resolve(discovered),
				})
			}
		}
	}
	if (activePath && !candidates.some(candidate => path.resolve(candidate.absolutePath) === path.resolve(activePath))) {
		const folder = containingWorkspaceFolder(activePath, folders)
		candidates.push({
			absolutePath: activePath,
			relativePath: folder ? path.relative(folder.uri.fsPath, activePath) : undefined,
			rootNameMatches: folder ? normalizedName(folder.name) === normalizedName(rootName) : false,
			isActive: true,
		})
	}
	return candidates
}

async function chooseImportMode(): Promise<PortableImportMode | undefined> {
	const append: vscode.QuickPickItem & { mode: PortableImportMode } = {
		label: localize('providers.PortableImportWorkflowRunner.append'),
		description: localize('providers.PortableImportWorkflowRunner.appendDescription'),
		mode: 'append',
	}
	const overwrite: vscode.QuickPickItem & { mode: PortableImportMode } = {
		label: localize('providers.PortableImportWorkflowRunner.overwrite'),
		description: localize('providers.PortableImportWorkflowRunner.overwriteDescription'),
		mode: 'overwrite',
	}
	return (await vscode.window.showQuickPick([append, overwrite], {
		title: localize('providers.PortableImportWorkflowRunner.chooseImportMode'),
		placeHolder: localize('providers.PortableImportWorkflowRunner.existingBookmarksDetected'),
	}))?.mode
}

export async function runPortablePackageImport(port: PortableImportWorkflowPort): Promise<void> {
	const selected = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectFolders: false,
		canSelectMany: false,
		openLabel: localize('providers.PortableImportWorkflowRunner.import'),
		title: localize('providers.PortableImportWorkflowRunner.choosePackage'),
		filters: { CodeBookmark: [PORTABLE_PACKAGE_EXTENSION.slice(1)] },
	})
	if (!selected?.[0]) return
	return importPortablePackageFromUri(port, selected[0])
}

export async function importPortablePackageFromUri(
	port: PortableImportWorkflowPort,
	packageUri: vscode.Uri,
): Promise<void> {
	if (packageUri.scheme !== 'file') throw new Error(localize('providers.PortableImportWorkflowRunner.choosePackage'))
	const archive = await fs.promises.readFile(packageUri.fsPath)
		.then(content => readPortableArchive(content))
		.catch(() => {
			throw new Error(localize('providers.PortableImportWorkflowRunner.invalidPackage'))
		})
	const storageRoot = port.storageRoot()
	if (!storageRoot) throw new Error(localize('repository.BookmarkRepository.theBookmarkStorageFolderIsNotConfigured'))
	await port.flushPendingSaves(true)

	const editor = vscode.window.activeTextEditor?.document.uri.scheme === 'file' ? vscode.window.activeTextEditor : undefined
	const activePath = editor?.document.uri.fsPath
	const workspaceFolders = vscode.workspace.workspaceFolders ?? []
	if (workspaceFolders.length === 0 && !activePath) {
		void vscode.window.showWarningMessage(localize('providers.PortableImportWorkflowRunner.openWorkspaceOrScript'))
		return
	}

	const resolved: ResolvedPortableScript[] = []
	const unresolved = new Set<string>()
	const discoveryCache = new Map<string, Promise<string[]>>()
	for (const index of archive.manifest.scripts) {
		const portable = archive.scripts.get(index.scriptId)
		if (!portable) throw new Error(localize('providers.PortableImportWorkflowRunner.packageIndexInconsistent'))
		const rootName = archive.manifest.roots.find(root => root.id === index.rootId)?.name ?? ''
		const resolution = await resolvePortableScriptTarget(
			index,
			portable,
			await candidatesForScript(index, rootName, workspaceFolders, activePath, discoveryCache),
			workspaceFolders.length === 0 && archive.manifest.scope === 'script' && archive.manifest.scripts.length === 1,
		)
		if (!resolution.targetAbsolutePath) unresolved.add(index.relativePath)
		else resolved.push({ index, portable, targetAbsolutePath: resolution.targetAbsolutePath })
	}

	const duplicateTargets = new Map<string, ResolvedPortableScript[]>()
	for (const item of resolved) {
		const key = normalizedName(path.resolve(item.targetAbsolutePath).replace(/\\/g, '/'))
		const group = duplicateTargets.get(key) ?? []
		group.push(item)
		duplicateTargets.set(key, group)
	}
	const safeResolved = resolved.filter(item => {
		const key = normalizedName(path.resolve(item.targetAbsolutePath).replace(/\\/g, '/'))
		const unique = duplicateTargets.get(key)?.length === 1
		if (!unique) unresolved.add(item.index.relativePath)
		return unique
	})

	if (safeResolved.length === 0) {
		void vscode.window.showWarningMessage(localize('providers.PortableImportWorkflowRunner.noUniqueTargets', {
			count: unresolved.size,
		}))
		return
	}
	const firstUri = vscode.Uri.file(safeResolved[0].targetAbsolutePath)
	const expectedScope = port.storageScopeForUri(firstUri)
	const sameScope = safeResolved.filter(item => port.storageScopeForUri(vscode.Uri.file(item.targetAbsolutePath)) === expectedScope)
	for (const item of safeResolved) {
		if (!sameScope.includes(item)) unresolved.add(item.index.relativePath)
	}
	await port.ensureScope(firstUri)
	const prior = await readPortableExchangeRecord(storageRoot, archive.manifest.exchangeId, expectedScope)
	let mode: PortableImportMode = 'append'
	for (const item of sameScope) {
		if (await port.targetHasBookmarks(item.targetAbsolutePath)) {
			const selectedMode = await chooseImportMode()
			if (!selectedMode) return
			mode = selectedMode
			break
		}
	}

	const result = await port.runImportTransaction(async () => {
		const captured = port.captureUndoState()
		const rollbacks: Array<() => Promise<void>> = []
		const mappings = { ...(prior?.scriptMappings ?? {}) }
		const bookmarkMappings = { ...(prior?.bookmarkMappings ?? {}) }
		const baseByScript = new Map((prior?.baseScripts ?? []).map(script => [script.scriptId, script]))
		const incomingBaseByScript = archive.baseScripts
		const identities = new Map<string, { scriptId: string, bookmarkIds: Map<string, string> }>()
		const summary: PortableImportResult = {
			imported: 0,
			matchingConflicts: unresolved.size,
			updated: 0,
			removed: 0,
			mergeConflicts: 0,
			bookmarkSummary: { total: 0, levelCounts: [] },
		}
		try {
			for (const item of sameScope) {
				const previousScriptId = mappings[item.portable.scriptId]
				const imported = await port.importScript(
					item.portable,
					item.targetAbsolutePath,
					previousScriptId
						? incomingBaseByScript.get(item.portable.scriptId)
							?? (archive.manifest.parentRevisionIds.includes(prior?.lastRevisionId ?? '')
								? baseByScript.get(item.portable.scriptId) : undefined)
						: undefined,
					previousScriptId,
					bookmarkMappings,
					mode,
				)
				rollbacks.push(imported.rollback)
				mappings[item.portable.scriptId] = imported.localScriptId
				Object.assign(bookmarkMappings, imported.bookmarkMappings)
				identities.set(item.portable.scriptId, {
					scriptId: imported.localScriptId,
					bookmarkIds: new Map(Object.entries(imported.bookmarkMappings)),
				})
				summary.imported++
				summary.updated += imported.updated
				summary.removed += imported.removed
				summary.mergeConflicts += imported.conflicts
				summary.bookmarkSummary = mergeBookmarkLevelSummaries(
					summary.bookmarkSummary,
					summarizeBookmarkTrees(imported.fileNode.subs.values as never),
				)
			}
			const workspaceRoot = vscode.workspace.getWorkspaceFolder(firstUri)?.uri.fsPath
			if (archive.layout && workspaceRoot && identities.size > 0) {
				rollbacks.push(await port.importLayout(archive.layout, workspaceRoot, identities, storageRoot, mode))
			}
			if (port.storageScopeForUri(firstUri) !== expectedScope) {
				throw new Error(localize('providers.PortableImportWorkflowRunner.scopeChanged'))
			}
			rollbacks.push(await writePortableExchangeRecord(storageRoot, newPortableExchangeRecord(
				archive.manifest.exchangeId,
				expectedScope,
				archive.manifest.revisionId,
				sameScope.map(item => item.portable),
				mappings,
				bookmarkMappings,
			)))
			if (summary.imported > 0) port.commitImportUndo(captured)
			return summary
		} catch (error) {
			for (const rollback of rollbacks.reverse()) {
				try { await rollback() } catch { /* 保留最初的导入错误；恢复失败会由后续重新加载暴露。 */ }
			}
			throw error
		}
	})
	await port.refresh(expectedScope)
	const message = localize('providers.PortableImportWorkflowRunner.completed', {
		imported: result.imported,
		updated: result.updated,
		removed: result.removed,
		mergeConflicts: result.mergeConflicts,
		matchingConflicts: result.matchingConflicts,
		formatBookmarkLevelSummary: formatBookmarkLevelSummary(result.bookmarkSummary),
	})
	if (result.matchingConflicts > 0 || result.mergeConflicts > 0) void vscode.window.showWarningMessage(message)
	else void vscode.window.showInformationMessage(message)
}
