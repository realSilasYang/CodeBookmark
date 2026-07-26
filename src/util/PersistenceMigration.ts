/**
 * 在首次升级无版本 JSON 时保存原文件备份，再以当前格式原子写回迁移结果。
 * 迁移成功后按数据类型决定是否保留备份；任何失败都不会覆盖仍可恢复的旧数据。
 */
import * as fs from 'fs'
import { atomicWriteFile } from './AtomicFile'

interface PersistenceMigrationResult {
	backupPath: string
}

function legacyJsonMigrationBackupPath(filePath: string): string {
	return `${filePath}.migration-v0.backup`
}

export async function removeLegacyJsonMigrationBackup(filePath: string): Promise<void> {
	await fs.promises.rm(legacyJsonMigrationBackupPath(filePath), { force: true })
}

export async function persistLegacyJsonMigration(
	filePath: string,
	versionedValue: unknown,
	write: (filePath: string, value: unknown) => Promise<boolean>,
): Promise<PersistenceMigrationResult> {
	const backupPath = legacyJsonMigrationBackupPath(filePath)
	try {
		await fs.promises.copyFile(filePath, backupPath, fs.constants.COPYFILE_EXCL)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
	}
	if (!await write(filePath, versionedValue)) {
		throw new Error(`Unable to persist migrated configuration: ${filePath}`)
	}
	return { backupPath }
}

export function persistLegacyJsonMigrationAtomically(
	filePath: string,
	versionedValue: unknown,
): Promise<PersistenceMigrationResult> {
	return persistLegacyJsonMigration(filePath, versionedValue, async (target, migrated) => {
		await atomicWriteFile(target, JSON.stringify(migrated, null, 2))
		return true
	})
}
