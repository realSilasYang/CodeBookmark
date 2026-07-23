/**
 * 模块说明：本文件负责持久化、索引与迁移事务，具体对象为 `ScriptIndex`。
 *
 * 实现要点：围绕脚本配置的读取、索引、迁移或恢复拆分单一职责，并由仓库统一提交副作用。
 * 核心边界：所有磁盘状态都必须经过校验与原子化处理，不能让部分写入覆盖仍有效的用户数据。
 * 主要入口：`ScriptMetadata`、`ScriptIndexEntry`、`ScriptIndex`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
}

export interface ScriptIndexEntry {
	id: string
	filePath: string
	metadata: ScriptMetadata
}

/**
 * 为已持久化的脚本配置维护内存查找表。
 *
 * 索引有意不负责文件 I/O 或重定位策略；仓库更新、删除条目时，
 * 它只保证三种等价查找视图始终一致。
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
