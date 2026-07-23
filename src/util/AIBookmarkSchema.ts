/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `AIBookmarkSchema`。
 *
 * 实现要点：定义并校验结构化数据边界，拒绝缺失、越界或不受支持的字段组合。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`AIBookmark`、`AIOptimizedBookmark`、`normalizeAIBookmarkPayload`、`formatLineNumberedSource`、`resolveAIBookmarkLine`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import { findBestFingerprintLine } from './FingerprintMatcher'
import { localize } from '../i18n/Localization'
import { resolveAIIconNameForSemantic } from './AIIconCatalog'
import { isJsonRecord } from './JsonRecord'

const MAX_AI_BOOKMARKS = 300
const MAX_AI_BOOKMARK_DEPTH = 8
const MAX_LABEL_LENGTH = 120

export interface AIBookmark {
	label: string
	line?: number
	content: string
	iconName?: string
	subs: AIBookmark[]
}

export interface AIOptimizedBookmark {
	id: string
	new_label?: string
	iconName?: string
}

interface AIOptimizationSemanticContext {
	label: string
	anchor: string
	canAssignIcon: boolean
}

function parseInteger(value: unknown): number | undefined {
	if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined
	if (typeof value !== 'string' || !/^\s*[+-]?\d+\s*$/.test(value)) return undefined
	const parsed = Number(value)
	return Number.isSafeInteger(parsed) ? parsed : undefined
}

function normalizeAnchor(value: unknown): string {
	if (typeof value !== 'string' || value.includes('\n') || value.includes('\r') || value.includes('\0')) return ''
	return value.slice(0, 10_000)
}

function normalizeLabel(value: unknown): string {
	if (typeof value !== 'string') return ''
	const sanitized = [...value].map(character => {
		const code = character.charCodeAt(0)
		return code < 32 || code === 127 ? ' ' : character
	}).join('')
	return sanitized.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL_LENGTH)
}

function generatedBookmarkItems(payload: unknown): unknown[] {
	if (isJsonRecord(payload)) {
		const items = payload.bookmarks
		if (Array.isArray(items)) return items
	}
	throw new Error(localize(
		'AI 响应必须包含 bookmarks 数组。',
		'AI response must contain a bookmarks array.',
	))
}

export function normalizeAIBookmarkPayload(payload: unknown): AIBookmark[] {
	let visited = 0

	const normalizeItems = (items: unknown[], depth: number): AIBookmark[] => {
		if (items.length > 0 && depth > MAX_AI_BOOKMARK_DEPTH) {
			throw new Error(localize(`AI 书签层级不能超过 ${MAX_AI_BOOKMARK_DEPTH} 层`, `AI bookmark nesting cannot exceed ${MAX_AI_BOOKMARK_DEPTH} levels.`))
		}
		const normalized: AIBookmark[] = []

		for (const value of items) {
			visited++
			if (visited > MAX_AI_BOOKMARKS) {
				throw new Error(localize(`AI 单次生成不能超过 ${MAX_AI_BOOKMARKS} 个书签`, `AI cannot generate more than ${MAX_AI_BOOKMARKS} bookmarks in one request.`))
			}
			if (!isJsonRecord(value)) continue

			const rawChildren = Array.isArray(value.children) ? value.children : []
			const subs = normalizeItems(rawChildren, depth + 1)
			const label = normalizeLabel(value.label)

			const oneBasedLine = parseInteger(value.lineNumber)
			const line = oneBasedLine !== undefined && oneBasedLine > 0 ? oneBasedLine - 1 : undefined
			const content = normalizeAnchor(value.anchor)
			const iconName = resolveAIIconNameForSemantic(value.icon, { labels: [label], anchor: content })

			if (!label || (line === undefined && content.trim() === '')) {
				normalized.push(...subs)
				continue
			}

			normalized.push({
				label,
				line,
				content,
				...(iconName ? { iconName } : {}),
				subs,
			})
		}

		return normalized
	}

	return normalizeItems(generatedBookmarkItems(payload), 1)
}

export function formatLineNumberedSource(codeContent: string): string {
	return codeContent
		.split(/\r\n|\n|\r/)
		.map((line, index) => `${index + 1} | ${line}`)
		.join('\n')
}

export function resolveAIBookmarkLine(lines: string[], bookmark: AIBookmark): number | undefined {
	if (lines.length === 0) return undefined
	const hasValidHint = bookmark.line !== undefined && bookmark.line >= 0 && bookmark.line < lines.length
	const hintedLine = hasValidHint ? bookmark.line as number : 0
	const target = bookmark.content.trim()
	if (!target) return hasValidHint ? hintedLine : undefined

	const targets = [target]
	const numberedPrefix = target.match(/^\s*(\d+)\s*\|\s?(.*)$/)
	if (numberedPrefix && (bookmark.line === undefined || Number(numberedPrefix[1]) === bookmark.line + 1) && numberedPrefix[2].trim()) {
		targets.push(numberedPrefix[2].trim())
	}

	for (const candidate of targets) {
		if (lines[hintedLine].trim() === candidate) return hintedLine
	}

	for (const candidate of targets) {
		const exactMatches: number[] = []
		for (let line = 0; line < lines.length; line++) {
			if (lines[line].trim() === candidate) exactMatches.push(line)
		}
		if (exactMatches.length > 0) {
			return exactMatches.reduce((best, line) =>
				Math.abs(line - hintedLine) < Math.abs(best - hintedLine) ? line : best
			)
		}
	}

	for (const candidate of targets) {
		if (candidate.length < 3) continue
		const partialMatch = findBestFingerprintLine(lines, candidate, hintedLine, {})
		if (partialMatch >= 0) return partialMatch
	}

	return undefined
}

export function normalizeAIOptimizedBookmarks(
	payload: unknown,
	semanticContextById: ReadonlyMap<string, AIOptimizationSemanticContext>,
): AIOptimizedBookmark[] {
	const seen = new Set<string>()
	const normalized: AIOptimizedBookmark[] = []

	if (!Array.isArray(payload)) {
		throw new Error(localize('AI 响应必须是 JSON 数组。', 'AI response must be a JSON array.'))
	}
	for (const value of payload) {
		if (!isJsonRecord(value)) continue
		const id = typeof value.id === 'string' ? value.id : ''
		const semanticContext = semanticContextById.get(id)
		const rawLabel = value.new_label
		const newLabel = normalizeLabel(rawLabel)
		const iconName = semanticContext?.canAssignIcon
			? resolveAIIconNameForSemantic(value.icon, {
				labels: [newLabel, semanticContext.label],
				anchor: semanticContext.anchor,
			})
			: undefined
		if (!semanticContext || seen.has(id) || (!newLabel && !iconName)) continue
		seen.add(id)
		normalized.push({
			id,
			...(newLabel ? { new_label: newLabel } : {}),
			...(iconName ? { iconName } : {}),
		})
	}

	return normalized
}
