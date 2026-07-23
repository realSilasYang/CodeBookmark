/**
 * 模块说明：本文件负责持久化、索引与迁移事务，具体对象为 `StorageRootTransfer`。
 *
 * 实现要点：围绕脚本配置的读取、索引、迁移或恢复拆分单一职责，并由仓库统一提交副作用。
 * 核心边界：所有磁盘状态都必须经过校验与原子化处理，不能让部分写入覆盖仍有效的用户数据。
 * 主要入口：`transferStorageRoot`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as crypto from 'crypto'
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
import {
	persistLegacyJsonMigration,
	removeLegacyJsonMigrationBackup,
} from '../util/PersistenceMigration'
import {
	decodePersistenceList,
	decodePersistenceRecord,
	persistenceHeader,
	PersistenceFormats,
	type PersistenceHeader,
} from '../util/PersistenceSchema'

const TRANSFER_STATE_FILE = '.storage-transfer.json'
const OWNED_STORAGE_DIRECTORIES = ['scripts', 'scopes', '.script-relocations'] as const

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

async function exists(target: string): Promise<boolean> {
	try {
		await fs.promises.access(target)
		return true
	} catch {
		return false
	}
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
		const sourceOrder = decodePersistenceList(source, PersistenceFormats.workspaceOrder, 'order').value.order
		const targetOrder = decodePersistenceList(target, PersistenceFormats.workspaceOrder, 'order').value.order
		if (Array.isArray(sourceOrder) && Array.isArray(targetOrder)
			&& sourceOrder.every(item => typeof item === 'string')
			&& targetOrder.every(item => typeof item === 'string')) {
			return workspaceOrderPersistence([...new Set([...targetOrder, ...sourceOrder])])
		}
	} catch {
		// 旧列表格式解析失败后，继续尝试下方的脚本信封格式。
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

	// 来源根目录会在转移前立即刷新，因此通常其 lastSeenAt 更新。
	// 时间相同时以目标根目录为准，因为其中可能已存在更晚写入的用户数据。
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
	if (!await exists(backup)) await fs.promises.copyFile(target, backup, fs.constants.COPYFILE_EXCL)
}

async function preserveTransferSnapshot(target: string, content: Buffer): Promise<void> {
	await backupOnce(target)
	const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12)
	const backup = `${target}.transfer-copy_${hash}`
	if (!await exists(backup)) await atomicWriteFile(backup, content)
}

async function conflictTarget(target: string, sourceContent: Buffer): Promise<string> {
	const extension = path.extname(target)
	const stem = extension ? target.slice(0, -extension.length) : target
	const hash = crypto.createHash('sha256').update(sourceContent).digest('hex').slice(0, 12)
	let candidate = `${stem}.transfer-conflict_${hash}${extension}`
	let suffix = 1
	while (await exists(candidate)) {
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
		if (await exists(absolute)) await visit(absolute)
	}
	return files
}

async function removeSourceStorageEntries(root: string): Promise<void> {
	// 存储根目录可能与无关用户文件共用父目录，只能删除明确归 CodeBookmark 所有的条目。
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
			await persistLegacyJsonMigration(journalPath, journal, async (target, migrated) => {
				await atomicWriteFile(target, JSON.stringify(migrated, null, 2))
				return true
			})
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
		throw new Error(localize('新旧书签存储目录不能互相包含', 'The old and new bookmark storage folders cannot contain one another.'))
	}
	const [canonicalSource, canonicalTarget] = await Promise.all([
		canonicalAbsolute(source),
		canonicalAbsolute(target),
	])
	if (isSameOrDescendantAbsolutePath(canonicalSource, canonicalTarget)
		|| isSameOrDescendantAbsolutePath(canonicalTarget, canonicalSource)) {
		throw new Error(localize(
			'新旧书签存储目录不能通过符号链接或目录联接互相包含',
			'The old and new bookmark storage folders cannot contain one another through symbolic links or directory junctions.',
		))
	}

	await fs.promises.mkdir(target, { recursive: true })
	const previousJournal = await readJournal(target)
	const resumable = previousJournal?.status === 'in_progress'
		&& normalizedAbsolutePath(previousJournal.source) === normalizedAbsolutePath(source)
		&& normalizedAbsolutePath(previousJournal.target) === normalizedAbsolutePath(target)
	const result: StorageRootTransferResult = resumable ? {
		copiedFiles: previousJournal.copiedFiles,
		mergedFiles: previousJournal.mergedFiles,
		conflictFiles: previousJournal.conflictFiles,
	} : { copiedFiles: 0, mergedFiles: 0, conflictFiles: 0 }
	const startedAt = resumable ? previousJournal.startedAt : new Date().toISOString()
	const checkpoint = () => writeJournal(target, { status: 'in_progress', source, target, startedAt, ...result })
	await checkpoint()
	if (!await exists(source)) {
		await completeJournal(target, { status: 'complete', source, target, startedAt, completedAt: new Date().toISOString(), ...result })
		return result
	}

	for (const sourceFile of await listFiles(source)) {
		const relative = path.relative(source, sourceFile)
		const targetFile = path.join(target, relative)
		if (!await exists(targetFile)) {
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
			if (targetContent.toString('utf8') === mergedContent) continue
			// 每次覆盖目标前都保存快照，不能只保留第一次转移生成的备份。
			await preserveTransferSnapshot(targetFile, targetContent)
			await atomicWriteFile(targetFile, mergedContent)
			result.mergedFiles++
			await checkpoint()
			continue
		}

		const preservedTarget = await conflictTarget(targetFile, sourceContent)
		if (!await exists(preservedTarget)) await atomicWriteFile(preservedTarget, sourceContent)
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
