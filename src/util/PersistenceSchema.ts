/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `PersistenceSchema`。
 *
 * 实现要点：定义并校验结构化数据边界，拒绝缺失、越界或不受支持的字段组合。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`PersistenceFormats`、`PersistenceHeader`、`persistenceHeader`、`decodePersistenceRecord`、`versionPersistenceList`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import { isJsonRecord, type JsonRecord } from './JsonRecord'

const PERSISTENCE_SCHEMA_VERSION = 1 as const

export const PersistenceFormats = Object.freeze({
	script: 'codebookmark.script',
	workspaceOrder: 'codebookmark.workspace-order',
	scriptRelocation: 'codebookmark.script-relocation',
	storageTransfer: 'codebookmark.storage-transfer',
	undoSession: 'codebookmark.undo-session',
	recentIcons: 'codebookmark.recent-icons',
} as const)

type PersistenceFormat = typeof PersistenceFormats[keyof typeof PersistenceFormats]

export interface PersistenceHeader extends JsonRecord {
	format: PersistenceFormat
	schemaVersion: typeof PERSISTENCE_SCHEMA_VERSION
}

interface DecodedPersistence<T> {
	value: T
	migrated: boolean
}

export function persistenceHeader(format: PersistenceFormat): PersistenceHeader {
	return { format, schemaVersion: PERSISTENCE_SCHEMA_VERSION }
}

function hasVersionMarker(value: JsonRecord): boolean {
	return Object.hasOwn(value, 'format') || Object.hasOwn(value, 'schemaVersion')
}

function assertCurrentHeader(value: JsonRecord, expectedFormat: PersistenceFormat): void {
	if (value.format !== expectedFormat || value.schemaVersion !== PERSISTENCE_SCHEMA_VERSION) {
		throw new Error(`Unsupported persistence format: expected ${expectedFormat} v${PERSISTENCE_SCHEMA_VERSION}`)
	}
}

function versionPersistenceRecord<T extends JsonRecord>(
	format: PersistenceFormat,
	value: T,
): T & PersistenceHeader {
	return { ...value, ...persistenceHeader(format) }
}

export function decodePersistenceRecord(
	value: unknown,
	expectedFormat: PersistenceFormat,
): DecodedPersistence<JsonRecord & PersistenceHeader> {
	if (!isJsonRecord(value)) throw new Error(`Persistence value for ${expectedFormat} is not an object`)
	if (hasVersionMarker(value)) {
		assertCurrentHeader(value, expectedFormat)
		return { value: value as JsonRecord & PersistenceHeader, migrated: false }
	}
	return {
		value: versionPersistenceRecord(expectedFormat, value),
		migrated: true,
	}
}

export function versionPersistenceList(
	format: PersistenceFormat,
	key: string,
	items: readonly unknown[],
): JsonRecord & PersistenceHeader {
	return versionPersistenceRecord(format, { [key]: [...items] })
}

export function decodePersistenceList(
	value: unknown,
	expectedFormat: PersistenceFormat,
	key: string,
): DecodedPersistence<JsonRecord & PersistenceHeader> {
	if (Array.isArray(value)) {
		return { value: versionPersistenceList(expectedFormat, key, value), migrated: true }
	}
	const decoded = decodePersistenceRecord(value, expectedFormat)
	if (!Array.isArray(decoded.value[key])) {
		throw new Error(`Persistence value for ${expectedFormat} does not contain ${key}`)
	}
	return decoded
}
