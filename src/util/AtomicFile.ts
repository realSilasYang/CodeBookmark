/**
 * 通过同目录临时文件和重命名完成原子写入或复制，避免目标文件只写入一半。
 * 失败时尽力清理临时文件，但始终保留原始错误，便于判断真正的写入原因。
 */
import * as fs from 'fs'
import * as path from 'path'

export function temporarySiblingPath(target: string): string {
	return `${target}.${process.pid}.${Date.now()}.tmp`
}

async function removeTemporaryFile(temporaryPath: string): Promise<void> {
	try {
		await fs.promises.unlink(temporaryPath)
	} catch {
		// 临时文件可能尚未创建；清理不存在的文件不应覆盖原始写入错误。
	}
}

export async function atomicWriteFile(target: string, content: string | Buffer): Promise<void> {
	const temporaryPath = temporarySiblingPath(target)
	await fs.promises.mkdir(path.dirname(target), { recursive: true })
	try {
		await fs.promises.writeFile(temporaryPath, content)
		await fs.promises.rename(temporaryPath, target)
	} catch (error) {
		await removeTemporaryFile(temporaryPath)
		throw error
	}
}

export async function atomicCopyFile(source: string, target: string): Promise<void> {
	const temporaryPath = temporarySiblingPath(target)
	await fs.promises.mkdir(path.dirname(target), { recursive: true })
	try {
		await fs.promises.copyFile(source, temporaryPath)
		await fs.promises.rename(temporaryPath, target)
	} catch (error) {
		await removeTemporaryFile(temporaryPath)
		throw error
	}
}
