/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `PersistenceMigration`。
 *
 * 实现要点：集中实现 `PersistenceMigration` 的无界面规则和边界处理，供多个上层流程复用。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`removeLegacyJsonMigrationBackup`、`persistLegacyJsonMigration`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
