/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `FileChangeFingerprint`。
 *
 * 实现要点：计算并缓存内容特征，为变化检测、重复消除和移动恢复提供证据。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`hashContent`、`fileChangeFingerprints`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

const DELETED_HASH = '<deleted>'

function fileKey(filePath: string): string {
	return path.resolve(filePath)
}

export function hashContent(content: string): string {
	return crypto.createHash('sha256').update(content).digest('hex')
}

async function readContentHash(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256')
		const stream = fs.createReadStream(filePath)
		stream.on('data', chunk => hash.update(chunk))
		stream.on('end', () => resolve(hash.digest('hex')))
		stream.on('error', (error: NodeJS.ErrnoException) => {
			if (error.code === 'ENOENT') resolve(DELETED_HASH)
			else reject(error)
		})
	})
}

class FileChangeFingerprintTracker {
	private selfWrittenHashes = new Map<string, string>()
	private knownFileHashes = new Map<string, string>()

	rememberContent(filePath: string, content: string): void {
		this.knownFileHashes.set(fileKey(filePath), hashContent(content))
	}

	async prepareWrite(filePath: string, content: string): Promise<{ contentHash: string, expectedDiskHash: string } | undefined> {
		const key = fileKey(filePath)
		const currentHash = await readContentHash(filePath)
		const knownHash = this.knownFileHashes.get(key)
		if ((knownHash === undefined && currentHash !== DELETED_HASH)
			|| (knownHash !== undefined && currentHash !== knownHash)) {
			return undefined
		}
		return {
			contentHash: this.markWriteIntent(filePath, content),
			expectedDiskHash: currentHash,
		}
	}

	async isCurrentHash(filePath: string, expectedHash: string): Promise<boolean> {
		return await readContentHash(filePath) === expectedHash
	}

	markWriteIntent(filePath: string, content: string): string {
		const hash = hashContent(content)
		this.selfWrittenHashes.set(fileKey(filePath), hash)
		return hash
	}

	markWriteComplete(filePath: string, hash: string): void {
		this.knownFileHashes.set(fileKey(filePath), hash)
	}

	markWriteFailed(filePath: string, hash: string): void {
		const key = fileKey(filePath)
		if (this.selfWrittenHashes.get(key) === hash) this.selfWrittenHashes.delete(key)
	}

	markDeleteIntent(filePath: string): void {
		this.selfWrittenHashes.set(fileKey(filePath), DELETED_HASH)
	}

	markDeleteComplete(filePath: string): void {
		this.knownFileHashes.set(fileKey(filePath), DELETED_HASH)
	}

	markDeleteFailed(filePath: string): void {
		const key = fileKey(filePath)
		if (this.selfWrittenHashes.get(key) === DELETED_HASH) this.selfWrittenHashes.delete(key)
	}

	async rememberDirectory(directory: string): Promise<void> {
		const directoryKey = `${fileKey(directory)}${path.sep}`
		for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
			if (!entry.isFile() || !entry.name.endsWith('.json')) continue
			const targetPath = path.join(directory, entry.name)
			const key = fileKey(targetPath)
			this.knownFileHashes.set(key, await readContentHash(targetPath))
		}
		for (const key of this.knownFileHashes.keys()) {
			if (key.startsWith(directoryKey) && !fs.existsSync(key)) {
				this.knownFileHashes.delete(key)
			}
		}
	}

	async hasExternalChange(directory: string, filename: string | null): Promise<boolean> {
		if (filename !== null) {
			return this.classifyFile(path.join(directory, filename))
		}
		return (await this.collectExternalChanges(directory)).length > 0
	}

	async collectExternalChanges(directory: string): Promise<string[]> {

		const currentFiles = new Set<string>()
		for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
			if (entry.isFile() && entry.name.endsWith('.json')) {
				currentFiles.add(fileKey(path.join(directory, entry.name)))
			}
		}

		const directoryKey = `${fileKey(directory)}${path.sep}`
		for (const key of this.knownFileHashes.keys()) {
			if (key.startsWith(directoryKey) && key.endsWith('.json')) currentFiles.add(key)
		}
		for (const key of this.selfWrittenHashes.keys()) {
			if (key.startsWith(directoryKey) && key.endsWith('.json')) currentFiles.add(key)
		}

		const changed: string[] = []
		for (const targetPath of currentFiles) {
			if (await this.classifyFile(targetPath)) changed.push(path.basename(targetPath))
		}
		return changed
	}

	private async classifyFile(filePath: string): Promise<boolean> {
		const key = fileKey(filePath)
		const currentHash = await readContentHash(filePath)
		const selfWrittenHash = this.selfWrittenHashes.get(key)
		if (selfWrittenHash === currentHash) {
			this.selfWrittenHashes.delete(key)
			this.knownFileHashes.set(key, currentHash)
			return false
		}

		if (selfWrittenHash !== undefined) this.selfWrittenHashes.delete(key)
		if (this.knownFileHashes.get(key) === currentHash) return false
		this.knownFileHashes.set(key, currentHash)
		return true
	}
}

export const fileChangeFingerprints = new FileChangeFingerprintTracker()
