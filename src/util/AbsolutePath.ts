/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `AbsolutePath`。
 *
 * 实现要点：统一路径规范化、比较和作用域判断，消除平台分隔符与大小写差异。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`normalizedAbsolutePath`、`absolutePathKey`、`isSameOrDescendantAbsolutePath`、`renamedAbsolutePath`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
