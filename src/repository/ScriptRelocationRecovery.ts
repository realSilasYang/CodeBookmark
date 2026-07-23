/**
 * 模块说明：本文件负责持久化、索引与迁移事务，具体对象为 `ScriptRelocationRecovery`。
 *
 * 实现要点：围绕脚本配置的读取、索引、迁移或恢复拆分单一职责，并由仓库统一提交副作用。
 * 核心边界：所有磁盘状态都必须经过校验与原子化处理，不能让部分写入覆盖仍有效的用户数据。
 * 主要入口：`recoverScriptRelocations`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import {
	completeScriptRelocation,
	readPendingScriptRelocations,
	resolveRelocationRecord,
	type ScriptRelocationRecord,
} from './ScriptRelocationJournal'

interface ScriptRelocationRecoveryPort {
	checkCancelled(): void
	pathExists(filePath: string): Promise<boolean>
	perform(record: ScriptRelocationRecord): Promise<void>
	reportFailure(record: ScriptRelocationRecord, error: unknown): void
}

function reverseRelocation(record: ScriptRelocationRecord): ScriptRelocationRecord {
	return {
		...record,
		oldAbsolutePath: record.newAbsolutePath,
		newAbsolutePath: record.oldAbsolutePath,
		oldBookmarkFolder: record.newBookmarkFolder,
		newBookmarkFolder: record.oldBookmarkFolder,
		oldBookmarkPath: record.newBookmarkPath,
		newBookmarkPath: record.oldBookmarkPath,
	}
}

export async function recoverScriptRelocations(
	storageRoot: string,
	port: ScriptRelocationRecoveryPort,
): Promise<void> {
	port.checkCancelled()
	const pendingRelocations = await readPendingScriptRelocations(storageRoot)
	port.checkCancelled()
	for (const pending of pendingRelocations) {
		port.checkCancelled()
		const resolved = resolveRelocationRecord(storageRoot, pending.record)
		const [oldExists, newExists] = await Promise.all([
			port.pathExists(resolved.oldAbsolutePath),
			port.pathExists(resolved.newAbsolutePath),
		])
		port.checkCancelled()
		const operation = oldExists && !newExists ? reverseRelocation(resolved) : resolved
		try {
			await port.perform(operation)
			await completeScriptRelocation(pending.journalPath)
		} catch (error) {
			port.reportFailure(resolved, error)
		}
		port.checkCancelled()
	}
}
