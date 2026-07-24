/**
 * 根据旧路径、新路径与候选集合推导文件或目录移动计划，并识别冲突与无需操作项。
 * 计划阶段没有磁盘副作用，仓库可以完整审查后再交给重定位事务执行。
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
