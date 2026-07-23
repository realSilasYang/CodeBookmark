/**
 * 模块说明：本文件负责持久化、索引与迁移事务，具体对象为 `ScriptRelocationPlan`。
 *
 * 实现要点：把当前状态转换为无副作用执行计划，实际 I/O 由调用方按计划提交。
 * 核心边界：所有磁盘状态都必须经过校验与原子化处理，不能让部分写入覆盖仍有效的用户数据。
 * 主要入口：`inferDirectoryRelocation`、`planScriptRelocation`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import {
	absolutePathKey,
	isSameOrDescendantAbsolutePath,
	normalizedAbsolutePath,
	renamedAbsolutePath,
} from '../util/AbsolutePath'
import type { ScriptIndexEntry } from './ScriptIndex'

interface ScriptRelocationTarget {
	entry: ScriptIndexEntry
	targetPath: string
}

export function inferDirectoryRelocation(
	entries: readonly ScriptIndexEntry[],
	oldAbsolutePath: string,
): boolean {
	return entries.some(entry =>
		absolutePathKey(entry.metadata.path) !== absolutePathKey(oldAbsolutePath)
		&& isSameOrDescendantAbsolutePath(entry.metadata.path, oldAbsolutePath))
}

export function planScriptRelocation(
	entries: readonly ScriptIndexEntry[],
	oldAbsolutePath: string,
	newAbsolutePath: string,
	destinationIsDirectory: boolean,
): ScriptRelocationTarget[] {
	return entries
		.filter(entry => destinationIsDirectory
			? isSameOrDescendantAbsolutePath(entry.metadata.path, oldAbsolutePath)
			: absolutePathKey(entry.metadata.path) === absolutePathKey(oldAbsolutePath))
		.map(entry => ({
			entry,
			targetPath: destinationIsDirectory
				? renamedAbsolutePath(entry.metadata.path, oldAbsolutePath, newAbsolutePath)
				: normalizedAbsolutePath(newAbsolutePath),
		}))
}
