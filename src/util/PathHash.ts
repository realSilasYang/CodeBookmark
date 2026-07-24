/**
 * 对规范化工作区路径计算稳定短哈希，用作不同工作区持久化文件的隔离标识。
 * 哈希只用于命名和分区，不替代脚本 UUID 或内容指纹。
 */
import * as crypto from 'crypto'
import * as path from 'path'

export function stableWorkspacePathHash(input: string): string {
	const normalized = path.resolve(input).replace(/\\/g, '/')
	return crypto
		.createHash('sha256')
		.update(normalized)
		.digest('hex')
		.slice(0, 16)
}
