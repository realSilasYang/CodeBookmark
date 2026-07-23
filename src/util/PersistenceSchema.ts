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
