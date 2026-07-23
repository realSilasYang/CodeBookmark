/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `BookmarkPath`。
 *
 * 实现要点：统一路径规范化、比较和作用域判断，消除平台分隔符与大小写差异。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`canonicalBookmarkPath`、`bookmarkPathKey`、`isSameOrDescendantBookmarkPath`、`renamedBookmarkPath`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as path from 'path'

export function canonicalBookmarkPath(value: string): string {
	const slashed = value.replace(/\\/g, '/')
	const normalized = path.posix.normalize(slashed)
	if (normalized === '.') return ''
	return normalized.replace(/^\.\//, '').replace(/\/$/, '')
}

export function bookmarkPathKey(value: string): string {
	return canonicalBookmarkPath(value)
}

export function isSameOrDescendantBookmarkPath(candidate: string, target: string): boolean {
	const candidateKey = bookmarkPathKey(candidate)
	const targetKey = bookmarkPathKey(target)
	if (targetKey === '') return candidateKey === '' || (!path.posix.isAbsolute(candidateKey) && !/^[a-z]:\//i.test(candidateKey))
	return candidateKey === targetKey || candidateKey.startsWith(`${targetKey}/`)
}

export function renamedBookmarkPath(candidate: string, oldPath: string, newPath: string): string {
	const canonicalCandidate = canonicalBookmarkPath(candidate)
	const canonicalOld = canonicalBookmarkPath(oldPath)
	const canonicalNew = canonicalBookmarkPath(newPath)
	const suffix = canonicalOld === ''
		? canonicalCandidate
		: canonicalCandidate.slice(canonicalOld.length).replace(/^\/+/, '')
	return canonicalBookmarkPath([canonicalNew, suffix].filter(Boolean).join('/'))
}
