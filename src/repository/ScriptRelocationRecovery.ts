/**
 * 启动时读取未完成的重定位日志，核对源、目标和索引状态后恢复事务。
 * 恢复遵循幂等步骤；已经完成的阶段不会重复覆盖，无法判断的状态会保留日志等待处理。
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
