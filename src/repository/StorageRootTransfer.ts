/**
 * 把脚本配置、顺序、迁移记录和受管元数据从旧存储根目录合并到新目录。
 * 每次覆盖都留下可恢复快照；迁移完成后只删除 CodeBookmark 明确拥有的旧文件。
 */
import * as fs from 'fs'
import * as path from 'path'
import { localize } from '../i18n/Localization'
import { isScriptId } from '../util/ScriptIdentity'
import { isJsonRecord } from '../util/JsonRecord'
import {
	isSameOrDescendantAbsolutePath,
	normalizedAbsolutePath,
} from '../util/AbsolutePath'
import { atomicCopyFile, atomicWriteFile } from '../util/AtomicFile'
import { mergeSerializedBookmarks } from '../models/SerializedBookmarkTree'
import { workspaceOrderPersistence } from '../models/WorkspaceOrder'
import { decodePortableExchangeRecord } from '../portable/PortableExchangeStore'
import {
	persistLegacyJsonMigrationAtomically,
	removeLegacyJsonMigrationBackup,
} from '../util/PersistenceMigration'
import {
	decodePersistenceList,
	decodePersistenceRecord,
	persistenceHeader,
	PersistenceFormats,
	type PersistenceHeader,
} from '../util/PersistenceSchema'
import { pathExists } from '../util/FileSystem'
import { sha256Hex } from '../util/Sha256'

const TRANSFER_STATE_FILE = '.storage-transfer.json'
const OWNED_STORAGE_DIRECTORIES = ['scripts', 'scopes', 'exchanges', '.script-relocations'] as const

interface StorageRootTransferResult {
	copiedFiles: number
	mergedFiles: number
	conflictFiles: number
}

interface StorageRootTransferJournal extends StorageRootTransferResult, PersistenceHeader {
	status: 'in_progress' | 'complete'
	source: string
	target: string
	startedAt: string
	completedAt?: string
}

async function canonicalAbsolute(value: string): Promise<string> {
	let current = path.resolve(value)
	const missingSegments: string[] = []
	while (true) {
		try {
			const existing = await fs.promises.realpath(current)
			return path.resolve(existing, ...missingSegments.reverse())
		} catch {
			const parent = path.dirname(current)
			if (parent === current) return path.resolve(value)
			missingSegments.push(path.basename(current))
			current = parent
		}
	}
}

function scriptIdentity(value: unknown): { id: string, lastSeenAt: number } | undefined {
	if (!isJsonRecord(value) || !isJsonRecord(value.script) || !isScriptId(value.script.id)
		|| typeof value.script.path !== 'string' || !path.isAbsolute(value.script.path)
		|| typeof value.script.lastSeenAt !== 'number') {
		return undefined
	}
	return {
		id: value.script.id,
		lastSeenAt: value.script.lastSeenAt,
	}
}

function mergeJson(source: unknown, target: unknown): unknown | undefined {
	try {
		const sourceExchange = decodePortableExchangeRecord(source)
		const targetExchange = decodePortableExchangeRecord(target)
		if (sourceExchange.exchangeId !== targetExchange.exchangeId
			|| sourceExchange.scopeKey !== targetExchange.scopeKey) return undefined
		return sourceExchange.updatedAt > targetExchange.updatedAt ? sourceExchange : targetExchange
	} catch {
		// 普通脚本配置和工作区顺序并不是交换记录，继续按各自格式尝试合并。
	}
	try {
		const sourceOrder = decodePersistenceList(source, PersistenceFormats.workspaceOrder, 'order').value.order
		const targetOrder = decodePersistenceList(target, PersistenceFormats.workspaceOrder, 'order').value.order
		if (Array.isArray(sourceOrder) && Array.isArray(targetOrder)
			&& sourceOrder.every(item => typeof item === 'string')
			&& targetOrder.every(item => typeof item === 'string')) {
			return workspaceOrderPersistence([...new Set([...targetOrder, ...sourceOrder])])
		}
	} catch {
		// 同一个 JSON 文件既可能是旧式书签数组，也可能是当前脚本信封。
		// 数组解码不成立时再尝试信封，不能因为第一种形态失败就过早判定文件损坏。
	}
	try {
		source = decodePersistenceRecord(source, PersistenceFormats.script).value
		target = decodePersistenceRecord(target, PersistenceFormats.script).value
	} catch {
		return undefined
	}
	if (!isJsonRecord(source) || !isJsonRecord(target)) return undefined
	if (!Array.isArray(source.bookmarks) || !Array.isArray(target.bookmarks)) return undefined
	const sourceScript = scriptIdentity(source)
	const targetScript = scriptIdentity(target)
	if (!sourceScript || !targetScript || sourceScript.id !== targetScript.id) return undefined

	// 转移前刚刚读取过来源根目录，它的 lastSeenAt 往往会更新。时间完全相同时仍选目标，
	// 因为目标可能早已有用户继续编辑的数据，不能被一次迁移中的读取时间反客为主。
	const sourceIsAuthoritative = sourceScript.lastSeenAt > targetScript.lastSeenAt
	const primary = sourceIsAuthoritative ? source : target
	const secondaryBookmarks = sourceIsAuthoritative ? target.bookmarks : source.bookmarks
	const merged = structuredClone(primary)
	if (!isJsonRecord(merged) || !Array.isArray(merged.bookmarks)) return undefined
	if (!isJsonRecord(merged.script) || typeof merged.script.path !== 'string') return undefined
	merged.bookmarks = mergeSerializedBookmarks(merged.bookmarks, secondaryBookmarks, merged.script.path)
	return merged
}

async function backupOnce(target: string): Promise<void> {
	const backup = `${target}.transfer-base`
	if (!await pathExists(backup)) await fs.promises.copyFile(target, backup, fs.constants.COPYFILE_EXCL)
}

async function preserveTransferSnapshot(target: string, content: Buffer): Promise<void> {
	await backupOnce(target)
	const hash = sha256Hex(content).slice(0, 12)
	const backup = `${target}.transfer-copy_${hash}`
	if (!await pathExists(backup)) await atomicWriteFile(backup, content)
}

async function conflictTarget(target: string, sourceContent: Buffer): Promise<string> {
	const extension = path.extname(target)
	const stem = extension ? target.slice(0, -extension.length) : target
	const hash = sha256Hex(sourceContent).slice(0, 12)
	let candidate = `${stem}.transfer-conflict_${hash}${extension}`
	let suffix = 1
	while (await pathExists(candidate)) {
		const current = await fs.promises.readFile(candidate)
		if (current.equals(sourceContent)) return candidate
		candidate = `${stem}.transfer-conflict_${hash}_${suffix++}${extension}`
	}
	return candidate
}

async function listFiles(root: string): Promise<string[]> {
	const files: string[] = []
	const visit = async (folder: string): Promise<void> => {
		for (const entry of await fs.promises.readdir(folder, { withFileTypes: true })) {
			if (entry.name === TRANSFER_STATE_FILE || entry.name.endsWith('.tmp')
				|| /\.transfer-(?:base$|copy_|conflict_)/.test(entry.name)) continue
			const absolute = path.join(folder, entry.name)
			if (entry.isDirectory()) await visit(absolute)
			else if (entry.isFile()) files.push(absolute)
		}
	}
	for (const directory of OWNED_STORAGE_DIRECTORIES) {
		const absolute = path.join(root, directory)
		if (await pathExists(absolute)) await visit(absolute)
	}
	return files
}

async function removeSourceStorageEntries(root: string): Promise<void> {
	// 用户可以把存储根设在已有目录中，迁移完成后只能清理白名单内的 CodeBookmark 文件；
	// 即使旧根看起来“几乎为空”，也不能顺手删除同级的其他内容。
	for (const directory of OWNED_STORAGE_DIRECTORIES) {
		await fs.promises.rm(path.join(root, directory), { recursive: true, force: true })
	}
	await fs.promises.rm(path.join(root, TRANSFER_STATE_FILE), { force: true })
	for (const entry of await fs.promises.readdir(root, { withFileTypes: true })) {
		if (entry.isFile() && entry.name.startsWith(`${TRANSFER_STATE_FILE}.`) && entry.name.endsWith('.tmp')) {
			await fs.promises.rm(path.join(root, entry.name), { force: true })
		}
	}
}

async function writeJournal(targetRoot: string, value: unknown): Promise<void> {
	const versioned = decodePersistenceRecord(value, PersistenceFormats.storageTransfer).value
	await atomicWriteFile(path.join(targetRoot, TRANSFER_STATE_FILE), JSON.stringify(versioned, null, 2))
}

async function completeJournal(targetRoot: string, value: unknown): Promise<void> {
	await writeJournal(targetRoot, value)
	await removeLegacyJsonMigrationBackup(path.join(targetRoot, TRANSFER_STATE_FILE))
}

async function readJournal(targetRoot: string): Promise<StorageRootTransferJournal | undefined> {
	try {
		const journalPath = path.join(targetRoot, TRANSFER_STATE_FILE)
		const decoded = decodePersistenceRecord(
			JSON.parse(await fs.promises.readFile(journalPath, 'utf8')),
			PersistenceFormats.storageTransfer,
		)
		const value = decoded.value
		if (!isJsonRecord(value) || (value.status !== 'in_progress' && value.status !== 'complete')
			|| typeof value.source !== 'string' || typeof value.target !== 'string'
			|| typeof value.startedAt !== 'string') return undefined
		const count = (name: keyof StorageRootTransferResult): number | undefined => {
			const candidate = value[name]
			return typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0
				? candidate
				: undefined
		}
		const copiedFiles = count('copiedFiles')
		const mergedFiles = count('mergedFiles')
		const conflictFiles = count('conflictFiles')
		if (copiedFiles === undefined || mergedFiles === undefined || conflictFiles === undefined) return undefined
		const journal: StorageRootTransferJournal = {
			...persistenceHeader(PersistenceFormats.storageTransfer),
			status: value.status,
			source: value.source,
			target: value.target,
			startedAt: value.startedAt,
			completedAt: typeof value.completedAt === 'string' ? value.completedAt : undefined,
			copiedFiles,
			mergedFiles,
			conflictFiles,
		}
		if (decoded.migrated) {
			await persistLegacyJsonMigrationAtomically(journalPath, journal)
		}
		return journal
	} catch {
		return undefined
	}
}

export async function transferStorageRoot(sourceRoot: string, targetRoot: string): Promise<StorageRootTransferResult> {
	const source = path.resolve(sourceRoot)
	const target = path.resolve(targetRoot)
	if (normalizedAbsolutePath(source) === normalizedAbsolutePath(target)) {
		return { copiedFiles: 0, mergedFiles: 0, conflictFiles: 0 }
	}
	if (isSameOrDescendantAbsolutePath(source, target) || isSameOrDescendantAbsolutePath(target, source)) {
		throw new Error(localize("repository.StorageRootTransfer.theOldAndNewBookmarkStorageFoldersCannotContain"))
	}
	const [canonicalSource, canonicalTarget] = await Promise.all([
		canonicalAbsolute(source),
		canonicalAbsolute(target),
	])
	if (isSameOrDescendantAbsolutePath(canonicalSource, canonicalTarget)
		|| isSameOrDescendantAbsolutePath(canonicalTarget, canonicalSource)) {
		throw new Error(localize("repository.StorageRootTransfer.theOldAndNewBookmarkStorageFoldersCannotContain2"))
	}

	await fs.promises.mkdir(target, { recursive: true })
	const previousJournal = await readJournal(target)
	const sourceFiles = await listFiles(source)
	const samePreviousTransfer = previousJournal !== undefined
		&& normalizedAbsolutePath(previousJournal.source) === normalizedAbsolutePath(source)
		&& normalizedAbsolutePath(previousJournal.target) === normalizedAbsolutePath(target)
	if (samePreviousTransfer && previousJournal.status === 'complete' && sourceFiles.length === 0) {
		return {
			copiedFiles: previousJournal.copiedFiles,
			mergedFiles: previousJournal.mergedFiles,
			conflictFiles: previousJournal.conflictFiles,
		}
	}
	const resumable = samePreviousTransfer && previousJournal.status === 'in_progress'
	const result: StorageRootTransferResult = resumable ? {
		copiedFiles: previousJournal.copiedFiles,
		mergedFiles: previousJournal.mergedFiles,
		conflictFiles: previousJournal.conflictFiles,
	} : { copiedFiles: 0, mergedFiles: 0, conflictFiles: 0 }
	const startedAt = resumable ? previousJournal.startedAt : new Date().toISOString()
	const checkpoint = () => writeJournal(target, { status: 'in_progress', source, target, startedAt, ...result })
	await checkpoint()
	if (!await pathExists(source)) {
		await completeJournal(target, { status: 'complete', source, target, startedAt, completedAt: new Date().toISOString(), ...result })
		return result
	}

	for (const sourceFile of sourceFiles) {
		const relative = path.relative(source, sourceFile)
		const targetFile = path.join(target, relative)
		if (!await pathExists(targetFile)) {
			await atomicCopyFile(sourceFile, targetFile)
			result.copiedFiles++
			await checkpoint()
			continue
		}

		const [sourceContent, targetContent] = await Promise.all([
			fs.promises.readFile(sourceFile),
			fs.promises.readFile(targetFile),
		])
		if (sourceContent.equals(targetContent)) continue

		let merged: unknown | undefined
		if (path.extname(sourceFile).toLowerCase() === '.json') {
			try {
				merged = mergeJson(JSON.parse(sourceContent.toString('utf8')), JSON.parse(targetContent.toString('utf8')))
			} catch {
				merged = undefined
			}
		}
		if (merged !== undefined) {
			const mergedContent = JSON.stringify(merged, null, 2)
			try {
				if (JSON.stringify(JSON.parse(targetContent.toString('utf8'))) === JSON.stringify(merged)) continue
			} catch {
				if (targetContent.toString('utf8') === mergedContent) continue
			}
			// 每一次覆盖都对应不同的目标现状，所以必须当场保存快照。
			// 复用上一次迁移的备份会让本轮失败时只能恢复到更早、已经过期的数据。
			await preserveTransferSnapshot(targetFile, targetContent)
			await atomicWriteFile(targetFile, mergedContent)
			result.mergedFiles++
			await checkpoint()
			continue
		}

		const preservedTarget = await conflictTarget(targetFile, sourceContent)
		if (!await pathExists(preservedTarget)) await atomicWriteFile(preservedTarget, sourceContent)
		result.conflictFiles++
		await checkpoint()
	}

	await completeJournal(target, {
		status: 'complete',
		source,
		target,
		startedAt,
		completedAt: new Date().toISOString(),
		...result,
	})
	await removeSourceStorageEntries(source)
	return result
}
