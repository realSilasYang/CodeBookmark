import * as path from 'path'
import { normalizedAbsolutePath } from '../util/AbsolutePath'
import { isJsonRecord } from '../util/JsonRecord'
import {
	decodePersistenceRecord,
	persistenceHeader,
	PersistenceFormats,
	type PersistenceHeader,
} from '../util/PersistenceSchema'
import { isScriptId, type SourceFingerprint } from '../util/ScriptIdentity'
import type { ScriptMetadata } from './ScriptIndex'

export interface BookmarkFileEnvelope extends PersistenceHeader {
	script: ScriptMetadata
	bookmarks: unknown[]
	[key: string]: unknown
}

export function bookmarkItems(value: unknown): unknown[] | undefined {
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

export function scriptMetadata(value: unknown): ScriptMetadata | undefined {
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

export function decodeScriptConfiguration(value: unknown): {
	data: BookmarkFileEnvelope
	migrated: boolean
} {
	const decoded = decodePersistenceRecord(value, PersistenceFormats.script)
	return { data: decoded.value as BookmarkFileEnvelope, migrated: decoded.migrated }
}

export function createScriptEnvelope(
	script: ScriptMetadata,
	bookmarks: unknown[],
): BookmarkFileEnvelope {
	return {
		...persistenceHeader(PersistenceFormats.script),
		script,
		bookmarks,
	}
}
