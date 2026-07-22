import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
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
import { isExcludedSourceRelativePath, SOURCE_SCAN_EXCLUDED_DIRECTORIES } from '../util/SourceFilePolicy'
import { isJsonRecord, type JsonRecord } from '../util/JsonRecord'
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
import { ScriptIndex, type ScriptIndexEntry, type ScriptMetadata } from './ScriptIndex'
import { inferDirectoryRelocation, planScriptRelocation } from './ScriptRelocationPlan'
import { recoverScriptRelocations } from './ScriptRelocationRecovery'
import { WorkspaceOrderStore } from './WorkspaceOrderStore'
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

interface BookmarkFileEnvelope extends JsonRecord {
	script: ScriptMetadata
	bookmarks: unknown[]
}

interface SourceCandidate {
	path: string
	stat: fs.Stats
	baseNameKey: string
	extension: string
	fileSystemIdentity?: string
}

interface SourceCandidateIndex {
	all: SourceCandidate[]
	bySize: Map<number, SourceCandidate[]>
	byBaseName: Map<string, SourceCandidate[]>
	byExtension: Map<string, SourceCandidate[]>
	byFileSystemIdentity: Map<string, SourceCandidate[]>
	fingerprints: Map<string, SourceFingerprint | undefined>
	contents: Map<string, string | undefined>
	contentBytes: number
}

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

const SOURCE_CANDIDATE_STAT_CONCURRENCY = 16
const MAX_SOURCE_CONTENT_CACHE_BYTES = 32 * 1024 * 1024
const BOOKMARK_CONFIGURATION_SUFFIX = '.codebookmark.json'
const MAX_IMPORT_CONFIGURATION_ENTRIES = 20_000
const MAX_IMPORT_CONFIGURATION_DEPTH = 64

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

interface BookmarkConfigurationImportCandidate {
	configPath: string
	targetAbsolutePath: string
}

function bookmarkItems(value: unknown): unknown[] | undefined {
	return isJsonRecord(value) && Array.isArray(value.bookmarks) ? value.bookmarks : undefined
}

function sourceFingerprint(value: unknown): SourceFingerprint | undefined {
	if (!isJsonRecord(value) || typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.sha256)) return undefined
	if (typeof value.size !== 'number' || !Number.isFinite(value.size) || value.size < 0) return undefined
	if (value.device !== undefined && typeof value.device !== 'string') return undefined
	if (value.inode !== undefined && typeof value.inode !== 'string') return undefined
	return {
		sha256: value.sha256,
		size: value.size,
		device: value.device,
		inode: value.inode,
	}
}

function scriptMetadata(value: unknown): ScriptMetadata | undefined {
	if (!isJsonRecord(value) || !isJsonRecord(value.script)) return undefined
	if (!isScriptId(value.script.id) || typeof value.script.path !== 'string' || !path.isAbsolute(value.script.path)) return undefined
	if (typeof value.script.lastSeenAt !== 'number' || !Number.isFinite(value.script.lastSeenAt) || value.script.lastSeenAt <= 0) return undefined
	const fingerprint = value.script.fingerprint === undefined ? undefined : sourceFingerprint(value.script.fingerprint)
	if (value.script.fingerprint !== undefined && !fingerprint) return undefined
	return {
		id: value.script.id,
		path: normalizedAbsolutePath(value.script.path),
		fingerprint,
		lastSeenAt: value.script.lastSeenAt,
		missingSince: typeof value.script.missingSince === 'number' ? value.script.missingSince : undefined,
		orderIndex: typeof value.script.orderIndex === 'number' && Number.isInteger(value.script.orderIndex)
			&& value.script.orderIndex >= 0 ? value.script.orderIndex : undefined,
	}
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
		if (!folder) throw new Error('无法确定全局脚本书签目录')
		return folder
	}

	private async readBookmarkFile(filePath: string): Promise<{ data: BookmarkFileEnvelope, filePath: string }> {
		const data = await fileUtils.readJsonFileAsync(filePath)
		const metadata = scriptMetadata(data)
		if (!metadata || !bookmarkItems(data)
			|| path.basename(filePath).toLowerCase() !== `${metadata.id}.json`.toLowerCase()) {
			throw new Error(`Unsupported bookmark configuration: ${filePath}`)
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
				logger.error(`已跳过损坏的全局脚本书签配置（${filePath}）: ${error}`)
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
				logger.error(`外部脚本书签配置无效（${filePath}）: ${error}`)
			}
		}
	}

	private updateIndex(filePath: string, data: BookmarkFileEnvelope): void {
		const metadata = scriptMetadata(data)
		if (!metadata) throw new Error(`无法索引脚本书签配置: ${filePath}`)
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
		const items = bookmarkItems(data)
		const metadata = scriptMetadata(data)
		if (!items || items.length === 0 || !metadata) return undefined
		const pathsMatchScript = (values: unknown[]): boolean => {
			for (const value of values) {
				if (!isJsonRecord(value) || typeof value.path !== 'string'
					|| absolutePathKey(value.path) !== absolutePathKey(metadata.path)) return false
				if (!Array.isArray(value.subs) || !pathsMatchScript(value.subs)) return false
			}
			return true
		}
		if (!pathsMatchScript(items)) {
			if (strict) throw new Error('配置内书签路径与脚本绝对路径不一致')
			return undefined
		}

		const fileNode = new Bookmark({
			id: `file_${metadata.id}`,
			path: metadata.path,
			scriptId: metadata.id,
			contextValue: ContextBookmark.File,
			collapsible: vscode.TreeItemCollapsibleState.Expanded,
		})
		const bookmarks: Bookmark[] = []
		const parseState = { count: 0 }
		for (const item of items) {
			try {
				bookmarks.push(Bookmark.fromJSON(item, 0, parseState))
			} catch (error) {
				if (strict) throw error
				logger.error(`已跳过损坏的书签记录: ${error}`)
				if (String(error).includes('nodes')) break
			}
		}
		if (bookmarks.length === 0) return undefined
		fileNode.createdAt = Math.min(...bookmarks.map(bookmark => bookmark.createdAt))
		for (const bookmark of bookmarks) bookmark.parent = fileNode
		fileNode.subs.addAll(bookmarks)
		this.updateFileNodePath(fileNode, displayPath ?? metadata.path)
		return fileNode
	}

	private absolutePathForFileNode(fileNode: Bookmark, scopeUri?: vscode.Uri): string {
		if (path.isAbsolute(fileNode.path)) return normalizedAbsolutePath(fileNode.path)
		const workspaceRoot = fileUtils.workspaceRoot(scopeUri)
		if (!workspaceRoot) throw new Error(`无法将书签相对路径解析为绝对路径: ${fileNode.path}`)
		return normalizedAbsolutePath(path.resolve(workspaceRoot, fileNode.path))
	}

	private async envelopeForFileNode(
		fileNode: Bookmark,
		scopeUri?: vscode.Uri,
		absolutePathOverride?: string,
	): Promise<BookmarkFileEnvelope> {
		if (!fileNode.scriptId) fileNode.scriptId = createScriptId()
		const absolutePath = normalizedAbsolutePath(absolutePathOverride ?? this.absolutePathForFileNode(fileNode, scopeUri))
		const bookmarks = fileNode.subs.values.map(bookmark => bookmark.toJSON())
		setSerializedBookmarkPaths(bookmarks, absolutePath)
		const fingerprint = await fingerprintSourceFile(absolutePath)
		const previousMetadata = this.scriptIndex.get(fileNode.scriptId)?.metadata
		return {
			script: {
				id: fileNode.scriptId,
				path: absolutePath,
				fingerprint: fingerprint ?? previousMetadata?.fingerprint,
				lastSeenAt: Date.now(),
				missingSince: fingerprint ? undefined : previousMetadata?.missingSince ?? Date.now(),
				orderIndex: fingerprint ? undefined : previousMetadata?.orderIndex,
			},
			bookmarks,
		}
	}

	private async writeEnvelope(filePath: string, data: BookmarkFileEnvelope): Promise<void> {
		if (!await fileUtils.writeJsonFileAsync(filePath, data)) throw new Error(`无法写入书签配置: ${filePath}`)
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
		// Once the first write starts, finish the duplicate cleanup as one integrity-preserving unit.
		throwIfReadCancelled(signal)
		await this.writeEnvelope(primary.filePath, data)
		for (const duplicate of duplicates) {
			if (duplicate.id === primary.id) continue
			await this.archiveSupersededConfig(duplicate.filePath)
			this.removeIndexEntry(duplicate.id)
		}
		return this.scriptIndex.get(primary.id)
	}

	private async sourceCandidateIndex(paths: readonly string[], signal?: AbortSignal): Promise<SourceCandidateIndex> {
		const sortedPaths = [...new Set(paths.map(normalizedAbsolutePath))].sort((left, right) => left.localeCompare(right))
		const candidates: Array<SourceCandidate | undefined> = new Array(sortedPaths.length)
		let cursor = 0
		const worker = async (): Promise<void> => {
			while (cursor < sortedPaths.length) {
				const index = cursor++
				const candidatePath = sortedPaths[index]
				throwIfReadCancelled(signal)
				try {
					const stat = await fs.promises.stat(candidatePath)
					throwIfReadCancelled(signal)
					if (!stat.isFile()) continue
					const baseName = path.basename(candidatePath)
					candidates[index] = {
						path: candidatePath,
						stat,
						baseNameKey: baseName,
						extension: path.extname(candidatePath).toLowerCase(),
						fileSystemIdentity: `${String(stat.dev)}\0${String(stat.ino)}`,
					}
				} catch (error) {
					if (isBookmarkReadCancelled(error)) throw error
				}
			}
		}
		await Promise.all(Array.from(
			{ length: Math.min(SOURCE_CANDIDATE_STAT_CONCURRENCY, sortedPaths.length) },
			() => worker(),
		))

		const all = candidates.filter((candidate): candidate is SourceCandidate => candidate !== undefined)
		const result: SourceCandidateIndex = {
			all,
			bySize: new Map(),
			byBaseName: new Map(),
			byExtension: new Map(),
			byFileSystemIdentity: new Map(),
			fingerprints: new Map(),
			contents: new Map(),
			contentBytes: 0,
		}
		const add = <K>(map: Map<K, SourceCandidate[]>, key: K, candidate: SourceCandidate): void => {
			const values = map.get(key) ?? []
			values.push(candidate)
			map.set(key, values)
		}
		for (const candidate of all) {
			add(result.bySize, candidate.stat.size, candidate)
			add(result.byBaseName, candidate.baseNameKey, candidate)
			add(result.byExtension, candidate.extension, candidate)
			if (candidate.fileSystemIdentity) add(result.byFileSystemIdentity, candidate.fileSystemIdentity, candidate)
		}
		return result
	}

	private async sourceCandidates(root: string, signal?: AbortSignal): Promise<SourceCandidateIndex> {
		const files: string[] = []
		let entriesSeen = 0
		const visit = async (folder: string): Promise<void> => {
			throwIfReadCancelled(signal)
			if (entriesSeen > 50_000) return
			let entries: fs.Dirent[]
			try {
				entries = await fs.promises.readdir(folder, { withFileTypes: true })
			} catch {
				return
			}
			throwIfReadCancelled(signal)
			entriesSeen += entries.length
			for (const entry of entries) {
				throwIfReadCancelled(signal)
				if (entriesSeen > 50_000) return
				const candidate = path.join(folder, entry.name)
				if (entry.isDirectory() && !SOURCE_SCAN_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) await visit(candidate)
				else if (entry.isFile()) files.push(candidate)
			}
		}
		await visit(root)
		return this.sourceCandidateIndex(files, signal)
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

	private async candidateContent(
		candidates: SourceCandidateIndex,
		candidatePath: string,
	): Promise<string | undefined> {
		if (candidates.contents.has(candidatePath)) {
			const cached = candidates.contents.get(candidatePath)
			candidates.contents.delete(candidatePath)
			candidates.contents.set(candidatePath, cached)
			return cached
		}
		let content: string | undefined
		try {
			content = await fs.promises.readFile(candidatePath, 'utf8')
		} catch {
			content = undefined
		}
		if (content === undefined) {
			candidates.contents.set(candidatePath, undefined)
			return undefined
		}
		const bytes = Buffer.byteLength(content)
		if (bytes <= MAX_SOURCE_CONTENT_CACHE_BYTES) {
			while (candidates.contentBytes + bytes > MAX_SOURCE_CONTENT_CACHE_BYTES) {
				const oldestPath = candidates.contents.keys().next().value as string | undefined
				if (oldestPath === undefined) break
				const oldest = candidates.contents.get(oldestPath)
				candidates.contents.delete(oldestPath)
				if (oldest !== undefined) candidates.contentBytes -= Buffer.byteLength(oldest)
			}
			candidates.contents.set(candidatePath, content)
			candidates.contentBytes += bytes
		}
		return content
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
				const content = await this.candidateContent(candidates, candidate.path)
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
				logger.error(`工作区移动恢复候选检查失败（${entry.filePath}）: ${error}`)
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
				logger.error(`工作区移动恢复失败（${match.target}）: ${error}`)
			}
		}
		return { ambiguousTargets, candidates }
	}

	private updateFileNodePath(fileNode: Bookmark, nextPath: string): void {
		fileNode.path = canonicalBookmarkPath(nextPath)
		fileNode.label = path.basename(fileNode.path)
		const update = (bookmarks: Bookmark[]): void => {
			for (const bookmark of bookmarks) {
				bookmark.path = fileNode.path
				if (bookmark.subs.size > 0) update(bookmark.subs.values)
			}
		}
		update(fileNode.subs.values)
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
		if (!fileNode) throw new Error(`脚本书签配置没有有效书签: ${entry.filePath}`)
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
				logger.error(`恢复未完成的脚本转移失败（${record.oldAbsolutePath}）: ${error}`)
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
			// A missingSince marker is a tombstone, not a permanent opt-out from
			// relocation. External moves can arrive as delete + create events, so a
			// tombstoned configuration remains eligible for fingerprint/inode/content
			// matching against the active file.
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
				logger.error(`检查跨模式脚本绑定失败（${entry.filePath}）: ${error}`)
			}
		}
		if (matches.length === 0) return
		const selected = matches[0]
		if (matches.length > 1) {
			void vscode.window.showWarningMessage(`发现 ${matches.length} 个可能对应“${path.basename(activeAbsolutePath)}”的书签配置；为避免错误绑定，已暂缓自动恢复。`)
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
			vscode.window.showInformationMessage(
				`已自动恢复改名工作区内 ${workspaceRelocation.scriptCount} 个脚本的书签绑定；恢复结果：${formatBookmarkLevelSummary(workspaceRelocation.bookmarkSummary)}。当前脚本：${path.basename(activeAbsolutePath)}。`,
			)
			return
		}
		const standaloneRelocated = await this.tryRelocateStandaloneDirectory(
			selected.entry,
			activeAbsolutePath,
			signal,
		)
		if (standaloneRelocated) {
			throwIfReadCancelled(signal)
			vscode.window.showInformationMessage(
				`已自动恢复移动目录内 ${standaloneRelocated.scriptCount} 个脚本的书签绑定；恢复结果：${formatBookmarkLevelSummary(standaloneRelocated.bookmarkSummary)}。`,
			)
			return
		}
		await this.enqueueRelocation(() => {
			throwIfReadCancelled(signal)
			return this.rebindConfiguration(selected.entry, selected.data, activeAbsolutePath)
		})
		throwIfReadCancelled(signal)
		const fileNode = this.createFileNode(selected.data, activeAbsolutePath)
		const summary = summarizeBookmarkTrees(fileNode?.subs ?? [])
		vscode.window.showInformationMessage(`已自动恢复脚本书签绑定：${path.basename(activeAbsolutePath)}；恢复结果：${formatBookmarkLevelSummary(summary)}。`)
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
				logger.error(`检查独立目录移动恢复失败（${entry.metadata.path}）: ${error}`)
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
			// A workspace-root move carries ordering information for every child. Resolve
			// that aggregate operation before per-file fingerprint recovery; otherwise the
			// directory scan can append files in arbitrary order and destroy the saved order.
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
							vscode.window.showInformationMessage(`已自动重连脚本书签：${path.basename(relocatedPath)}；恢复结果：${formatBookmarkLevelSummary(summary)}。`)
						}
					}
				} catch (error) {
					if (isBookmarkReadCancelled(error)) throw error
					logger.error(`已跳过无法读取的脚本书签配置（${entry.filePath}）: ${error}`)
				}
			}
			return bookmarks
		} catch (error) {
			if (isBookmarkReadCancelled(error)) {
				// A cancelled incremental refresh may have touched only part of the shared index.
				// Force the next active request to rebuild it instead of observing a partial snapshot.
				this.indexReady = false
				return []
			}
			logger.error('无法读取书签配置文件')
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
			if (!storageRoot) throw new Error('尚未配置书签存储目录')
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
						logger.error(`删除书签配置后清理工作区顺序失败（${entry.scriptPath}）: ${error}`)
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
						// A filesystem relocation may have updated the repository before
						// this queued in-memory snapshot was flushed. Keep the repository's
						// binding authoritative instead of resurrecting the old path.
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
			logger.error("Can't save bookmarks to file")
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
	 * Reconcile a source path that has just appeared on disk. File-system
	 * providers are allowed to report a move as delete + create (or only create),
	 * so this path must be independent from onDidRenameFiles.
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
					logger.error(`批量恢复书签绑定失败（${sourcePath}）: ${error}`)
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

		// Changes to an already-bound file are the common case. Avoid scanning
		// every stored configuration unless this path is genuinely unbound.
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
				logger.error(`新文件出现时恢复书签绑定失败（${targetPath}）: ${error}`)
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

	private async collectBookmarkConfigurationImportCandidates(
		configFolderPath: string,
		workspaceRootPath: string,
	): Promise<BookmarkConfigurationImportCandidate[]> {
		const configFolder = normalizedAbsolutePath(configFolderPath)
		const workspaceRoot = normalizedAbsolutePath(workspaceRootPath)
		const candidates: BookmarkConfigurationImportCandidate[] = []
		let scannedEntries = 0

		const visit = async (currentPath: string, depth: number): Promise<void> => {
			if (depth > MAX_IMPORT_CONFIGURATION_DEPTH) {
				throw new Error(`书签配置目录层级超过 ${MAX_IMPORT_CONFIGURATION_DEPTH} 层，请缩小导入目录。`)
			}
			const entries = await fs.promises.readdir(currentPath, { withFileTypes: true })
			entries.sort((left, right) => left.name.localeCompare(right.name))
			scannedEntries += entries.length
			if (scannedEntries > MAX_IMPORT_CONFIGURATION_ENTRIES) {
				throw new Error(`书签配置目录项超过 ${MAX_IMPORT_CONFIGURATION_ENTRIES} 个，请缩小导入目录。`)
			}
			for (const entry of entries) {
				const entryPath = path.join(currentPath, entry.name)
				if (entry.isDirectory()) {
					if (!SOURCE_SCAN_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) await visit(entryPath, depth + 1)
					continue
				}
				if (!entry.isFile()) continue
				let targetAbsolutePath: string | undefined
				if (entry.name.toLowerCase().endsWith(BOOKMARK_CONFIGURATION_SUFFIX)) {
					const relativeConfigPath = path.relative(configFolder, entryPath)
					const relativeSourcePath = relativeConfigPath.slice(0, -BOOKMARK_CONFIGURATION_SUFFIX.length)
					if (!relativeSourcePath || relativeSourcePath.startsWith('..') || path.isAbsolute(relativeSourcePath)) continue
					targetAbsolutePath = normalizedAbsolutePath(path.join(workspaceRoot, relativeSourcePath))
				} else if (path.extname(entry.name).toLowerCase() === '.json') {
					try {
						const value = await fileUtils.readJsonFileAsync(entryPath)
						const metadata = scriptMetadata(value)
						if (metadata && isSameOrDescendantAbsolutePath(metadata.path, workspaceRoot)) targetAbsolutePath = metadata.path
					} catch {
						continue
					}
				}
				if (!targetAbsolutePath) continue
				if (!isSameOrDescendantAbsolutePath(targetAbsolutePath, workspaceRoot)) continue
				candidates.push({ configPath: entryPath, targetAbsolutePath })
			}
		}

		await visit(configFolder, 0)
		const unique = new Map<string, BookmarkConfigurationImportCandidate>()
		for (const candidate of candidates) unique.set(absolutePathKey(candidate.targetAbsolutePath), candidate)
		return [...unique.values()]
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
		if (!storageRoot) throw new Error('尚未配置书签存储目录')
		await this.ensureIndex(storageRoot)
		const candidates = await this.collectBookmarkConfigurationImportCandidates(configFolderPath, workspaceRootPath)
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
				const importedValue = await fileUtils.readJsonFileAsync(candidate.configPath)
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
				logger.error(`检查书签配置导入候选失败（${candidate.configPath}）: ${error}`)
			}
		}
		if (fingerprintMismatches > 0) {
			const continueLabel = '仍然导入并绑定'
			const choice = await vscode.window.showWarningMessage(
				`有 ${fingerprintMismatches} 个配置的源码指纹与当前工作区文件不同。继续会按当前文件内容重新绑定。`,
				{ modal: true },
				continueLabel,
				'取消',
			)
			if (choice !== continueLabel) {
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
				logger.error(`导入书签配置失败（${candidate.configPath} -> ${candidate.targetAbsolutePath}）: ${error}`)
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
		if (!storageRoot) throw new Error('尚未配置书签存储目录')
		await this.ensureIndex(storageRoot)
		const targetPath = normalizedAbsolutePath(targetAbsolutePath)
		const importedValue = await fileUtils.readJsonFileAsync(configPath)
		const importedMetadata = scriptMetadata(importedValue)
		const importedItems = bookmarkItems(importedValue)
		if (!importedMetadata || !importedItems || importedItems.length === 0) {
			throw new Error('所选文件不是有效的书签配置')
		}
		this.createFileNode(importedValue, importedMetadata.path, true)
		const targetFingerprint = await fingerprintSourceFile(targetPath)
		if (!targetFingerprint) throw new Error('无法读取当前脚本内容')
		if (!fingerprintMismatchConfirmed && importedMetadata.fingerprint && importedMetadata.fingerprint.sha256 !== targetFingerprint.sha256) {
			const continueLabel = '仍然导入并绑定'
			const choice = await vscode.window.showWarningMessage(
				'所选配置的源码指纹与当前脚本不同。继续会把其中的书签重新绑定到当前脚本。',
				{ modal: true },
				continueLabel,
				'取消',
			)
			if (choice !== continueLabel) throw new Error('用户取消了书签配置导入')
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
		const output: BookmarkFileEnvelope = {
			script: {
				id: targetId,
				path: targetPath,
				fingerprint: targetFingerprint,
				lastSeenAt: Date.now(),
			},
			bookmarks,
		}
		const display = this.displayPath(targetPath, vscode.Uri.file(targetPath))
		let fileNode = this.createFileNode(output, display, true)
		if (!fileNode) throw new Error('导入结果没有有效书签')
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
				'无法更新工作区书签顺序',
			)
		}
		fileNode = this.createFileNode(output, display, true)
		if (!fileNode) throw new Error('导入结果没有有效书签')
		return fileNode
	}
}

export const bookmarkRepository = new CodeBookmarksRepository()
