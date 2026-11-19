/**
 * 提取书签的邻接上下文，并为 AI 返回的局部源码提示提供近似行号搜索。
 * 手动书签的重新绑定由粘性引擎单独核验。
 */
interface FingerprintContext {
	before?: string
	after?: string
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

export function getFingerprintContext(lines: readonly string[], line: number, content: string, endLine = line): FingerprintContext {
	if (content.trim() !== '') {
		return {
			before: line > 0 ? lines[line - 1]?.trim() : undefined,
			after: endLine + 1 < lines.length ? lines[endLine + 1]?.trim() : undefined
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
