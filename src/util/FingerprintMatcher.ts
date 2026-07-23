/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `FingerprintMatcher`。
 *
 * 实现要点：预处理候选特征并执行确定性评分，在重复内容中选择最可信结果。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`PreparedFingerprintContext`、`prepareFingerprintContext`、`scorePreparedFingerprintCandidate`、`getFingerprintContext`、`scoreFingerprintCandidate`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
interface FingerprintContext {
	before?: string
	after?: string
}

interface PreparedFingerprintText {
	normalized: string
	tokens: ReadonlySet<string>
}

export interface PreparedFingerprintContext {
	before?: PreparedFingerprintText
	after?: PreparedFingerprintText
}

function normalize(value: string | undefined): string {
	return (value ?? '').trim().replace(/\s+/g, ' ')
}

function similarity(expected: string | undefined, actual: string | undefined): number {
	const left = normalize(expected)
	const right = normalize(actual)
	if (!left || !right) return 0
	if (left === right) return 1
	if (left.includes(right) || right.includes(left)) return 0.5

	const leftTokens = new Set(left.split(/\W+/).filter(Boolean))
	const rightTokens = new Set(right.split(/\W+/).filter(Boolean))
	if (leftTokens.size === 0 || rightTokens.size === 0) return 0
	let intersection = 0
	for (const token of leftTokens) {
		if (rightTokens.has(token)) intersection++
	}
	return intersection / new Set([...leftTokens, ...rightTokens]).size
}

function prepareFingerprintText(value: string | undefined): PreparedFingerprintText | undefined {
	if (value === undefined) return undefined
	const normalized = normalize(value)
	return {
		normalized,
		tokens: new Set(normalized.split(/\W+/).filter(Boolean))
	}
}

export function prepareFingerprintContext(context: FingerprintContext): PreparedFingerprintContext {
	return {
		before: prepareFingerprintText(context.before),
		after: prepareFingerprintText(context.after)
	}
}

function preparedSimilarity(expected: PreparedFingerprintText | undefined, actual: PreparedFingerprintText | undefined): number {
	if (!expected || !actual || !expected.normalized || !actual.normalized) return 0
	if (expected.normalized === actual.normalized) return 1
	if (expected.normalized.includes(actual.normalized) || actual.normalized.includes(expected.normalized)) return 0.5
	if (expected.tokens.size === 0 || actual.tokens.size === 0) return 0
	let intersection = 0
	for (const token of expected.tokens) {
		if (actual.tokens.has(token)) intersection++
	}
	return intersection / (expected.tokens.size + actual.tokens.size - intersection)
}

export function scorePreparedFingerprintCandidate(
	originalLine: number,
	candidateLine: number,
	expected: PreparedFingerprintContext,
	actual: PreparedFingerprintContext
): number {
	const contextScore = preparedSimilarity(expected.before, actual.before) + preparedSimilarity(expected.after, actual.after)
	return contextScore * 1_000_000 - Math.abs(candidateLine - originalLine)
}

export function getFingerprintContext(lines: readonly string[], line: number, content: string): FingerprintContext {
	if (content.trim() !== '') {
		return {
			before: line > 0 ? lines[line - 1]?.trim() : undefined,
			after: line + 1 < lines.length ? lines[line + 1]?.trim() : undefined
		}
	}

	let before: string | undefined
	for (let current = line - 1; current >= 0; current--) {
		if (lines[current].trim() !== '') {
			before = lines[current].trim()
			break
		}
	}
	let after: string | undefined
	for (let current = line + 1; current < lines.length; current++) {
		if (lines[current].trim() !== '') {
			after = lines[current].trim()
			break
		}
	}
	return { before, after }
}

export function scoreFingerprintCandidate(
	originalLine: number,
	candidateLine: number,
	expected: FingerprintContext,
	actual: FingerprintContext
): number {
	const contextScore = similarity(expected.before, actual.before) + similarity(expected.after, actual.after)
	return contextScore * 1_000_000 - Math.abs(candidateLine - originalLine)
}

export function findBestFingerprintLine(
	lines: readonly string[],
	content: string,
	originalLine: number,
	expected: FingerprintContext
): number {
	const target = content.trim()
	let bestLine = -1
	let bestScore = Number.NEGATIVE_INFINITY
	for (let line = 0; line < lines.length; line++) {
		const candidate = lines[line].trim()
		const matches = target === '' ? candidate === '' : candidate.includes(target)
		if (!matches) continue
		const score = scoreFingerprintCandidate(
			originalLine,
			line,
			expected,
			getFingerprintContext(lines, line, content)
		)
		if (score > bestScore) {
			bestLine = line
			bestScore = score
		}
	}
	return bestLine
}
