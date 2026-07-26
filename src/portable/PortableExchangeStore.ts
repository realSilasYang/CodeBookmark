/**
 * 保存便携包系列与当前本地作用域的对应关系，使多台设备往返导出时延续同一交换身份。
 * 记录属于正在使用的功能状态而非历史残留；每次写入都以临时文件替换，失败不会破坏上一版。
 */
import * as fs from 'fs'
import * as path from 'path'
import { isJsonRecord } from '../util/JsonRecord'
import { isScriptId } from '../util/ScriptIdentity'
import { decodePortableScript, MAX_PORTABLE_SCRIPTS, type PortableScript } from './PortablePackage'
import { atomicWriteFile } from '../util/AtomicFile'
import { isFileNotFoundError, readFileIfExists } from '../util/FileSystem'
import { sha256Hex } from '../util/Sha256'

const EXCHANGE_RECORD_FORMAT = 'codebookmark.portable-exchange'
const EXCHANGE_RECORD_VERSION = 1

export interface PortableExchangeRecord {
	format: typeof EXCHANGE_RECORD_FORMAT
	schemaVersion: typeof EXCHANGE_RECORD_VERSION
	exchangeId: string
	scopeKey: string
	lastRevisionId: string
	updatedAt: number
	scriptMappings: Record<string, string>
	bookmarkMappings: Record<string, string>
	baseScripts: PortableScript[]
}

function scopeHash(scopeKey: string): string {
	return sha256Hex(scopeKey).slice(0, 16)
}

function recordPath(storageRoot: string, exchangeId: string, scopeKey: string): string {
	return path.join(storageRoot, 'exchanges', `${exchangeId}_${scopeHash(scopeKey)}.json`)
}

export function decodePortableExchangeRecord(value: unknown): PortableExchangeRecord {
	if (!isJsonRecord(value) || value.format !== EXCHANGE_RECORD_FORMAT || value.schemaVersion !== EXCHANGE_RECORD_VERSION
		|| !isScriptId(value.exchangeId) || !isScriptId(value.lastRevisionId)
		|| typeof value.scopeKey !== 'string' || value.scopeKey.length === 0 || value.scopeKey.length > 32_768
		|| typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt) || value.updatedAt <= 0
		|| !Array.isArray(value.baseScripts) || value.baseScripts.length > MAX_PORTABLE_SCRIPTS
		|| !isJsonRecord(value.scriptMappings) || !isJsonRecord(value.bookmarkMappings)) {
		throw new Error('Portable exchange record is invalid')
	}
	const stringMap = (source: Record<string, unknown>): Record<string, string> => {
		const output: Record<string, string> = {}
		const localIds = new Set<string>()
		for (const [key, item] of Object.entries(source)) {
			if (!isScriptId(key) || !isScriptId(item) || localIds.has(item)) {
				throw new Error('Portable exchange identity mapping is invalid')
			}
			output[key] = item
			localIds.add(item)
		}
		return output
	}
	const scriptMappings = stringMap(value.scriptMappings)
	const baseIds = new Set<string>()
	const baseScripts = value.baseScripts.map(raw => {
		if (!isJsonRecord(raw) || !isScriptId(raw.scriptId) || baseIds.has(raw.scriptId)
			|| scriptMappings[raw.scriptId] === undefined) {
			throw new Error('Portable exchange base script is invalid')
		}
		baseIds.add(raw.scriptId)
		return decodePortableScript(raw, raw.scriptId)
	})
	return {
		format: EXCHANGE_RECORD_FORMAT,
		schemaVersion: EXCHANGE_RECORD_VERSION,
		exchangeId: value.exchangeId,
		scopeKey: value.scopeKey,
		lastRevisionId: value.lastRevisionId,
		updatedAt: value.updatedAt,
		scriptMappings,
		bookmarkMappings: stringMap(value.bookmarkMappings),
		baseScripts,
	}
}

export async function readPortableExchangeRecord(
	storageRoot: string,
	exchangeId: string,
	scopeKey: string,
): Promise<PortableExchangeRecord | undefined> {
	try {
		return decodePortableExchangeRecord(JSON.parse(await fs.promises.readFile(recordPath(storageRoot, exchangeId, scopeKey), 'utf8')))
	} catch (error) {
		if (isFileNotFoundError(error)) return undefined
		throw error
	}
}

export async function findPortableExchangeRecordForScope(
	storageRoot: string,
	scopeKey: string,
): Promise<PortableExchangeRecord | undefined> {
	const folder = path.join(storageRoot, 'exchanges')
	let names: string[]
	try { names = await fs.promises.readdir(folder) } catch (error) {
		if (isFileNotFoundError(error)) return undefined
		throw error
	}
	const suffix = `_${scopeHash(scopeKey)}.json`
	const records: PortableExchangeRecord[] = []
	for (const name of names.filter(candidate => candidate.endsWith(suffix))) {
		try {
			const record = decodePortableExchangeRecord(JSON.parse(await fs.promises.readFile(path.join(folder, name), 'utf8')))
			if (record.scopeKey === scopeKey) records.push(record)
		} catch {
			// 单条损坏记录不能阻止用户为当前作用域创建新的交换系列。
		}
	}
	return records.sort((left, right) => right.updatedAt - left.updatedAt)[0]
}

export async function writePortableExchangeRecord(
	storageRoot: string,
	record: PortableExchangeRecord,
): Promise<() => Promise<void>> {
	const target = recordPath(storageRoot, record.exchangeId, record.scopeKey)
	const previous = await readFileIfExists(target)
	await atomicWriteFile(target, `${JSON.stringify(record, null, 2)}\n`)
	return async () => {
		if (previous) await atomicWriteFile(target, previous)
		else await fs.promises.rm(target, { force: true })
	}
}

export function newPortableExchangeRecord(
	exchangeId: string,
	scopeKey: string,
	revisionId: string,
	scripts: readonly PortableScript[],
	scriptMappings: Record<string, string>,
	bookmarkMappings: Record<string, string>,
): PortableExchangeRecord {
	return {
		format: EXCHANGE_RECORD_FORMAT,
		schemaVersion: EXCHANGE_RECORD_VERSION,
		exchangeId,
		scopeKey,
		lastRevisionId: revisionId,
		updatedAt: Date.now(),
		scriptMappings,
		bookmarkMappings,
		baseScripts: scripts.map(script => structuredClone(script)),
	}
}
