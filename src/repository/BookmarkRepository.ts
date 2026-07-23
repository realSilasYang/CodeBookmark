/**
 * 模块说明：本文件负责持久化、索引与迁移事务，具体对象为 `BookmarkRepository`。
 *
 * 实现要点：统一读取、校验、原子写入和重定位事务，维护磁盘配置的权威身份。
 * 核心边界：所有磁盘状态都必须经过校验与原子化处理，不能让部分写入覆盖仍有效的用户数据。
 * 主要入口：`ScriptRelocationChange`、`BookmarkConfigurationFolderImportResult`、`bookmarkRepository`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { localize, UserCancelledError } from '../i18n/Localization'
import { fileUtils } from '../util/FileUtils'
import { ContextBookmark } from '../util/ContextValue'
import { logger } from '../util/Logger'
import { Bookmark } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'
import { fileChangeFingerprints } from '../util/FileChangeFingerprint'
import { canonicalBookmarkPath } from '../util/BookmarkPath'
import { createScriptId, fingerprintSourceFile, isScriptId, type SourceFingerprint } from '../util/ScriptIdentity'
import {
	executeScriptRelocation,
	type ScriptRelocationRecord,
} from './ScriptRelocationJournal'
import { isExcludedSourceRelativePath } from '../util/SourceFilePolicy'
import {
	absolutePathKey,
	isSameOrDescendantAbsolutePath,
	normalizedAbsolutePath,
} from '../util/AbsolutePath'
import {
	mergeSerializedBookmarks,
	rewriteSerializedBookmarkIds,
	setSerializedBookmarkPaths,
} from '../models/SerializedBookmarkTree'
import { SerialTaskQueue } from '../util/SerialTaskQueue'
import { persistLegacyJsonMigration } from '../util/PersistenceMigration'
import {
	persistenceHeader,
	PersistenceFormats,
} from '../util/PersistenceSchema'
import { ScriptIndex, type ScriptIndexEntry } from './ScriptIndex'
import { inferDirectoryRelocation, planScriptRelocation } from './ScriptRelocationPlan'
import { recoverScriptRelocations } from './ScriptRelocationRecovery'
import { WorkspaceOrderStore } from './WorkspaceOrderStore'
import { SourceCandidateIndex, type SourceCandidate } from './SourceCandidateIndex'
import {
	bookmarkItems,
	createScriptEnvelope,
	decodeScriptConfiguration,
	scriptMetadata,
	type BookmarkFileEnvelope,
} from './ScriptEnvelopeCodec'
import {
	absoluteBookmarkFileNodePath,
	createBookmarkFileEnvelope,
	createBookmarkFileNode,
	updateBookmarkFileNodePath,
} from './BookmarkFileNodeCodec'
import {
	collectBookmarkConfigurationImportCandidates,
	type BookmarkConfigurationImportCandidate,
} from './BookmarkConfigurationImportScanner'
import {
	removeBookmarkConfigurationFiles,
	type BookmarkConfigurationDeleteRequest,
	type BookmarkConfigurationDeletionResult,
} from './BookmarkConfigurationCatalog'
import {
	formatBookmarkLevelSummary,
	mergeBookmarkLevelSummaries,
	summarizeBookmarkTrees,
	type BookmarkLevelSummary,
} from '../util/BookmarkStatistics'

interface MissingReconciliation {
	ambiguousTargets: Set<string>
	candidates?: SourceCandidateIndex
}

interface RelocatedBookmarkSummary {
	scriptCount: number
	bookmarkSummary: BookmarkLevelSummary
}

export interface ScriptRelocationChange {
	oldAbsolutePath: string
	newAbsolutePath: string
	scriptId: string
}

export interface BookmarkConfigurationFolderImportResult {
	total: number
	imported: number
	skipped: number
	failed: number
	cancelled: boolean
	bookmarkSummary: BookmarkLevelSummary
}

class BookmarkReadCancelledError extends Error {
	constructor() {
		super('Bookmark read cancelled')
		this.name = 'BookmarkReadCancelledError'
	}
}

function throwIfReadCancelled(signal?: AbortSignal): void {
	if (signal?.aborted) throw new BookmarkReadCancelledError()
}

function isBookmarkReadCancelled(error: unknown): boolean {
	return error instanceof BookmarkReadCancelledError
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.promises.access(filePath)
		return true
	} catch {
		return false
	}
}

class CodeBookmarksRepository {
	private readonly scriptIndex = new ScriptIndex()
	private readonly relocationQueue = new SerialTaskQueue()
	private readonly workspaceOrders = new WorkspaceOrderStore({
		exists: filePath => pathExists(filePath),
		readJson: filePath => fileUtils.readJsonFileAsync(filePath),
		writeJson: (filePath, value) => fileUtils.writeJsonFileAsync(filePath, value),
		// 工作区顺序可由脚本配置重新推导，因此直接原位迁移；若留下备份，
		// 旧备份可能被目录发现逻辑误认为仍有效的作用域。
		migrateJson: (filePath, value) => fileUtils.writeJsonFileAsync(filePath, value),
		deleteFile: filePath => this.deleteFile(filePath),
	})

	private get indexReady(): boolean {
		return this.scriptIndex.isReady
	}

	private set indexReady(value: boolean) {
		this.scriptIndex.isReady = value
	}

	private removeIndexEntry(id: string): void {
		this.scriptIndex.remove(id)
	}

	private indexEntry(entry: ScriptIndexEntry): void {
		this.scriptIndex.set(entry)
	}

	private pathsReferToSameFile(first: string, second: string): boolean {
		return absolutePathKey(first) === absolutePathKey(second)
	}

	private storageRoot(storageRootOverride?: string): string | undefined {
		return fileUtils.getGlobalBookmarkFolder(false, undefined, storageRootOverride) ?? undefined
	}

	private scriptFolder(storageRoot: string): string {
		const folder = fileUtils.getScriptStoreFolder(storageRoot)
		if (!folder) throw new Error(localize('无法确定全局脚本书签目录', 'Unable to determine the global script bookmark folder.'))
		return folder
	}

	private async readBookmarkFile(filePath: string): Promise<{ data: BookmarkFileEnvelope, filePath: string }> {
		const decoded = decodeScriptConfiguration(await fileUtils.readJsonFileAsync(filePath))
		if (decoded.migrated) {
			const migration = await persistLegacyJsonMigration(
				filePath,
				decoded.data,
				(target, value) => fileUtils.writeJsonFileAsync(target, value),
			)
			logger.info(localize(
				`已将书签配置迁移到持久化格式 v1，并保留备份：${migration.backupPath}`,
				`Migrated the bookmark configuration to persistence format v1 and kept a backup: ${migration.backupPath}`,
			))
		}
		const data = decoded.data
		const metadata = scriptMetadata(data)
		if (!metadata || !bookmarkItems(data)
			|| path.basename(filePath).toLowerCase() !== `${metadata.id}.json`.toLowerCase()) {
			throw new Error(localize(`不支持的书签配置：${filePath}`, `Unsupported bookmark configuration: ${filePath}`))
		}
		return { data: data as BookmarkFileEnvelope, filePath }
	}

	private async originalPathIsAvailable(entry: ScriptIndexEntry): Promise<boolean> {
		if (!await pathExists(entry.metadata.path)) return false
		const expected = entry.metadata.fingerprint
		if (!expected) return entry.metadata.missingSince === undefined
		const current = await fingerprintSourceFile(entry.metadata.path)
		if (current?.sha256 === expected.sha256) return true
		if (entry.metadata.missingSince !== undefined || !current) return false
		return expected.device !== undefined && expected.inode !== undefined
			&& current.device === expected.device && current.inode === expected.inode
	}

	private async rebuildIndex(storageRoot: string, signal?: AbortSignal): Promise<void> {
		throwIfReadCancelled(signal)
		const rootKey = absolutePathKey(storageRoot)
		this.scriptIndex.reset(rootKey)
		const folder = this.scriptFolder(storageRoot)
		const files = await fs.promises.readdir(folder)
		throwIfReadCancelled(signal)
		for (const file of files) {
			throwIfReadCancelled(signal)
			const id = path.basename(file, path.extname(file))
			if (path.extname(file).toLowerCase() !== '.json' || !isScriptId(id)) continue
			const filePath = path.join(folder, file)
			try {
				const { data } = await this.readBookmarkFile(filePath)
				throwIfReadCancelled(signal)
				const metadata = scriptMetadata(data)
				if (metadata) this.indexEntry({ id: metadata.id, filePath, metadata })
			} catch (error) {
				if (isBookmarkReadCancelled(error)) throw error
				logger.error(localize(
					`已跳过损坏的全局脚本书签配置（${filePath}）: ${error}`,
					`Skipped a damaged global script bookmark configuration (${filePath}): ${error}`,
				))
			}
		}
		this.scriptIndex.markReady()
		const paths = new Set(this.scriptIndex.values().map(entry => absolutePathKey(entry.metadata.path)))
		for (const pathKey of paths) {
			throwIfReadCancelled(signal)
			const duplicates = this.scriptIndex.values().filter(entry => absolutePathKey(entry.metadata.path) === pathKey)
			if (duplicates.length > 1) await this.reconcileDuplicatePath(duplicates[0].metadata.path, undefined, signal)
		}
	}

	private async ensureIndex(storageRoot: string, signal?: AbortSignal): Promise<void> {
		throwIfReadCancelled(signal)
		if (!this.indexReady || this.scriptIndex.storageRootKey !== absolutePathKey(storageRoot)) {
			await this.rebuildIndex(storageRoot, signal)
		}
		throwIfReadCancelled(signal)
	}

	private async refreshIndexFiles(storageRoot: string, fileNames: readonly string[], signal?: AbortSignal): Promise<void> {
		await this.ensureIndex(storageRoot, signal)
		const folder = this.scriptFolder(storageRoot)
		for (const name of fileNames) {
			throwIfReadCancelled(signal)
			const id = path.basename(name, path.extname(name))
			if (!isScriptId(id)) continue
			this.removeIndexEntry(id)
			const filePath = path.join(folder, `${id}.json`)
			if (!await pathExists(filePath)) continue
			throwIfReadCancelled(signal)
			try {
				const { data } = await this.readBookmarkFile(filePath)
				throwIfReadCancelled(signal)
				const metadata = scriptMetadata(data)
				if (metadata) this.indexEntry({ id, filePath, metadata })
			} catch (error) {
				if (isBookmarkReadCancelled(error)) throw error
				logger.error(localize(
					`外部脚本书签配置无效（${filePath}）: ${error}`,
					`An external script bookmark configuration is invalid (${filePath}): ${error}`,
				))
			}
		}
	}

	private updateIndex(filePath: string, data: BookmarkFileEnvelope): void {
		const metadata = scriptMetadata(data)
		if (!metadata) throw new Error(localize(`无法索引脚本书签配置: ${filePath}`, `Unable to index the script bookmark configuration: ${filePath}`))
		this.indexEntry({ id: metadata.id, filePath, metadata })
	}

	private entriesAtAbsolutePath(absolutePath: string): ScriptIndexEntry[] {
		return this.scriptIndex.byPath(absolutePath)
	}

	private entriesWithFingerprint(fingerprint: SourceFingerprint): ScriptIndexEntry[] {
		return this.scriptIndex.byFingerprint(fingerprint)
	}

	private displayPath(absolutePath: string, scopeUri?: vscode.Uri): string {
		const workspaceFolder = scopeUri ? vscode.workspace.getWorkspaceFolder(scopeUri) : undefined
		if (workspaceFolder && isSameOrDescendantAbsolutePath(absolutePath, workspaceFolder.uri.fsPath)) {
			return canonicalBookmarkPath(path.relative(workspaceFolder.uri.fsPath, absolutePath))
		}
		return canonicalBookmarkPath(normalizedAbsolutePath(absolutePath))
	}

	private createFileNode(data: unknown, displayPath?: string, strict = false): Bookmark | undefined {
		return createBookmarkFileNode(data, displayPath, strict)
	}

	private absolutePathForFileNode(fileNode: Bookmark, scopeUri?: vscode.Uri): string {
		return absoluteBookmarkFileNodePath(fileNode, fileUtils.workspaceRoot(scopeUri))
	}

	private async envelopeForFileNode(
		fileNode: Bookmark,
		scopeUri?: vscode.Uri,
		absolutePathOverride?: string,
	): Promise<BookmarkFileEnvelope> {
		const absolutePath = absolutePathOverride ?? this.absolutePathForFileNode(fileNode, scopeUri)
		const previousMetadata = fileNode.scriptId ? this.scriptIndex.get(fileNode.scriptId)?.metadata : undefined
		return createBookmarkFileEnvelope(fileNode, absolutePath, previousMetadata)
	}

	private async writeEnvelope(filePath: string, data: BookmarkFileEnvelope): Promise<void> {
		if (!await fileUtils.writeJsonFileAsync(filePath, data)) throw new Error(localize(
			`无法写入书签配置: ${filePath}`,
			`Unable to write the bookmark configuration: ${filePath}`,
		))
		this.updateIndex(filePath, data)
	}

	private async deleteFile(filePath: string): Promise<void> {
		fileChangeFingerprints.markDeleteIntent(filePath)
		try {
			await fs.promises.unlink(filePath)
			fileChangeFingerprints.markDeleteComplete(filePath)
		} catch (error) {
			fileChangeFingerprints.markDeleteFailed(filePath)
			throw error
		}
	}

	private async archiveSupersededConfig(filePath: string): Promise<void> {
		const backup = `${filePath}.backup`
		if (!await pathExists(backup)) await fs.promises.copyFile(filePath, backup, fs.constants.COPYFILE_EXCL)
		let preserved = `${filePath}.superseded`
		let suffix = 1
		while (await pathExists(preserved)) preserved = `${filePath}.superseded_${suffix++}`
		fileChangeFingerprints.markDeleteIntent(filePath)
		try {
			await fs.promises.rename(filePath, preserved)
			fileChangeFingerprints.markDeleteComplete(filePath)
		} catch (error) {
			fileChangeFingerprints.markDeleteFailed(filePath)
			throw error
		}
	}

	private async reconcileDuplicatePath(
		absolutePath: string,
		preferredId?: string,
		signal?: AbortSignal,
	): Promise<ScriptIndexEntry | undefined> {
		throwIfReadCancelled(signal)
		const duplicates = this.entriesAtAbsolutePath(absolutePath)
		if (duplicates.length === 0) return undefined
		if (duplicates.length === 1) return duplicates[0]
		const primary = duplicates.find(entry => entry.id === preferredId)
			?? [...duplicates].sort((a, b) => b.metadata.lastSeenAt - a.metadata.lastSeenAt)[0]
		const data = (await this.readBookmarkFile(primary.filePath)).data
		throwIfReadCancelled(signal)
		for (const duplicate of duplicates) {
			if (duplicate.id === primary.id) continue
			const duplicateData = (await this.readBookmarkFile(duplicate.filePath)).data
			throwIfReadCancelled(signal)
			data.bookmarks = mergeSerializedBookmarks(data.bookmarks, duplicateData.bookmarks, primary.metadata.path)
		}
		// 第一次写入开始后，重复配置清理必须作为一个保持完整性的单元执行到底。
		throwIfReadCancelled(signal)
		await this.writeEnvelope(primary.filePath, data)
		for (const duplicate of duplicates) {
			if (duplicate.id === primary.id) continue
			await this.archiveSupersededConfig(duplicate.filePath)
			this.removeIndexEntry(duplicate.id)
		}
		return this.scriptIndex.get(primary.id)
	}

	private sourceCandidateIndex(paths: readonly string[], signal?: AbortSignal): Promise<SourceCandidateIndex> {
		return SourceCandidateIndex.fromPaths(paths, () => throwIfReadCancelled(signal))
	}

	private sourceCandidates(root: string, signal?: AbortSignal): Promise<SourceCandidateIndex> {
		return SourceCandidateIndex.scan(root, () => throwIfReadCancelled(signal))
	}

	private bookmarkAnchors(fileNode: Bookmark): string[] {
		const anchors = new Set<string>()
		const collect = (bookmarks: Bookmark[]): void => {
			for (const bookmark of bookmarks) {
				for (const value of [bookmark.content, bookmark.contextBefore, bookmark.contextAfter]) {
					const normalized = value?.trim()
					if (normalized && normalized.length >= 4) anchors.add(normalized)
				}
				if (bookmark.subs.size > 0) collect(bookmark.subs.values)
				if (anchors.size >= 20) return
			}
		}
		collect(fileNode.subs.values)
		return [...anchors].slice(0, 20)
	}

	private async findRelocatedSource(
		fileNode: Bookmark,
		data: BookmarkFileEnvelope,
		candidates: SourceCandidateIndex,
		signal?: AbortSignal,
	): Promise<string | undefined> {
		throwIfReadCancelled(signal)
		const metadata = scriptMetadata(data)
		const anchors = this.bookmarkAnchors(fileNode)
		const expectedBaseName = path.basename(metadata?.path ?? fileNode.path)
		const expectedBaseNameKey = expectedBaseName
		const expectedExtension = path.extname(metadata?.path ?? fileNode.path).toLowerCase()
		const previous = metadata?.fingerprint
		const fileSystemIdentityMatches = previous?.device && previous.inode
			? candidates.byFileSystemIdentity.get(`${previous.device}\0${previous.inode}`) ?? []
			: []

		if (previous) {
			const exactMatches: SourceCandidate[] = []
			for (const candidate of candidates.bySize.get(previous.size) ?? []) {
				throwIfReadCancelled(signal)
				let fingerprint = candidates.fingerprints.get(candidate.path)
				if (!candidates.fingerprints.has(candidate.path)) {
					fingerprint = await fingerprintSourceFile(candidate.path)
					throwIfReadCancelled(signal)
					candidates.fingerprints.set(candidate.path, fingerprint)
				}
				if (fingerprint?.sha256 === previous.sha256) exactMatches.push(candidate)
			}
			if (exactMatches.length === 1) return exactMatches[0].path
			if (exactMatches.length > 1) return undefined
		}

		const orderedCandidates: SourceCandidate[] = []
		const seenCandidates = new Set<string>()
		const appendCandidates = (items: readonly SourceCandidate[]): void => {
			for (const candidate of items) {
				if (seenCandidates.has(candidate.path)) continue
				seenCandidates.add(candidate.path)
				orderedCandidates.push(candidate)
			}
		}
		appendCandidates(fileSystemIdentityMatches)
		appendCandidates(candidates.byBaseName.get(expectedBaseNameKey) ?? [])
		appendCandidates(candidates.byExtension.get(expectedExtension) ?? [])
		appendCandidates(candidates.all)
		const scored: Array<{ path: string, score: number, anchorMatches: number, baseNameMatches: boolean }> = []
		for (const candidate of orderedCandidates) {
			throwIfReadCancelled(signal)
			const baseNameMatches = candidate.baseNameKey === expectedBaseNameKey
			if (anchors.length > 0 && candidate.stat.size <= 16 * 1024 * 1024) {
				const content = await candidates.readContent(candidate.path)
				throwIfReadCancelled(signal)
				if (content === undefined) continue
				const anchorMatches = anchors.filter(anchor => content.includes(anchor)).length
				if (anchorMatches > 0) {
					const ratioScore = Math.round(anchorMatches / anchors.length * 40)
					const nameScore = baseNameMatches ? 15 : 0
					const extensionScore = expectedExtension !== '' && candidate.extension === expectedExtension ? 5 : 0
					const score = anchorMatches * 20 + ratioScore + nameScore + extensionScore
					scored.push({ path: candidate.path, score, anchorMatches, baseNameMatches })
				}
			}
		}

		scored.sort((a, b) => b.score - a.score)
		if (scored.length === 0) return undefined
		const tied = scored.filter(candidate => candidate.score === scored[0].score)
		const top = tied[0]
		const reliableAnchorMatch = top.anchorMatches >= 2
			|| (anchors.length === 1 && top.anchorMatches === 1 && top.baseNameMatches)
		if (tied.length === 1 && reliableAnchorMatch) return top.path
		return undefined
	}

	private async reconcileMissingEntriesInWorkspace(
		workspaceRoot: string,
		signal?: AbortSignal,
	): Promise<MissingReconciliation> {
		throwIfReadCancelled(signal)
		const missingEntries: ScriptIndexEntry[] = []
		for (const entry of this.scriptIndex.values()) {
			throwIfReadCancelled(signal)
			if (!await this.originalPathIsAvailable(entry)) missingEntries.push(entry)
		}
		if (missingEntries.length === 0) return { ambiguousTargets: new Set() }
		const candidates = await this.sourceCandidates(workspaceRoot, signal)
		const matchesByTarget = new Map<string, Array<{
			entry: ScriptIndexEntry
			data: BookmarkFileEnvelope
			target: string
		}>>()
		for (const entry of missingEntries) {
			throwIfReadCancelled(signal)
			try {
				const data = (await this.readBookmarkFile(entry.filePath)).data
				const fileNode = this.createFileNode(data, entry.metadata.path)
				if (!fileNode) continue
				const target = await this.findRelocatedSource(fileNode, data, candidates, signal)
				if (!target) continue
				if (this.entriesAtAbsolutePath(target).some(existing => existing.id !== entry.id)) continue
				const key = absolutePathKey(target)
				const matches = matchesByTarget.get(key) ?? []
				matches.push({ entry, data, target })
				matchesByTarget.set(key, matches)
			} catch (error) {
				if (isBookmarkReadCancelled(error)) throw error
				logger.error(localize(
					`工作区移动恢复候选检查失败（${entry.filePath}）: ${error}`,
					`Failed to inspect a workspace move-recovery candidate (${entry.filePath}): ${error}`,
				))
			}
		}

		const ambiguousTargets = new Set<string>()
		for (const [targetKey, matches] of matchesByTarget) {
			throwIfReadCancelled(signal)
			if (matches.length > 1) {
				ambiguousTargets.add(targetKey)
				continue
			}
			const match = matches[0]
			try {
				await this.rebindConfiguration(match.entry, match.data, match.target)
			} catch (error) {
				logger.error(localize(`工作区移动恢复失败（${match.target}）: ${error}`, `Workspace move recovery failed (${match.target}): ${error}`))
			}
		}
		return { ambiguousTargets, candidates }
	}

	private updateFileNodePath(fileNode: Bookmark, nextPath: string): void {
		updateBookmarkFileNodePath(fileNode, nextPath)
	}

	private scopeOrderInfo(absolutePath: string): { folder: string, bookmarkPath: string } | undefined {
		const uri = vscode.Uri.file(absolutePath)
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
		if (!workspaceFolder) return undefined
		const folder = fileUtils.getGlobalBookmarkFolder(true, uri)
		if (!folder) return undefined
		return {
			folder,
			bookmarkPath: canonicalBookmarkPath(path.relative(workspaceFolder.uri.fsPath, absolutePath)),
		}
	}

	private async updateOrderForPathChange(
		oldAbsolutePath: string,
		newAbsolutePath: string,
		directory: boolean,
		preferredIndex?: number,
	): Promise<void> {
		const oldInfo = this.scopeOrderInfo(oldAbsolutePath)
		const newInfo = this.scopeOrderInfo(newAbsolutePath)
		if (!oldInfo && !newInfo) return
		if (oldInfo && !newInfo) {
			await this.workspaceOrders.removeTree(oldInfo.folder, oldInfo.bookmarkPath)
			return
		}
		if (!oldInfo && newInfo) {
			await this.workspaceOrders.append(newInfo.folder, newInfo.bookmarkPath)
			return
		}
		const record: ScriptRelocationRecord = {
			...persistenceHeader(PersistenceFormats.scriptRelocation),
			id: 'order-update',
			oldAbsolutePath: normalizedAbsolutePath(oldAbsolutePath),
			newAbsolutePath: normalizedAbsolutePath(newAbsolutePath),
			oldBookmarkFolder: oldInfo!.folder,
			newBookmarkFolder: newInfo!.folder,
			oldBookmarkPath: oldInfo!.bookmarkPath,
			newBookmarkPath: newInfo!.bookmarkPath,
			createdAt: new Date().toISOString(),
		}
		if (directory) await this.workspaceOrders.renameDirectory(record)
		else await this.workspaceOrders.renameFile(record, preferredIndex)
	}

	private async orderIndexForPath(absolutePath: string): Promise<number | undefined> {
		const info = this.scopeOrderInfo(absolutePath)
		if (!info) return undefined
		return this.workspaceOrders.indexOf(info.folder, info.bookmarkPath)
	}

	private async rebindConfiguration(
		entry: ScriptIndexEntry,
		data: BookmarkFileEnvelope,
		newAbsolutePath: string,
		updateOrder = true,
	): Promise<BookmarkFileEnvelope> {
		const oldAbsolutePath = entry.metadata.path
		const normalizedTarget = normalizedAbsolutePath(newAbsolutePath)
		const fileNode = this.createFileNode(data, oldAbsolutePath, true)
		if (!fileNode) throw new Error(localize(
			`脚本书签配置没有有效书签: ${entry.filePath}`,
			`The script bookmark configuration contains no valid bookmarks: ${entry.filePath}`,
		))
		this.updateFileNodePath(fileNode, normalizedTarget)
		const output = await this.envelopeForFileNode(fileNode, vscode.Uri.file(normalizedTarget), normalizedTarget)

		const collisions = this.entriesAtAbsolutePath(normalizedTarget).filter(collision => collision.id !== entry.id)
		for (const collision of collisions) {
			const targetData = (await this.readBookmarkFile(collision.filePath)).data
			output.bookmarks = mergeSerializedBookmarks(output.bookmarks, targetData.bookmarks, normalizedTarget)
		}
		await this.writeEnvelope(entry.filePath, output)
		for (const collision of collisions) {
			await this.archiveSupersededConfig(collision.filePath)
			this.removeIndexEntry(collision.id)
		}
		if (updateOrder) await this.updateOrderForPathChange(oldAbsolutePath, normalizedTarget, false, entry.metadata.orderIndex)
		return output
	}

	private enqueueRelocation<T>(operation: () => Promise<T>): Promise<T> {
		return this.relocationQueue.run(operation)
	}

	private async recoverPendingRelocations(storageRoot: string, signal?: AbortSignal): Promise<void> {
		throwIfReadCancelled(signal)
		await this.enqueueRelocation(() => recoverScriptRelocations(storageRoot, {
			checkCancelled: () => throwIfReadCancelled(signal),
			pathExists,
			perform: record => this.performFileRename(record, storageRoot),
			reportFailure: (record, error) => {
				logger.error(localize(
					`恢复未完成的脚本转移失败（${record.oldAbsolutePath}）: ${error}`,
					`Failed to recover an unfinished script transfer (${record.oldAbsolutePath}): ${error}`,
				))
			},
		}))
	}

	private async resolveActiveFileRelocation(
		storageRoot: string,
		activeAbsolutePath: string,
		signal?: AbortSignal,
	): Promise<void> {
		throwIfReadCancelled(signal)
		if (this.entriesAtAbsolutePath(activeAbsolutePath).length > 0) return
		const activeCandidate = await this.sourceCandidateIndex([activeAbsolutePath], signal)
		if (activeCandidate.all.length === 0) return
		const matches: Array<{ entry: ScriptIndexEntry, data: BookmarkFileEnvelope }> = []
		for (const entry of this.scriptIndex.values()) {
			throwIfReadCancelled(signal)
			// missingSince 只是墓碑，不代表永久退出重定位。外部移动可能表现为“删除＋创建”，
			// 因此墓碑配置仍须参与针对活动文件的指纹、inode 与内容匹配。
			if (await this.originalPathIsAvailable(entry)) continue
			throwIfReadCancelled(signal)
			try {
				const data = (await this.readBookmarkFile(entry.filePath)).data
				throwIfReadCancelled(signal)
				const fileNode = this.createFileNode(data, entry.metadata.path)
				if (!fileNode) continue
				if (await this.findRelocatedSource(fileNode, data, activeCandidate, signal)) {
					matches.push({ entry, data })
				}
			} catch (error) {
				if (isBookmarkReadCancelled(error)) throw error
				logger.error(localize(
					`检查跨模式脚本绑定失败（${entry.filePath}）: ${error}`,
					`Failed to inspect a script binding across storage modes (${entry.filePath}): ${error}`,
				))
			}
		}
		if (matches.length === 0) return
		const selected = matches[0]
		if (matches.length > 1) {
			void vscode.window.showWarningMessage(localize(
				`发现 ${matches.length} 个可能对应“${path.basename(activeAbsolutePath)}”的书签配置；为避免错误绑定，已暂缓自动恢复。`,
				`Found ${matches.length} bookmark configurations that may belong to "${path.basename(activeAbsolutePath)}". Automatic recovery was deferred to avoid an incorrect binding.`,
			))
			return
		}
		throwIfReadCancelled(signal)
		const workspaceRelocation = await this.tryRelocateWorkspaceRoot(
			storageRoot,
			selected.entry,
			activeAbsolutePath,
			signal,
		)
		if (workspaceRelocation) {
			throwIfReadCancelled(signal)
			vscode.window.showInformationMessage(localize(
				`已自动恢复改名工作区内 ${workspaceRelocation.scriptCount} 个脚本的书签绑定；恢复结果：${formatBookmarkLevelSummary(workspaceRelocation.bookmarkSummary)}。当前脚本：${path.basename(activeAbsolutePath)}。`,
				`Automatically restored bookmark bindings for ${workspaceRelocation.scriptCount} scripts in the renamed workspace. Restored: ${formatBookmarkLevelSummary(workspaceRelocation.bookmarkSummary)}. Current script: ${path.basename(activeAbsolutePath)}.`,
			))
			return
		}
		const standaloneRelocated = await this.tryRelocateStandaloneDirectory(
			selected.entry,
			activeAbsolutePath,
			signal,
		)
		if (standaloneRelocated) {
			throwIfReadCancelled(signal)
			vscode.window.showInformationMessage(localize(
				`已自动恢复移动目录内 ${standaloneRelocated.scriptCount} 个脚本的书签绑定；恢复结果：${formatBookmarkLevelSummary(standaloneRelocated.bookmarkSummary)}。`,
				`Automatically restored bookmark bindings for ${standaloneRelocated.scriptCount} scripts in the moved folder. Restored: ${formatBookmarkLevelSummary(standaloneRelocated.bookmarkSummary)}.`,
			))
			return
		}
		await this.enqueueRelocation(() => {
			throwIfReadCancelled(signal)
			return this.rebindConfiguration(selected.entry, selected.data, activeAbsolutePath)
		})
		throwIfReadCancelled(signal)
		const fileNode = this.createFileNode(selected.data, activeAbsolutePath)
		const summary = summarizeBookmarkTrees(fileNode?.subs ?? [])
		vscode.window.showInformationMessage(localize(
			`已自动恢复脚本书签绑定：${path.basename(activeAbsolutePath)}；恢复结果：${formatBookmarkLevelSummary(summary)}。`,
			`Automatically restored the script bookmark binding for ${path.basename(activeAbsolutePath)}. Restored: ${formatBookmarkLevelSummary(summary)}.`,
		))
		await this.ensureIndex(storageRoot, signal)
	}

	private async tryRelocateStandaloneDirectory(
		matchedEntry: ScriptIndexEntry,
		activeAbsolutePath: string,
		signal?: AbortSignal,
	): Promise<RelocatedBookmarkSummary | undefined> {
		throwIfReadCancelled(signal)
		if (vscode.workspace.getWorkspaceFolder(vscode.Uri.file(activeAbsolutePath))) return undefined
		const oldRoot = path.dirname(matchedEntry.metadata.path)
		const newRoot = path.dirname(activeAbsolutePath)
		if (absolutePathKey(oldRoot) === absolutePathKey(newRoot) || await pathExists(oldRoot)) return undefined

		const mapped: Array<{
			entry: ScriptIndexEntry
			data: BookmarkFileEnvelope
			target: string
		}> = []
		for (const entry of this.scriptIndex.values()) {
			throwIfReadCancelled(signal)
			if (!isSameOrDescendantAbsolutePath(entry.metadata.path, oldRoot)
				|| await this.originalPathIsAvailable(entry)) continue
			const relative = path.relative(oldRoot, entry.metadata.path)
			if (relative.startsWith('..') || path.isAbsolute(relative)) continue
			const target = normalizedAbsolutePath(path.join(newRoot, relative))
			if (this.entriesAtAbsolutePath(target).some(existing => existing.id !== entry.id)) continue
			try {
				const data = (await this.readBookmarkFile(entry.filePath)).data
				const fileNode = this.createFileNode(data, entry.metadata.path)
				if (!fileNode) continue
				const candidate = await this.sourceCandidateIndex([target], signal)
				const relocated = await this.findRelocatedSource(fileNode, data, candidate, signal)
				if (relocated && absolutePathKey(relocated) === absolutePathKey(target)) {
					mapped.push({ entry, data, target })
				}
			} catch (error) {
				if (isBookmarkReadCancelled(error)) throw error
				logger.error(localize(
					`检查独立目录移动恢复失败（${entry.metadata.path}）: ${error}`,
					`Failed to inspect standalone-folder move recovery (${entry.metadata.path}): ${error}`,
				))
			}
		}
		if (!mapped.some(item => item.entry.id === matchedEntry.id)) return undefined
		const bookmarkSummary = mergeBookmarkLevelSummaries(...mapped.map(item => {
			const fileNode = this.createFileNode(item.data, item.entry.metadata.path)
			return summarizeBookmarkTrees(fileNode?.subs ?? [])
		}))
		await this.enqueueRelocation(async () => {
			for (const item of mapped) await this.rebindConfiguration(item.entry, item.data, item.target)
		})
		return { scriptCount: mapped.length, bookmarkSummary }
	}

	private async tryRelocateWorkspaceRoot(
		storageRoot: string,
		matchedEntry: ScriptIndexEntry,
		activeAbsolutePath: string,
		signal?: AbortSignal,
	): Promise<RelocatedBookmarkSummary | undefined> {
		throwIfReadCancelled(signal)
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(activeAbsolutePath))
		if (!workspaceFolder) return undefined
		const newRoot = normalizedAbsolutePath(workspaceFolder.uri.fsPath)
		const relativePath = path.relative(newRoot, activeAbsolutePath)
		if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return undefined
		const segments = relativePath.split(path.sep).filter(Boolean)
		let oldRoot = normalizedAbsolutePath(matchedEntry.metadata.path)
		for (let index = 0; index < segments.length; index++) oldRoot = path.dirname(oldRoot)
		if (absolutePathKey(path.resolve(oldRoot, relativePath)) !== absolutePathKey(matchedEntry.metadata.path)
			|| absolutePathKey(oldRoot) === absolutePathKey(newRoot)
			|| await pathExists(oldRoot)) return undefined
		throwIfReadCancelled(signal)
		const affected = this.scriptIndex.values().filter(entry =>
			isSameOrDescendantAbsolutePath(entry.metadata.path, oldRoot))
		if (affected.length === 0) return undefined
		const oldScope = fileUtils.getWorkspaceBookmarkFolder(oldRoot, storageRoot)
		const newScope = fileUtils.getWorkspaceBookmarkFolder(newRoot, storageRoot)
		if (!oldScope || !newScope) return undefined
		const summaries: BookmarkLevelSummary[] = []
		for (const entry of affected) {
			throwIfReadCancelled(signal)
			const data = (await this.readBookmarkFile(entry.filePath)).data
			const fileNode = this.createFileNode(data, entry.metadata.path)
			summaries.push(summarizeBookmarkTrees(fileNode?.subs ?? []))
		}

		await this.enqueueRelocation(async () => {
			throwIfReadCancelled(signal)
			await executeScriptRelocation(storageRoot, {
				oldAbsolutePath: oldRoot,
				newAbsolutePath: newRoot,
				oldBookmarkFolder: oldScope,
				newBookmarkFolder: newScope,
				oldBookmarkPath: '',
				newBookmarkPath: '',
			}, record => this.performFileRename(record, storageRoot))
		})
		return {
			scriptCount: affected.length,
			bookmarkSummary: mergeBookmarkLevelSummaries(...summaries),
		}
	}

	async readBookmarksFromFile(
		activePaths: string[] = [],
		configFileNames?: readonly string[],
		signal?: AbortSignal,
	): Promise<Bookmark[]> {
		try {
			throwIfReadCancelled(signal)
			const storageRoot = this.storageRoot()
			if (!storageRoot) return []
			await this.recoverPendingRelocations(storageRoot, signal)
			if (configFileNames) await this.refreshIndexFiles(storageRoot, configFileNames, signal)
			else await this.ensureIndex(storageRoot, signal)

			const activeAbsolutePath = activePaths[0] ? normalizedAbsolutePath(activePaths[0]) : undefined
			const activeUri = activeAbsolutePath ? vscode.Uri.file(activeAbsolutePath) : undefined
			const workspaceFolder = activeUri
				? vscode.workspace.getWorkspaceFolder(activeUri)
				: vscode.workspace.workspaceFolders?.[0]
			// 工作区根目录移动携带所有子项的顺序信息，必须先解析这项聚合操作，
			// 再执行逐文件指纹恢复；否则目录扫描可能按任意顺序追加文件并破坏已保存顺序。
			if (activeAbsolutePath) await this.resolveActiveFileRelocation(storageRoot, activeAbsolutePath, signal)
			let ambiguousRelocationTargets = new Set<string>()
			let workspaceCandidates: SourceCandidateIndex | undefined
			if (!configFileNames && workspaceFolder) {
				const reconciliation = await this.reconcileMissingEntriesInWorkspace(workspaceFolder.uri.fsPath, signal)
				ambiguousRelocationTargets = reconciliation.ambiguousTargets
				workspaceCandidates = reconciliation.candidates
			}
			throwIfReadCancelled(signal)
			const requestedIds = configFileNames
				? new Set(configFileNames.map(name => path.basename(name, path.extname(name))).filter(isScriptId))
				: undefined
			const bookmarks: Bookmark[] = []

			for (const entry of this.scriptIndex.values()) {
				throwIfReadCancelled(signal)
				if (requestedIds && !requestedIds.has(entry.id)) continue
				if (workspaceFolder) {
					if (!isSameOrDescendantAbsolutePath(entry.metadata.path, workspaceFolder.uri.fsPath)) continue
				} else if (!activeAbsolutePath || absolutePathKey(entry.metadata.path) !== absolutePathKey(activeAbsolutePath)) {
					continue
				}

				try {
					let data = (await this.readBookmarkFile(entry.filePath)).data
					throwIfReadCancelled(signal)
					let currentEntry = entry
					let tombstonePathMismatch = false
					let relocatedPath: string | undefined
					let relocationApplied = false
					if (entry.metadata.missingSince !== undefined && await pathExists(entry.metadata.path)) {
						const currentFingerprint = await fingerprintSourceFile(entry.metadata.path)
						throwIfReadCancelled(signal)
						if (!entry.metadata.fingerprint || currentFingerprint?.sha256 !== entry.metadata.fingerprint.sha256) {
							tombstonePathMismatch = true
						} else {
							data = await this.enqueueRelocation(() => {
								throwIfReadCancelled(signal)
								return this.rebindConfiguration(entry, data, entry.metadata.path)
							})
							throwIfReadCancelled(signal)
							currentEntry = this.scriptIndex.get(entry.id) ?? entry
							relocationApplied = true
						}
					}
					if ((!await this.originalPathIsAvailable(entry) || tombstonePathMismatch) && workspaceFolder) {
						if (ambiguousRelocationTargets.size > 0) {
							const storageNode = this.createFileNode(data, entry.metadata.path)
							const candidates = workspaceCandidates ?? await this.sourceCandidates(workspaceFolder.uri.fsPath, signal)
							const possible = storageNode
								? await this.findRelocatedSource(storageNode, data, candidates, signal)
								: undefined
							if (possible && ambiguousRelocationTargets.has(absolutePathKey(possible))) continue
						}
						throwIfReadCancelled(signal)
						workspaceCandidates ??= await this.sourceCandidates(workspaceFolder.uri.fsPath, signal)
						const storageNode = this.createFileNode(data, entry.metadata.path)
						relocatedPath = storageNode
							? await this.findRelocatedSource(storageNode, data, workspaceCandidates, signal)
							: undefined
						if (relocatedPath && !this.entriesAtAbsolutePath(relocatedPath).some(existing => existing.id !== entry.id)) {
							data = await this.enqueueRelocation(() => {
								throwIfReadCancelled(signal)
								return this.rebindConfiguration(entry, data, relocatedPath!)
							})
							throwIfReadCancelled(signal)
							currentEntry = this.scriptIndex.get(entry.id) ?? entry
							relocationApplied = true
						}
					}
					if (relocatedPath && this.entriesAtAbsolutePath(relocatedPath).some(existing => existing.id !== entry.id)) continue
					if (tombstonePathMismatch && !relocationApplied) continue
					const display = this.displayPath(currentEntry.metadata.path, activeUri ?? workspaceFolder?.uri)
					const fileNode = this.createFileNode(data, display)
					if (fileNode) {
						bookmarks.push(fileNode)
						if (relocatedPath && relocationApplied) {
							const summary = summarizeBookmarkTrees(fileNode.subs)
							vscode.window.showInformationMessage(localize(
								`已自动重连脚本书签：${path.basename(relocatedPath)}；恢复结果：${formatBookmarkLevelSummary(summary)}。`,
								`Automatically reconnected script bookmarks for ${path.basename(relocatedPath)}. Restored: ${formatBookmarkLevelSummary(summary)}.`,
							))
						}
					}
				} catch (error) {
					if (isBookmarkReadCancelled(error)) throw error
					logger.error(localize(
						`已跳过无法读取的脚本书签配置（${entry.filePath}）: ${error}`,
						`Skipped an unreadable script bookmark configuration (${entry.filePath}): ${error}`,
					))
				}
			}
			return bookmarks
		} catch (error) {
			if (isBookmarkReadCancelled(error)) {
				// 被取消的增量刷新可能只改动共享索引的一部分；强制下一次有效请求完整重建，
				// 避免调用方读到半更新快照。
				this.indexReady = false
				return []
			}
			logger.error(localize('无法读取书签配置文件', 'Unable to read the bookmark configuration file.'))
			logger.error(error)
			return []
		}
	}

	async saveBookmarksToFile(
		bookmarks: BookmarkSet,
		activePaths: string[] = [],
		storageRootOverride?: string,
		dirtyPaths?: readonly string[],
	): Promise<boolean> {
		return this.enqueueRelocation(() => this.saveBookmarksSnapshot(bookmarks, activePaths, storageRootOverride, dirtyPaths))
	}

	async deleteBookmarkConfigurationFiles(
		requests: readonly BookmarkConfigurationDeleteRequest[],
	): Promise<BookmarkConfigurationDeletionResult> {
		return this.enqueueRelocation(async () => {
			const storageRoot = this.storageRoot()
			if (!storageRoot) throw new Error(localize('尚未配置书签存储目录', 'The bookmark storage folder is not configured.'))
			const result = await removeBookmarkConfigurationFiles(storageRoot, requests, {
				deleteFile: filePath => this.deleteFile(filePath),
				deleteEmptyDirectory: directoryPath => fs.promises.rmdir(directoryPath),
			})
			for (const entry of result.deletedEntries) {
				if (entry.role !== 'primary' || !entry.scriptId) continue
				this.removeIndexEntry(entry.scriptId)
				if (entry.scriptPath) {
					try {
						await this.removeOrderPath(entry.scriptPath)
					} catch (error) {
						logger.error(localize(
							`删除书签配置后清理工作区顺序失败（${entry.scriptPath}）: ${error}`,
							`Failed to clean the workspace order after deleting a bookmark configuration (${entry.scriptPath}): ${error}`,
						))
					}
				}
			}
			if (result.deletedFiles > 0) this.indexReady = false
			return result
		})
	}

	private async saveBookmarksSnapshot(
		bookmarks: BookmarkSet,
		activePaths: string[],
		storageRootOverride?: string,
		dirtyPaths?: readonly string[],
	): Promise<boolean> {
		try {
			const storageRoot = this.storageRoot(storageRootOverride)
			if (!storageRoot) return false
			await this.ensureIndex(storageRoot)
			const scriptFolder = this.scriptFolder(storageRoot)
			const scopeUri = activePaths[0] ? vscode.Uri.file(activePaths[0]) : undefined
			const workspaceFolder = scopeUri ? vscode.workspace.getWorkspaceFolder(scopeUri) : undefined
			const activeAbsoluteKeys = new Set(activePaths.map(absolutePathKey))
			const dirtyAbsolutePaths = dirtyPaths?.map(normalizedAbsolutePath)
			const isDirty = (absolutePath: string): boolean => !dirtyAbsolutePaths
				|| dirtyAbsolutePaths.some(dirty => isSameOrDescendantAbsolutePath(absolutePath, dirty)
					|| isSameOrDescendantAbsolutePath(dirty, absolutePath))
			const inScope = (absolutePath: string): boolean => workspaceFolder
				? isSameOrDescendantAbsolutePath(absolutePath, workspaceFolder.uri.fsPath)
				: activeAbsoluteKeys.size === 0 || activeAbsoluteKeys.has(absolutePathKey(absolutePath))

			const desiredIds = new Set<string>()
			for (const fileNode of bookmarks.values.filter(node => node.contextValue === ContextBookmark.File)) {
				const absolutePath = this.absolutePathForFileNode(fileNode, scopeUri)
				if (!inScope(absolutePath) || !isDirty(absolutePath) || fileNode.subs.size === 0) continue
				if (fileNode.scriptId) {
					const persistedPath = this.scriptIndex.get(fileNode.scriptId)?.metadata.path
					if (persistedPath && absolutePathKey(persistedPath) !== absolutePathKey(absolutePath)) {
						// 文件系统重定位可能在此排队内存快照落盘前已更新仓库。
						// 此时以仓库绑定为准，不能让延迟保存复活旧路径。
						desiredIds.add(fileNode.scriptId)
						continue
					}
				}
				const data = await this.envelopeForFileNode(fileNode, scopeUri, absolutePath)
				const filePath = path.join(scriptFolder, `${data.script.id}.json`)
				await this.writeEnvelope(filePath, data)
				desiredIds.add(data.script.id)
			}

			const removable = this.scriptIndex.values().filter(entry => inScope(entry.metadata.path)
				&& isDirty(entry.metadata.path) && !desiredIds.has(entry.id))
			for (const entry of removable) {
				if (await pathExists(entry.filePath)) await this.deleteFile(entry.filePath)
				this.removeIndexEntry(entry.id)
				await this.removeOrderPath(entry.metadata.path)
			}
			return true
		} catch (error) {
			logger.error(localize('无法将书签保存到文件', "Can't save bookmarks to file"))
			logger.error(error)
			return false
		}
	}

	private scopeFolderForPath(absolutePath: string, storageRoot: string): string {
		const uri = vscode.Uri.file(absolutePath)
		return vscode.workspace.getWorkspaceFolder(uri)
			? fileUtils.getGlobalBookmarkFolder(true, uri, storageRoot) ?? storageRoot
			: storageRoot
	}

	async handleFileRename(oldAbsolutePath: string, newAbsolutePath: string): Promise<void> {
		const storageRoot = this.storageRoot()
		if (!storageRoot) return
		const oldFolder = this.scopeFolderForPath(oldAbsolutePath, storageRoot)
		const newFolder = this.scopeFolderForPath(newAbsolutePath, storageRoot)
		const oldInfo = this.scopeOrderInfo(oldAbsolutePath)
		const newInfo = this.scopeOrderInfo(newAbsolutePath)
		await this.enqueueRelocation(async () => {
			await executeScriptRelocation(storageRoot, {
				oldAbsolutePath,
				newAbsolutePath,
				oldBookmarkFolder: oldFolder,
				newBookmarkFolder: newFolder,
				oldBookmarkPath: oldInfo?.bookmarkPath ?? canonicalBookmarkPath(normalizedAbsolutePath(oldAbsolutePath)),
				newBookmarkPath: newInfo?.bookmarkPath ?? canonicalBookmarkPath(normalizedAbsolutePath(newAbsolutePath)),
			}, record => this.performFileRename(record, storageRoot))
		})
	}

	private async performFileRename(record: ScriptRelocationRecord, storageRoot: string): Promise<void> {
		await this.rebuildIndex(storageRoot)
		let destinationIsDirectory: boolean
		try {
			destinationIsDirectory = (await fs.promises.stat(record.newAbsolutePath)).isDirectory()
		} catch {
			destinationIsDirectory = inferDirectoryRelocation(this.scriptIndex.values(), record.oldAbsolutePath)
		}
		const moved = planScriptRelocation(
			this.scriptIndex.values(),
			record.oldAbsolutePath,
			record.newAbsolutePath,
			destinationIsDirectory,
		)
		const updateEachOrder = false
		for (const { entry, targetPath } of moved) {
			const data = (await this.readBookmarkFile(entry.filePath)).data
			await this.rebindConfiguration(entry, data, targetPath, updateEachOrder)
		}
		if (!destinationIsDirectory) await this.reconcileDuplicatePath(record.newAbsolutePath)
		if (destinationIsDirectory) {
			if (!updateEachOrder) await this.workspaceOrders.renameDirectory(record)
		} else {
			await this.workspaceOrders.renameFile(record)
		}
		if (!this.pathsReferToSameFile(record.oldBookmarkFolder, record.newBookmarkFolder)
			&& await pathExists(record.oldBookmarkFolder)
			&& (await fs.promises.readdir(record.oldBookmarkFolder)).length === 0) {
			await fs.promises.rmdir(record.oldBookmarkFolder)
		}
	}

	private async removeOrderPath(absolutePath: string): Promise<void> {
		const info = this.scopeOrderInfo(absolutePath)
		if (!info) return
		await this.workspaceOrders.removeTree(info.folder, info.bookmarkPath)
	}

	/**
	 * 对刚出现在磁盘上的源路径执行对账。文件系统提供器允许把移动报告成
	 * “删除＋创建”，甚至只报告创建，因此此流程不能依赖 onDidRenameFiles。
	 */
	async handleFileAppearance(absolutePath: string): Promise<ScriptRelocationChange[]> {
		return this.enqueueRelocation(() => this.performFileAppearance(absolutePath))
	}

	async handleFileAppearances(absolutePaths: readonly string[]): Promise<ScriptRelocationChange[]> {
		return this.enqueueRelocation(async () => {
			const changes: ScriptRelocationChange[] = []
			const paths = [...new Set(absolutePaths.map(normalizedAbsolutePath))]
				.sort((left, right) => left.length - right.length || left.localeCompare(right))
			for (const sourcePath of paths) {
				try {
					changes.push(...await this.performFileAppearance(sourcePath))
				} catch (error) {
					logger.error(localize(
						`批量恢复书签绑定失败（${sourcePath}）: ${error}`,
						`Batch bookmark-binding recovery failed (${sourcePath}): ${error}`,
					))
				}
			}
			return changes
		})
	}

	private async performFileAppearance(absolutePath: string): Promise<ScriptRelocationChange[]> {
		const storageRoot = this.storageRoot()
		if (!storageRoot) return []
		const targetPath = normalizedAbsolutePath(absolutePath)
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(targetPath))
		if (workspaceFolder) {
			const relativePath = path.relative(workspaceFolder.uri.fsPath, targetPath)
			if (isExcludedSourceRelativePath(relativePath)) return []
		}
		let stat: fs.Stats
		try {
			stat = await fs.promises.stat(targetPath)
		} catch {
			return []
		}
		await this.ensureIndex(storageRoot)
		if (stat.isDirectory()) {
			const previousPaths = new Map(this.scriptIndex.values().map(entry => [entry.id, entry.metadata.path]))
			await this.reconcileMissingEntriesInWorkspace(targetPath)
			return this.scriptIndex.values().flatMap(entry => {
				const oldAbsolutePath = previousPaths.get(entry.id)
				if (!oldAbsolutePath || absolutePathKey(oldAbsolutePath) === absolutePathKey(entry.metadata.path)
					|| !isSameOrDescendantAbsolutePath(entry.metadata.path, targetPath)) return []
				return [{ oldAbsolutePath, newAbsolutePath: entry.metadata.path, scriptId: entry.id }]
			})
		}
		if (!stat.isFile()) return []

		// 已绑定文件发生变化是常见路径；只有目标确实未绑定时才扫描全部存储配置。
		if (this.entriesAtAbsolutePath(targetPath).length > 0) return []
		const fingerprint = await fingerprintSourceFile(targetPath)
		if (!fingerprint) return []
		const candidateIndex = await this.sourceCandidateIndex([targetPath])
		candidateIndex.fingerprints.set(targetPath, fingerprint)
		const exactEntries = [] as ScriptIndexEntry[]
		for (const entry of this.entriesWithFingerprint(fingerprint)) {
			if (!await this.originalPathIsAvailable(entry)) exactEntries.push(entry)
		}
		if (exactEntries.length > 1) return []
		if (exactEntries.length === 1) {
			const entry = exactEntries[0]
			if (this.entriesAtAbsolutePath(targetPath).some(existing => existing.id !== entry.id)) return []
			const data = (await this.readBookmarkFile(entry.filePath)).data
			const oldAbsolutePath = entry.metadata.path
			await this.rebindConfiguration(entry, data, targetPath)
			return [{ oldAbsolutePath, newAbsolutePath: targetPath, scriptId: entry.id }]
		}
		const matches: Array<{ entry: ScriptIndexEntry, data: BookmarkFileEnvelope }> = []
		for (const entry of this.scriptIndex.values()) {
			if (absolutePathKey(entry.metadata.path) === absolutePathKey(targetPath)
				|| await this.originalPathIsAvailable(entry)) continue
			try {
				const data = (await this.readBookmarkFile(entry.filePath)).data
				const fileNode = this.createFileNode(data, entry.metadata.path)
				if (!fileNode) continue
				const relocated = await this.findRelocatedSource(
					fileNode,
					data,
					candidateIndex,
				)
				if (!relocated || absolutePathKey(relocated) !== absolutePathKey(targetPath)) continue
				matches.push({ entry, data })
			} catch (error) {
				logger.error(localize(
					`新文件出现时恢复书签绑定失败（${targetPath}）: ${error}`,
					`Failed to recover a bookmark binding when a new file appeared (${targetPath}): ${error}`,
				))
			}
		}
		if (matches.length !== 1) return []
		const match = matches[0]
		if (this.entriesAtAbsolutePath(targetPath).some(entry => entry.id !== match.entry.id)) return []
		await this.rebindConfiguration(match.entry, match.data, targetPath)
		return [{ oldAbsolutePath: match.entry.metadata.path, newAbsolutePath: targetPath, scriptId: match.entry.id }]
	}

	async handleFileDelete(absolutePath: string): Promise<void> {
		await this.enqueueRelocation(() => this.performFileDelete(absolutePath))
	}

	private async performFileDelete(absolutePath: string): Promise<void> {
		const storageRoot = this.storageRoot()
		if (!storageRoot) return
		await this.rebuildIndex(storageRoot)
		const affected = this.scriptIndex.values().filter(entry =>
			isSameOrDescendantAbsolutePath(entry.metadata.path, absolutePath))
		const orderIndices = new Map<string, number | undefined>(await Promise.all(affected.map(async entry =>
			[entry.id, await this.orderIndexForPath(entry.metadata.path)] as const)))
		for (const entry of affected) {
			const data = (await this.readBookmarkFile(entry.filePath)).data
			data.script.missingSince = Date.now()
			data.script.lastSeenAt = Date.now()
			data.script.orderIndex = orderIndices.get(entry.id) ?? data.script.orderIndex
			await this.writeEnvelope(entry.filePath, data)
		}
		await this.removeOrderPath(absolutePath)
	}

	async importBookmarkConfiguration(configPath: string, targetAbsolutePath: string): Promise<Bookmark> {
		return this.enqueueRelocation(() => this.performBookmarkConfigurationImport(configPath, targetAbsolutePath))
	}

	async importBookmarkConfigurationsFromFolder(
		configFolderPath: string,
		workspaceRootPath: string,
	): Promise<BookmarkConfigurationFolderImportResult> {
		return this.enqueueRelocation(() => this.performBookmarkConfigurationFolderImport(configFolderPath, workspaceRootPath))
	}

	private async performBookmarkConfigurationFolderImport(
		configFolderPath: string,
		workspaceRootPath: string,
	): Promise<BookmarkConfigurationFolderImportResult> {
		const storageRoot = this.storageRoot()
		if (!storageRoot) throw new Error(localize('尚未配置书签存储目录', 'The bookmark storage folder is not configured.'))
		await this.ensureIndex(storageRoot)
		const candidates = await collectBookmarkConfigurationImportCandidates(configFolderPath, workspaceRootPath)
		const result: BookmarkConfigurationFolderImportResult = {
			total: candidates.length,
			imported: 0,
			skipped: 0,
			failed: 0,
			cancelled: false,
			bookmarkSummary: { total: 0, levelCounts: [] },
		}
		const valid: BookmarkConfigurationImportCandidate[] = []
		let fingerprintMismatches = 0
		for (const candidate of candidates) {
			try {
				const { data: importedValue } = decodeScriptConfiguration(await fileUtils.readJsonFileAsync(candidate.configPath))
				const importedMetadata = scriptMetadata(importedValue)
				const importedItems = bookmarkItems(importedValue)
				const targetFingerprint = await fingerprintSourceFile(candidate.targetAbsolutePath)
				if (!importedMetadata || !importedItems || importedItems.length === 0 || !targetFingerprint) {
					result.skipped++
					continue
				}
				if (importedMetadata.fingerprint && importedMetadata.fingerprint.sha256 !== targetFingerprint.sha256) fingerprintMismatches++
				valid.push(candidate)
			} catch (error) {
				result.skipped++
				logger.error(localize(
					`检查书签配置导入候选失败（${candidate.configPath}）: ${error}`,
					`Failed to inspect a bookmark configuration import candidate (${candidate.configPath}): ${error}`,
				))
			}
		}
		if (fingerprintMismatches > 0) {
			const actions = [
				{ title: localize('仍然导入并绑定', 'Import and Bind Anyway'), action: 'continue' as const },
				{ title: localize('取消', 'Cancel'), action: 'cancel' as const },
			]
			const choice = await vscode.window.showWarningMessage(
				localize(
					`有 ${fingerprintMismatches} 个配置的源码指纹与当前工作区文件不同。继续会按当前文件内容重新绑定。`,
					`${fingerprintMismatches} configurations have source fingerprints that differ from the current workspace files. Continuing will rebind them using the current file contents.`,
				),
				{ modal: true },
				...actions,
			)
			if (choice?.action !== 'continue') {
				result.cancelled = true
				return result
			}
		}
		for (const candidate of valid) {
			try {
				const importedFileNode = await this.performBookmarkConfigurationImport(
					candidate.configPath,
					candidate.targetAbsolutePath,
					fingerprintMismatches > 0,
				)
				result.bookmarkSummary = mergeBookmarkLevelSummaries(
					result.bookmarkSummary,
					summarizeBookmarkTrees(importedFileNode.subs),
				)
				result.imported++
			} catch (error) {
				result.failed++
				logger.error(localize(
					`导入书签配置失败（${candidate.configPath} -> ${candidate.targetAbsolutePath}）: ${error}`,
					`Failed to import a bookmark configuration (${candidate.configPath} -> ${candidate.targetAbsolutePath}): ${error}`,
				))
			}
		}
		return result
	}

	private async performBookmarkConfigurationImport(
		configPath: string,
		targetAbsolutePath: string,
		fingerprintMismatchConfirmed = false,
	): Promise<Bookmark> {
		const storageRoot = this.storageRoot()
		if (!storageRoot) throw new Error(localize('尚未配置书签存储目录', 'The bookmark storage folder is not configured.'))
		await this.ensureIndex(storageRoot)
		const targetPath = normalizedAbsolutePath(targetAbsolutePath)
		const { data: importedValue } = decodeScriptConfiguration(await fileUtils.readJsonFileAsync(configPath))
		const importedMetadata = scriptMetadata(importedValue)
		const importedItems = bookmarkItems(importedValue)
		if (!importedMetadata || !importedItems || importedItems.length === 0) {
			throw new Error(localize('所选文件不是有效的书签配置', 'The selected file is not a valid bookmark configuration.'))
		}
		this.createFileNode(importedValue, importedMetadata.path, true)
		const targetFingerprint = await fingerprintSourceFile(targetPath)
		if (!targetFingerprint) throw new Error(localize('无法读取当前脚本内容', 'Unable to read the current script content.'))
		if (!fingerprintMismatchConfirmed && importedMetadata.fingerprint && importedMetadata.fingerprint.sha256 !== targetFingerprint.sha256) {
			const actions = [
				{ title: localize('仍然导入并绑定', 'Import and Bind Anyway'), action: 'continue' as const },
				{ title: localize('取消', 'Cancel'), action: 'cancel' as const },
			]
			const choice = await vscode.window.showWarningMessage(
				localize(
					'所选配置的源码指纹与当前脚本不同。继续会把其中的书签重新绑定到当前脚本。',
					'The selected configuration has a different source fingerprint from the current script. Continuing will rebind its bookmarks to the current script.',
				),
				{ modal: true },
				...actions,
			)
			if (choice?.action !== 'continue') {
				throw new UserCancelledError('用户取消了书签配置导入', 'The user cancelled the bookmark configuration import.')
			}
		}

		let existingTarget: ScriptIndexEntry | undefined = this.entriesAtAbsolutePath(targetPath)[0]
		if (existingTarget?.metadata.missingSince !== undefined
			&& existingTarget.metadata.fingerprint?.sha256 !== targetFingerprint.sha256) {
			await this.archiveSupersededConfig(existingTarget.filePath)
			this.removeIndexEntry(existingTarget.id)
			existingTarget = undefined
		}
		let targetId = importedMetadata.id
		let bookmarks = importedItems.map(item => structuredClone(item))
		if (existingTarget) {
			const existingData = (await this.readBookmarkFile(existingTarget.filePath)).data
			targetId = existingTarget.id
			bookmarks = mergeSerializedBookmarks(existingData.bookmarks, bookmarks, targetPath)
		} else if (this.scriptIndex.has(targetId)) {
			targetId = createScriptId()
			bookmarks.forEach(rewriteSerializedBookmarkIds)
		}
		setSerializedBookmarkPaths(bookmarks, targetPath)
		const output = createScriptEnvelope({
				id: targetId,
				path: targetPath,
				fingerprint: targetFingerprint,
				lastSeenAt: Date.now(),
			}, bookmarks)
		const display = this.displayPath(targetPath, vscode.Uri.file(targetPath))
		let fileNode = this.createFileNode(output, display, true)
		if (!fileNode) throw new Error(localize('导入结果没有有效书签', 'The import result contains no valid bookmarks.'))
		if (typeof vscode.workspace.openTextDocument === 'function') {
			const targetDocument = vscode.workspace.textDocuments.find(document => document.uri.scheme === 'file'
				&& absolutePathKey(document.uri.fsPath) === absolutePathKey(targetPath))
				?? await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath))
			await fileUtils.readContentBookmarksInDocument(
				new BookmarkSet([fileNode]),
				targetDocument,
				fileNode.path,
				vscode.Uri.file(targetPath),
			)
			bookmarks = fileNode.subs.values.map(bookmark => bookmark.toJSON())
			setSerializedBookmarkPaths(bookmarks, targetPath)
			output.bookmarks = bookmarks
		}
		const scriptFolder = this.scriptFolder(storageRoot)
		const outputPath = path.join(scriptFolder, `${targetId}.json`)
		await this.writeEnvelope(outputPath, output)
		const orderInfo = this.scopeOrderInfo(targetPath)
		if (orderInfo) {
			await this.workspaceOrders.append(
				orderInfo.folder,
				orderInfo.bookmarkPath,
				localize('无法更新工作区书签顺序', 'Unable to update the workspace bookmark order.'),
			)
		}
		fileNode = this.createFileNode(output, display, true)
		if (!fileNode) throw new Error(localize('导入结果没有有效书签', 'The import result contains no valid bookmarks.'))
		return fileNode
	}
}

export const bookmarkRepository = new CodeBookmarksRepository()
