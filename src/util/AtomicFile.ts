/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `AtomicFile`。
 *
 * 实现要点：集中实现 `AtomicFile` 的无界面规则和边界处理，供多个上层流程复用。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`temporarySiblingPath`、`atomicWriteFile`、`atomicCopyFile`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
