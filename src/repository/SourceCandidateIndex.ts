/**
 * 模块说明：本文件负责持久化、索引与迁移事务，具体对象为 `SourceCandidateIndex`。
 *
 * 实现要点：围绕脚本配置的读取、索引、迁移或恢复拆分单一职责，并由仓库统一提交副作用。
 * 核心边界：所有磁盘状态都必须经过校验与原子化处理，不能让部分写入覆盖仍有效的用户数据。
 * 主要入口：`SourceCandidate`、`SourceCandidateIndex`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as fs from 'fs'
import * as path from 'path'
import { normalizedAbsolutePath } from '../util/AbsolutePath'
import { SOURCE_SCAN_EXCLUDED_DIRECTORIES } from '../util/SourceFilePolicy'
import type { SourceFingerprint } from '../util/ScriptIdentity'

export interface SourceCandidate {
	path: string
	stat: fs.Stats
	baseNameKey: string
	extension: string
	fileSystemIdentity?: string
}

const SOURCE_CANDIDATE_STAT_CONCURRENCY = 16
const MAX_SOURCE_CONTENT_CACHE_BYTES = 32 * 1024 * 1024

export class SourceCandidateIndex {
	readonly all: SourceCandidate[]
	readonly bySize = new Map<number, SourceCandidate[]>()
	readonly byBaseName = new Map<string, SourceCandidate[]>()
	readonly byExtension = new Map<string, SourceCandidate[]>()
	readonly byFileSystemIdentity = new Map<string, SourceCandidate[]>()
	readonly fingerprints = new Map<string, SourceFingerprint | undefined>()
	private readonly contents = new Map<string, string | undefined>()
	private contentBytes = 0

	private constructor(candidates: SourceCandidate[]) {
		this.all = candidates
		for (const candidate of candidates) {
			this.add(this.bySize, candidate.stat.size, candidate)
			this.add(this.byBaseName, candidate.baseNameKey, candidate)
			this.add(this.byExtension, candidate.extension, candidate)
			if (candidate.fileSystemIdentity) {
				this.add(this.byFileSystemIdentity, candidate.fileSystemIdentity, candidate)
			}
		}
	}

	private add<K>(map: Map<K, SourceCandidate[]>, key: K, candidate: SourceCandidate): void {
		const values = map.get(key) ?? []
		values.push(candidate)
		map.set(key, values)
	}

	static async fromPaths(
		paths: readonly string[],
		checkCancelled: () => void,
	): Promise<SourceCandidateIndex> {
		const sortedPaths = [...new Set(paths.map(normalizedAbsolutePath))]
			.sort((left, right) => left.localeCompare(right))
		const candidates: Array<SourceCandidate | undefined> = new Array(sortedPaths.length)
		let cursor = 0
		const worker = async (): Promise<void> => {
			while (cursor < sortedPaths.length) {
				const index = cursor++
				const candidatePath = sortedPaths[index]
				checkCancelled()
				try {
					const stat = await fs.promises.stat(candidatePath)
					checkCancelled()
					if (!stat.isFile()) continue
					candidates[index] = {
						path: candidatePath,
						stat,
						baseNameKey: path.basename(candidatePath),
						extension: path.extname(candidatePath).toLowerCase(),
						fileSystemIdentity: `${String(stat.dev)}\0${String(stat.ino)}`,
					}
				} catch {
					checkCancelled()
				}
			}
		}
		await Promise.all(Array.from(
			{ length: Math.min(SOURCE_CANDIDATE_STAT_CONCURRENCY, sortedPaths.length) },
			() => worker(),
		))
		return new SourceCandidateIndex(
			candidates.filter((candidate): candidate is SourceCandidate => candidate !== undefined),
		)
	}

	static async scan(root: string, checkCancelled: () => void): Promise<SourceCandidateIndex> {
		const files: string[] = []
		let entriesSeen = 0
		const visit = async (folder: string): Promise<void> => {
			checkCancelled()
			if (entriesSeen > 50_000) return
			let entries: fs.Dirent[]
			try {
				entries = await fs.promises.readdir(folder, { withFileTypes: true })
			} catch {
				checkCancelled()
				return
			}
			checkCancelled()
			entriesSeen += entries.length
			for (const entry of entries) {
				checkCancelled()
				if (entriesSeen > 50_000) return
				const candidate = path.join(folder, entry.name)
				if (entry.isDirectory() && !SOURCE_SCAN_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) {
					await visit(candidate)
				} else if (entry.isFile()) {
					files.push(candidate)
				}
			}
		}
		await visit(root)
		return this.fromPaths(files, checkCancelled)
	}

	async readContent(candidatePath: string): Promise<string | undefined> {
		if (this.contents.has(candidatePath)) {
			const cached = this.contents.get(candidatePath)
			this.contents.delete(candidatePath)
			this.contents.set(candidatePath, cached)
			return cached
		}
		let content: string | undefined
		try {
			content = await fs.promises.readFile(candidatePath, 'utf8')
		} catch {
			content = undefined
		}
		if (content === undefined) {
			this.contents.set(candidatePath, undefined)
			return undefined
		}
		const bytes = Buffer.byteLength(content)
		if (bytes <= MAX_SOURCE_CONTENT_CACHE_BYTES) {
			while (this.contentBytes + bytes > MAX_SOURCE_CONTENT_CACHE_BYTES) {
				const oldestPath = this.contents.keys().next().value as string | undefined
				if (oldestPath === undefined) break
				const oldest = this.contents.get(oldestPath)
				this.contents.delete(oldestPath)
				if (oldest !== undefined) this.contentBytes -= Buffer.byteLength(oldest)
			}
			this.contents.set(candidatePath, content)
			this.contentBytes += bytes
		}
		return content
	}
}
