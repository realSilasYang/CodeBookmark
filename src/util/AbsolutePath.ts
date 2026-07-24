/**
 * 统一处理操作系统绝对路径的规范化、大小写比较、后代判断和重命名映射。
 * 这些函数面向真实磁盘路径，与使用正斜杠的书签持久化路径刻意分开。
 */
import * as path from 'path'

export function normalizedAbsolutePath(value: string): string {
	return path.resolve(value)
}

export function absolutePathKey(value: string): string {
	return normalizedAbsolutePath(value)
}

export function isSameOrDescendantAbsolutePath(candidate: string, target: string): boolean {
	const relative = path.relative(normalizedAbsolutePath(target), normalizedAbsolutePath(candidate))
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function renamedAbsolutePath(candidate: string, oldPath: string, newPath: string): string {
	const relative = path.relative(normalizedAbsolutePath(oldPath), normalizedAbsolutePath(candidate))
	return normalizedAbsolutePath(path.join(newPath, relative))
}
