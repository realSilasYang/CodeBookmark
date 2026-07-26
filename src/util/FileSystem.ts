/**
 * 汇集不带业务语义的文件系统边界，供仓库和迁移流程统一使用。
 * 存在性探测会把任何访问失败视为不可用；可选读取只忽略“文件不存在”，权限、损坏设备等真实异常仍交给调用方处理。
 */
import * as fs from 'fs'

export function fileSystemErrorCode(error: unknown): string | undefined {
	if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
	const code = (error as NodeJS.ErrnoException).code
	return typeof code === 'string' ? code : undefined
}

export function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
	return fileSystemErrorCode(error) === 'ENOENT'
}

export async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.promises.access(filePath)
		return true
	} catch {
		return false
	}
}

export async function readFileIfExists(filePath: string): Promise<Buffer | undefined> {
	try {
		return await fs.promises.readFile(filePath)
	} catch (error) {
		if (isFileNotFoundError(error)) return undefined
		throw error
	}
}
