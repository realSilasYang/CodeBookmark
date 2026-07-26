/**
 * 计算完整 SHA-256 十六进制摘要，统一归档、路径和配置目录的算法入口。
 * 调用方可以按自身命名需求截短，但不能各自改变摘要算法或十六进制编码。
 */
import * as crypto from 'crypto'

export function sha256Hex(content: string | Uint8Array): string {
	return crypto.createHash('sha256').update(content).digest('hex')
}
