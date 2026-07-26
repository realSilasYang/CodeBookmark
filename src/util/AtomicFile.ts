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

async function promoteTemporaryFile(temporaryPath: string, target: string): Promise<void> {
	let directRenameError: unknown
	try {
		await fs.promises.rename(temporaryPath, target)
		return
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code
		if (process.platform !== 'win32' || (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EACCES')) throw error
		directRenameError = error
	}
	let targetStat: fs.Stats
	try { targetStat = await fs.promises.lstat(target) } catch { throw directRenameError }
	if (!targetStat.isFile()) throw directRenameError
	const backupPath = `${temporarySiblingPath(target)}.bak`
	let backedUp = false
	try {
		await fs.promises.rename(target, backupPath)
		backedUp = true
		await fs.promises.rename(temporaryPath, target)
		await removeTemporaryFile(backupPath)
	} catch (error) {
		if (backedUp) {
			try {
				await fs.promises.rename(backupPath, target)
			} catch {
				// 恢复失败时保留备份文件，避免把原目标内容一并删除。
			}
		}
		throw error
	}
}

async function atomicReplace(target: string, writeTemporary: (temporaryPath: string) => Promise<void>): Promise<void> {
	const temporaryPath = temporarySiblingPath(target)
	await fs.promises.mkdir(path.dirname(target), { recursive: true })
	try {
		await writeTemporary(temporaryPath)
		await promoteTemporaryFile(temporaryPath, target)
	} catch (error) {
		await removeTemporaryFile(temporaryPath)
		throw error
	}
}

export async function atomicWriteFile(target: string, content: string | Buffer): Promise<void> {
	await atomicReplace(target, temporaryPath => fs.promises.writeFile(temporaryPath, content))
}

export async function atomicCopyFile(source: string, target: string): Promise<void> {
	await atomicReplace(target, temporaryPath => fs.promises.copyFile(source, temporaryPath))
}
