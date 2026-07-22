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
