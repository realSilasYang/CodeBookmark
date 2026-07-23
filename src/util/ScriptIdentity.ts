/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `ScriptIdentity`。
 *
 * 实现要点：生成、解析和比较稳定身份，使路径或设备变化不会破坏对象绑定。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`SourceFingerprint`、`createScriptId`、`createBookmarkId`、`createOperationId`、`isScriptId`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as crypto from 'crypto'
import * as fs from 'fs'

export interface SourceFingerprint {
	sha256: string
	size: number
	device?: string
	inode?: string
}

function createRandomIdentity(): string {
	const hex = crypto.randomBytes(16).toString('hex')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createScriptId(): string {
	return createRandomIdentity()
}

export function createBookmarkId(): string {
	return createRandomIdentity()
}

export function createOperationId(): string {
	return createRandomIdentity()
}

export function isScriptId(value: unknown): value is string {
	return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function fingerprintSourceFile(filePath: string): Promise<SourceFingerprint | undefined> {
	try {
		const stat = await fs.promises.stat(filePath)
		if (!stat.isFile()) return undefined
		const device = stat.dev === undefined ? '' : String(stat.dev)
		const inode = stat.ino === undefined ? '' : String(stat.ino)
		const sha256 = await new Promise<string>((resolve, reject) => {
			const hash = crypto.createHash('sha256')
			const stream = fs.createReadStream(filePath)
			stream.on('data', chunk => hash.update(chunk))
			stream.on('end', () => resolve(hash.digest('hex')))
			stream.on('error', reject)
		})
		const fingerprint: SourceFingerprint = {
			sha256,
			size: stat.size,
			device: device || undefined,
			inode: inode || undefined,
		}
		return fingerprint
	} catch {
		return undefined
	}
}
