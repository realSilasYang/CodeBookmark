/**
 * 模块说明：本文件负责持久化、索引与迁移事务，具体对象为 `ScriptRelocationJournal`。
 *
 * 实现要点：围绕脚本配置的读取、索引、迁移或恢复拆分单一职责，并由仓库统一提交副作用。
 * 核心边界：所有磁盘状态都必须经过校验与原子化处理，不能让部分写入覆盖仍有效的用户数据。
 * 主要入口：`ScriptRelocationRecord`、`createScriptRelocation`、`readPendingScriptRelocations`、`resolveRelocationRecord`、`completeScriptRelocation`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as fs from 'fs'
import * as path from 'path'
import { localize } from '../i18n/Localization'
import { canonicalBookmarkPath } from '../util/BookmarkPath'
import { createOperationId } from '../util/ScriptIdentity'
import { isJsonRecord } from '../util/JsonRecord'
import { atomicWriteFile } from '../util/AtomicFile'
import {
	persistLegacyJsonMigration,
	removeLegacyJsonMigrationBackup,
} from '../util/PersistenceMigration'
import {
	decodePersistenceRecord,
	persistenceHeader,
	PersistenceFormats,
	type PersistenceHeader,
} from '../util/PersistenceSchema'

const JOURNAL_DIRECTORY = '.script-relocations'

export interface ScriptRelocationRecord extends PersistenceHeader {
	id: string
	oldAbsolutePath: string
	newAbsolutePath: string
	oldBookmarkFolder: string
	newBookmarkFolder: string
	oldBookmarkPath: string
	newBookmarkPath: string
	createdAt: string
}

interface PendingScriptRelocation {
	record: ScriptRelocationRecord
	journalPath: string
}

interface ScriptRelocationInput {
	oldAbsolutePath: string
	newAbsolutePath: string
	oldBookmarkFolder: string
	newBookmarkFolder: string
	oldBookmarkPath: string
	newBookmarkPath: string
}

function isSafeRelativeFolder(value: string): boolean {
	if (value === '') return true
	if (path.isAbsolute(value)) return false
	const normalized = path.normalize(value)
	return normalized !== '..' && !normalized.startsWith(`..${path.sep}`)
}

function parseRecord(value: unknown): ScriptRelocationRecord | undefined {
	if (!isJsonRecord(value) || typeof value.id !== 'string') return undefined
	const oldAbsolutePath = value.oldAbsolutePath
	const newAbsolutePath = value.newAbsolutePath
	const oldBookmarkFolder = value.oldBookmarkFolder
	const newBookmarkFolder = value.newBookmarkFolder
	const oldBookmarkPath = value.oldBookmarkPath
	const newBookmarkPath = value.newBookmarkPath
	const createdAt = value.createdAt
	if (typeof oldAbsolutePath !== 'string' || typeof newAbsolutePath !== 'string'
		|| typeof oldBookmarkFolder !== 'string' || typeof newBookmarkFolder !== 'string'
		|| typeof oldBookmarkPath !== 'string' || typeof newBookmarkPath !== 'string'
		|| typeof createdAt !== 'string') return undefined
	if (!path.isAbsolute(oldAbsolutePath) || !path.isAbsolute(newAbsolutePath)) return undefined
	if (!isSafeRelativeFolder(oldBookmarkFolder) || !isSafeRelativeFolder(newBookmarkFolder)) return undefined
	return {
		...persistenceHeader(PersistenceFormats.scriptRelocation),
		id: value.id,
		oldAbsolutePath: path.resolve(oldAbsolutePath),
		newAbsolutePath: path.resolve(newAbsolutePath),
		oldBookmarkFolder,
		newBookmarkFolder,
		oldBookmarkPath: canonicalBookmarkPath(oldBookmarkPath),
		newBookmarkPath: canonicalBookmarkPath(newBookmarkPath),
		createdAt,
	}
}

export async function createScriptRelocation(
	storageRoot: string,
	value: ScriptRelocationInput,
): Promise<PendingScriptRelocation> {
	const root = path.resolve(storageRoot)
	const oldBookmarkFolder = path.relative(root, path.resolve(value.oldBookmarkFolder))
	const newBookmarkFolder = path.relative(root, path.resolve(value.newBookmarkFolder))
	if (!isSafeRelativeFolder(oldBookmarkFolder) || !isSafeRelativeFolder(newBookmarkFolder)) {
		throw new Error(localize(
			'书签转移目录必须位于当前书签存储根目录内',
			'The bookmark transfer directory must be inside the current bookmark storage root.',
		))
	}
	const record: ScriptRelocationRecord = {
		...persistenceHeader(PersistenceFormats.scriptRelocation),
		id: createOperationId(),
		oldAbsolutePath: path.resolve(value.oldAbsolutePath),
		newAbsolutePath: path.resolve(value.newAbsolutePath),
		oldBookmarkFolder,
		newBookmarkFolder,
		oldBookmarkPath: canonicalBookmarkPath(value.oldBookmarkPath),
		newBookmarkPath: canonicalBookmarkPath(value.newBookmarkPath),
		createdAt: new Date().toISOString(),
	}
	const journalPath = path.join(root, JOURNAL_DIRECTORY, `${record.id}.json`)
	await atomicWriteFile(journalPath, JSON.stringify(record, null, 2))
	return { record, journalPath }
}

export async function readPendingScriptRelocations(storageRoot: string): Promise<PendingScriptRelocation[]> {
	const directory = path.join(path.resolve(storageRoot), JOURNAL_DIRECTORY)
	let files: string[]
	try {
		files = await fs.promises.readdir(directory)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
		throw error
	}
	const pending: PendingScriptRelocation[] = []
	for (const file of files.sort()) {
		if (!file.endsWith('.json')) continue
		const journalPath = path.join(directory, file)
		try {
			const decoded = decodePersistenceRecord(
				JSON.parse(await fs.promises.readFile(journalPath, 'utf8')),
				PersistenceFormats.scriptRelocation,
			)
			const record = parseRecord(decoded.value)
			if (record) {
				if (decoded.migrated) {
					await persistLegacyJsonMigration(journalPath, record, async (target, migrated) => {
						await atomicWriteFile(target, JSON.stringify(migrated, null, 2))
						return true
					})
				}
				pending.push({ record, journalPath })
			}
		} catch {
			// 保留损坏的日志原文件，便于用户或维护工具进行人工恢复。
		}
	}
	return pending
}

export function resolveRelocationRecord(storageRoot: string, record: ScriptRelocationRecord): ScriptRelocationRecord {
	const root = path.resolve(storageRoot)
	return {
		...record,
		oldBookmarkFolder: path.resolve(root, record.oldBookmarkFolder),
		newBookmarkFolder: path.resolve(root, record.newBookmarkFolder),
	}
}

export async function completeScriptRelocation(journalPath: string): Promise<void> {
	await fs.promises.unlink(journalPath)
	await removeLegacyJsonMigrationBackup(journalPath)
	try {
		await fs.promises.rmdir(path.dirname(journalPath))
	} catch {
		// 仍有其他待处理日志时目录会保持非空，此处无需视为清理失败。
	}
}

export async function executeScriptRelocation<T>(
	storageRoot: string,
	value: ScriptRelocationInput,
	operation: (record: ScriptRelocationRecord) => Promise<T>,
): Promise<T> {
	const pending = await createScriptRelocation(storageRoot, value)
	const result = await operation(resolveRelocationRecord(storageRoot, pending.record))
	await completeScriptRelocation(pending.journalPath)
	return result
}
