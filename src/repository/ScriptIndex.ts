import { absolutePathKey } from '../util/AbsolutePath'
import type { SourceFingerprint } from '../util/ScriptIdentity'

export interface ScriptMetadata {
	id: string
	path: string
	fingerprint?: SourceFingerprint
	lastSeenAt: number
	missingSince?: number
	orderIndex?: number
}

export interface ScriptIndexEntry {
	id: string
	filePath: string
	metadata: ScriptMetadata
}

/**
 * In-memory lookup tables for persisted script configurations.
 *
 * The index deliberately owns no file I/O or relocation policy. It only keeps
 * the three equivalent lookup views consistent while a repository operation
 * updates or removes an entry.
 */
export class ScriptIndex {
	private readonly entriesById = new Map<string, ScriptIndexEntry>()
	private readonly entryIdsByPath = new Map<string, Set<string>>()
	private readonly entryIdsByFingerprint = new Map<string, Set<string>>()
	private indexedStorageRoot: string | undefined
	private ready = false

	get storageRootKey(): string | undefined {
		return this.indexedStorageRoot
	}

	get isReady(): boolean {
		return this.ready
	}

	set isReady(value: boolean) {
		this.ready = value
	}

	reset(storageRootKey: string): void {
		this.indexedStorageRoot = storageRootKey
		this.ready = false
		this.entriesById.clear()
		this.entryIdsByPath.clear()
		this.entryIdsByFingerprint.clear()
	}

	markReady(): void {
		this.ready = true
	}

	invalidate(): void {
		this.ready = false
	}

	get(id: string): ScriptIndexEntry | undefined {
		return this.entriesById.get(id)
	}

	has(id: string): boolean {
		return this.entriesById.has(id)
	}

	values(): ScriptIndexEntry[] {
		return [...this.entriesById.values()]
	}

	remove(id: string): void {
		const previous = this.entriesById.get(id)
		if (!previous) return
		this.entriesById.delete(id)

		const pathKey = absolutePathKey(previous.metadata.path)
		const pathIds = this.entryIdsByPath.get(pathKey)
		pathIds?.delete(id)
		if (pathIds?.size === 0) this.entryIdsByPath.delete(pathKey)

		const fingerprintKey = this.fingerprintKey(previous.metadata.fingerprint)
		if (fingerprintKey) {
			const fingerprintIds = this.entryIdsByFingerprint.get(fingerprintKey)
			fingerprintIds?.delete(id)
			if (fingerprintIds?.size === 0) this.entryIdsByFingerprint.delete(fingerprintKey)
		}
	}

	set(entry: ScriptIndexEntry): void {
		this.remove(entry.id)
		this.entriesById.set(entry.id, entry)

		const pathKey = absolutePathKey(entry.metadata.path)
		const pathIds = this.entryIdsByPath.get(pathKey) ?? new Set<string>()
		pathIds.add(entry.id)
		this.entryIdsByPath.set(pathKey, pathIds)

		const fingerprintKey = this.fingerprintKey(entry.metadata.fingerprint)
		if (fingerprintKey) {
			const fingerprintIds = this.entryIdsByFingerprint.get(fingerprintKey) ?? new Set<string>()
			fingerprintIds.add(entry.id)
			this.entryIdsByFingerprint.set(fingerprintKey, fingerprintIds)
		}
	}

	byPath(absolutePath: string): ScriptIndexEntry[] {
		const ids = this.entryIdsByPath.get(absolutePathKey(absolutePath))
		return ids ? [...ids].flatMap(id => this.entriesById.get(id) ?? []) : []
	}

	byFingerprint(fingerprint: SourceFingerprint): ScriptIndexEntry[] {
		const key = this.fingerprintKey(fingerprint)
		if (!key) return []
		const ids = this.entryIdsByFingerprint.get(key)
		return ids ? [...ids].flatMap(id => this.entriesById.get(id) ?? []) : []
	}

	private fingerprintKey(fingerprint: SourceFingerprint | undefined): string | undefined {
		return fingerprint ? `${fingerprint.size}\0${fingerprint.sha256}` : undefined
	}
}
