/**
 * 计算便携包用于跨设备识别源码的两类摘要。
 * 原始摘要识别完全相同的文件；规范化摘要忽略 BOM、换行和 Unicode 组合形式差异，但不忽略实际代码字符。
 * 两种摘要各自保留证据强度，让跨系统匹配兼容文本表示差异而不放宽代码内容判断。
 */
import * as fs from 'fs'
import { sha256Hex } from '../util/Sha256'

export interface PortableSourceFingerprint {
	sha256: string
	normalizedSha256?: string
}

function decodeSource(content: Buffer): string | undefined {
	if (content.length >= 2 && content[0] === 0xff && content[1] === 0xfe) {
		return content.subarray(2).toString('utf16le')
	}
	if (content.length >= 2 && content[0] === 0xfe && content[1] === 0xff) {
		const swapped = Buffer.allocUnsafe(content.length - 2)
		for (let index = 2; index + 1 < content.length; index += 2) {
			swapped[index - 2] = content[index + 1]
			swapped[index - 1] = content[index]
		}
		return swapped.toString('utf16le')
	}
	if (content.includes(0)) return undefined
	const start = content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf ? 3 : 0
	return content.subarray(start).toString('utf8')
}

export function normalizePortableSourceText(content: string): string {
	return content.normalize('NFC').replace(/\r\n?/g, '\n')
}

export async function fingerprintPortableSource(filePath: string): Promise<PortableSourceFingerprint | undefined> {
	try {
		const content = await fs.promises.readFile(filePath)
		const text = decodeSource(content)
		return {
			sha256: sha256Hex(content),
			normalizedSha256: text === undefined ? undefined : sha256Hex(normalizePortableSourceText(text)),
		}
	} catch {
		return undefined
	}
}
