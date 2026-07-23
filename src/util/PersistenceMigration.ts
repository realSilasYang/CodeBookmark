import * as fs from 'fs'

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
