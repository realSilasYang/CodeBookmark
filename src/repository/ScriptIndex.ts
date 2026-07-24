/**
 * 为已持久化脚本维护按 scriptId、源路径和配置路径查询的三套内存索引。
 * 索引不决定移动策略也不执行 I/O，只保证添加、替换和删除后各查询视图保持一致。
 */
import { absolutePathKey } from '../util/AbsolutePath'
import type { SourceFingerprint } from '../util/ScriptIdentity'

export interface ScriptMetadata {
	id: string
	path: string
	fingerprint?: SourceFingerprint
	lastSeenAt: number
	missingSince?: number
	orderIndex?: number
	presentation?: {
		label?: string
		icon?: string
	}
}

export interface ScriptIndexEntry {
	id: string
	filePath: string
	metadata: ScriptMetadata
}

/**
 * 同一脚本条目同时按 scriptId、源路径和配置路径建立索引。仓库负责何时读写或重定位，
 * 本类只保证任意一项被替换、删除后，另外两种查找方式看到的仍是同一份条目。
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
