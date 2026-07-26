/**
 * 对规范化工作区路径计算稳定短哈希，用作不同工作区持久化文件的隔离标识。
 * 哈希只用于命名和分区，不替代脚本 UUID 或内容指纹。
 */
import * as path from 'path'
import { sha256Hex } from './Sha256'

export function stableWorkspacePathHash(input: string): string {
	const normalized = path.resolve(input).replace(/\\/g, '/')
	return sha256Hex(normalized).slice(0, 16)
}
