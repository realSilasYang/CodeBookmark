/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `CodeMarkerScanner`。
 *
 * 实现要点：按受控规则扫描输入并生成结构化结果，同时限制范围、容量和误匹配。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`CODE_MARKER_ICON`、`MAX_CODE_MARKERS_PER_FILE`、`CodeMarkerMetadata`、`CodeMarkerOccurrence`、`CodeMarkerLineCommentToken`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as path from 'path'

export const CODE_MARKER_ICON = 'status_idea_yellow.svg'
export const MAX_CODE_MARKERS_PER_FILE = 5_000

type CodeMarkerKind = 'TODO' | 'FIXME' | 'BUG'

export interface CodeMarkerMetadata {
	type: 'code-marker'
	marker: CodeMarkerKind
	generatedLabel: string
	iconCustomized: boolean
}

export interface CodeMarkerOccurrence {
	marker: CodeMarkerKind
	line: number
	column: number
	label: string
	lineText: string
}

interface CodeMarkerScanResult {
	occurrences: CodeMarkerOccurrence[]
	truncated: boolean
}

export interface CodeMarkerLineCommentToken {
	value: string
	startOnly?: boolean
	requiresWhitespaceBefore?: boolean
	requiresWhitespaceAfter?: boolean
	caseInsensitive?: boolean
}

export interface CodeMarkerSyntaxProfile {
	lineComments: CodeMarkerLineCommentToken[]
	blockComments: Array<readonly [string, string]>
	multilineStrings?: Array<readonly [string, string]>
	persistentQuotes?: string[]
}

const C_LIKE_LANGUAGES = new Set([
	'c', 'cpp', 'csharp', 'dart', 'go', 'java', 'javascript', 'javascriptreact',
	'jsonc', 'kotlin', 'less', 'objective-c', 'objective-cpp', 'rust', 'scss',
	'swift', 'typescript', 'typescriptreact',
])
const HASH_COMMENT_LANGUAGES = new Set([
	'coffeescript', 'dockerfile', 'elixir', 'julia', 'makefile', 'perl', 'properties',
	'python', 'r', 'ruby', 'shellscript', 'terraform', 'toml', 'yaml',
])
const SQL_LANGUAGES = new Set(['pgsql', 'plsql', 'sql'])
const HTML_LANGUAGES = new Set(['handlebars', 'html', 'markdown', 'razor', 'xml'])

const EMPTY_PROFILE: CodeMarkerSyntaxProfile = { lineComments: [], blockComments: [] }
const C_LIKE_PROFILE: CodeMarkerSyntaxProfile = {
	lineComments: [{ value: '//' }],
	blockComments: [['/*', '*/']],
	persistentQuotes: ['`'],
}
const HASH_PROFILE: CodeMarkerSyntaxProfile = {
	lineComments: [{ value: '#' }],
	blockComments: [],
}
const AUTOHOTKEY_PROFILE: CodeMarkerSyntaxProfile = {
	// AutoHotkey 仅在分号位于首个非空白位置，或前面存在空白时把它视为注释分隔符；
	// 当前支持的 AutoHotkey 方言同时允许 C 风格块注释。
	lineComments: [{ value: ';', requiresWhitespaceBefore: true }],
	blockComments: [['/*', '*/']],
}

function syntaxHintsFor(languageId: string | undefined, fileName: string): CodeMarkerSyntaxProfile {
	const language = languageId?.toLowerCase() ?? ''
	if (language === 'json') return EMPTY_PROFILE
	if (language === 'ahk' || language === 'ahk2' || language === 'autohotkey' || language === 'autohotkey2') return AUTOHOTKEY_PROFILE
	if (language === 'css') return { lineComments: [], blockComments: [['/*', '*/']] }
	if (language === 'php') return { lineComments: [{ value: '//' }, { value: '#' }], blockComments: [['/*', '*/']] }
	if (C_LIKE_LANGUAGES.has(language)) return C_LIKE_PROFILE
	if (HASH_COMMENT_LANGUAGES.has(language)) {
		if (language === 'python') return { ...HASH_PROFILE, multilineStrings: [['"""', '"""'], ["'''", "'''"]] }
		return HASH_PROFILE
	}
	if (SQL_LANGUAGES.has(language)) return { lineComments: [{ value: '--' }], blockComments: [['/*', '*/']] }
	if (HTML_LANGUAGES.has(language)) return { lineComments: [], blockComments: [['<!--', '-->']] }
	if (language === 'vue' || language === 'svelte') {
		return { lineComments: [{ value: '//' }], blockComments: [['<!--', '-->'], ['/*', '*/']], persistentQuotes: ['`'] }
	}
	if (language === 'powershell') return { lineComments: [{ value: '#' }], blockComments: [['<#', '#>']] }
	if (language === 'lua') return { lineComments: [{ value: '--' }], blockComments: [['--[[', ']]']] }
	if (language === 'clojure' || language === 'lisp' || language === 'scheme') {
		return { lineComments: [{ value: ';' }], blockComments: [] }
	}

	const extension = path.extname(fileName).toLowerCase()
	if (extension === '.ahk' || extension === '.ahk2') return AUTOHOTKEY_PROFILE
	if (extension === '.css') return { lineComments: [], blockComments: [['/*', '*/']] }
	if (extension === '.php') return { lineComments: [{ value: '//' }, { value: '#' }], blockComments: [['/*', '*/']] }
	if (['.c', '.cc', '.cpp', '.cs', '.dart', '.go', '.h', '.hpp', '.java', '.js', '.jsx', '.kt', '.less', '.m', '.mm', '.rs', '.scss', '.swift', '.ts', '.tsx'].includes(extension)) {
		return C_LIKE_PROFILE
	}
	if (['.py', '.rb', '.sh', '.bash', '.zsh', '.yaml', '.yml', '.toml', '.r', '.pl'].includes(extension)) return HASH_PROFILE
	if (['.sql'].includes(extension)) return { lineComments: [{ value: '--' }], blockComments: [['/*', '*/']] }
	if (['.htm', '.html', '.md', '.xml'].includes(extension)) return { lineComments: [], blockComments: [['<!--', '-->']] }
	if (['.ini', '.cfg', '.conf'].includes(extension)) {
		return { lineComments: [{ value: '#', startOnly: true }, { value: ';', startOnly: true }], blockComments: [] }
	}
	const baseName = path.basename(fileName).toLowerCase()
	if (baseName === 'dockerfile' || baseName === 'makefile') return HASH_PROFILE
	return EMPTY_PROFILE
}

function mergeProfile(
	hints: CodeMarkerSyntaxProfile,
	discovered: CodeMarkerSyntaxProfile,
): CodeMarkerSyntaxProfile {
	const lineComments = discovered.lineComments.map(token => {
		const known = hints.lineComments.find(candidate => candidate.value === token.value)
		return known ? { ...known, ...token } : token
	})
	return {
		lineComments,
		blockComments: discovered.blockComments,
		multilineStrings: discovered.multilineStrings ?? hints.multilineStrings,
		persistentQuotes: discovered.persistentQuotes ?? hints.persistentQuotes,
	}
}

function recognizedProfile(
	languageId: string | undefined,
	fileName: string,
	discovered?: CodeMarkerSyntaxProfile,
): CodeMarkerSyntaxProfile {
	if (!discovered) return EMPTY_PROFILE
	return mergeProfile(syntaxHintsFor(languageId, fileName), discovered)
}

function startsWithLineComment(lineText: string, index: number, token: CodeMarkerLineCommentToken): boolean {
	const candidate = lineText.slice(index, index + token.value.length)
	return token.caseInsensitive
		? candidate.toLowerCase() === token.value.toLowerCase()
		: candidate === token.value
}

export function supportsCodeMarkerSyntax(
	languageId?: string,
	fileName = '',
	discoveredProfile?: CodeMarkerSyntaxProfile,
): boolean {
	const profile = recognizedProfile(languageId, fileName, discoveredProfile)
	return profile.lineComments.length > 0 || profile.blockComments.length > 0
}

function markerDirective(segment: string): { marker: CodeMarkerKind, offset: number, descriptionStart: number } | undefined {
	// 标记必须是显式指令，不能只是注释说明中恰好出现的普通单词。
	// JSDoc 星号、@TODO 和 [TODO] 属于显式结构；裸标记后若带说明必须使用标点，
	// 这样“BUG Icon”一类普通标题仍会被判定为说明文字。
	const prefix = /^[\t ]*(?:\*[\t ]*)?/u.exec(segment)?.[0] ?? ''
	let cursor = prefix.length
	const atForm = segment[cursor] === '@'
	if (atForm) cursor++
	const bracketForm = segment[cursor] === '['
	if (bracketForm) {
		cursor++
		while (segment[cursor] === ' ' || segment[cursor] === '\t') cursor++
	}
	const markerMatch = /^(TODO|FIXME|BUG)/iu.exec(segment.slice(cursor))
	if (!markerMatch) return undefined
	const rawMarker = markerMatch[1]
	const marker = rawMarker.toUpperCase() as CodeMarkerKind
	const markerOffset = cursor
	cursor += rawMarker.length
	if (bracketForm) {
		while (segment[cursor] === ' ' || segment[cursor] === '\t') cursor++
		if (segment[cursor] !== ']') return undefined
		cursor++
	}
	const suffix = segment.slice(cursor)
	const emptySuffix = /^[\t ]*$/u.test(suffix)
	const punctuatedSuffix = /^[\t ]*[:：]/u.test(suffix)
		|| /^[\t ]*[-–—][\t ]*\S/u.test(suffix)
		|| /^[\t ]*\([^\r\n)]{1,80}\)[\t ]*[:：]/u.test(suffix)
	const explicitContainerSuffix = (atForm || bracketForm) && (emptySuffix || /^[\t ]+\S/u.test(suffix))
	const explicitSuffix = punctuatedSuffix || explicitContainerSuffix || (rawMarker === marker && emptySuffix)
	if (!explicitSuffix) return undefined
	return {
		marker,
		offset: markerOffset,
		descriptionStart: bracketForm ? cursor : markerOffset + rawMarker.length,
	}
}

function normalizedLabel(value: string, fallback: CodeMarkerKind): string {
	const cleaned = value
		.replace(/^[:：\-–—\s]+/u, '')
		.replace(/[\s*\-–—]+$/u, '')
		.trim()
	const label = cleaned === '' ? fallback : `${fallback}: ${cleaned}`
	return label.replace(/\s+/g, ' ').slice(0, 80)
}

function scanCommentSegment(
	lineText: string,
	start: number,
	end: number,
	line: number,
	occurrences: CodeMarkerOccurrence[],
	limit: number,
): boolean {
	if (end <= start) return false
	const segment = lineText.slice(start, end)
	const directive = markerDirective(segment)
	if (!directive) return false
	if (occurrences.length >= limit) return true
	const description = segment.slice(directive.descriptionStart)
	occurrences.push({
		marker: directive.marker,
		line,
		column: start + directive.offset,
		label: normalizedLabel(description, directive.marker),
		lineText,
	})
	return false
}

export function scanCodeMarkers(
	lines: readonly string[],
	languageId?: string,
	fileName = '',
	limit = MAX_CODE_MARKERS_PER_FILE,
	discoveredProfile?: CodeMarkerSyntaxProfile,
): CodeMarkerScanResult {
	const profile = recognizedProfile(languageId, fileName, discoveredProfile)
	if (profile.lineComments.length === 0 && profile.blockComments.length === 0) {
		return { occurrences: [], truncated: false }
	}

	const occurrences: CodeMarkerOccurrence[] = []
	let blockEnd: string | undefined
	let multilineStringEnd: string | undefined
	let persistentQuote: string | undefined

	for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
		const lineText = lines[lineNumber]
		const firstNonWhitespace = lineText.search(/\S/)
		let index = 0
		while (index < lineText.length) {
			if (occurrences.length >= limit) return { occurrences, truncated: true }
			if (blockEnd) {
				const endIndex = lineText.indexOf(blockEnd, index)
				const commentEnd = endIndex < 0 ? lineText.length : endIndex
				if (scanCommentSegment(lineText, index, commentEnd, lineNumber, occurrences, limit)) {
					return { occurrences, truncated: true }
				}
				if (endIndex < 0) break
				index = endIndex + blockEnd.length
				blockEnd = undefined
				continue
			}
			if (multilineStringEnd) {
				const endIndex = lineText.indexOf(multilineStringEnd, index)
				if (endIndex < 0) break
				index = endIndex + multilineStringEnd.length
				multilineStringEnd = undefined
				continue
			}
			if (persistentQuote) {
				let escaped = false
				while (index < lineText.length) {
					const char = lineText[index++]
					if (!escaped && char === persistentQuote) {
						persistentQuote = undefined
						break
					}
					escaped = !escaped && char === '\\'
					if (char !== '\\') escaped = false
				}
				continue
			}

			const multilineStart = profile.multilineStrings?.find(([start]) => lineText.startsWith(start, index))
			if (multilineStart) {
				const endIndex = lineText.indexOf(multilineStart[1], index + multilineStart[0].length)
				if (endIndex < 0) {
					multilineStringEnd = multilineStart[1]
					break
				}
				index = endIndex + multilineStart[1].length
				continue
			}

			const blockStart = profile.blockComments.find(([start]) => lineText.startsWith(start, index))
			if (blockStart) {
				index += blockStart[0].length
				blockEnd = blockStart[1]
				continue
			}

			const lineComment = profile.lineComments.find(token => startsWithLineComment(lineText, index, token)
				&& (!token.startOnly || index === firstNonWhitespace)
				&& (!token.requiresWhitespaceBefore || index === firstNonWhitespace || /\s/.test(lineText[index - 1]))
				&& (!token.requiresWhitespaceAfter || index + token.value.length === lineText.length || /\s/.test(lineText[index + token.value.length])))
			if (lineComment) {
				if (scanCommentSegment(lineText, index + lineComment.value.length, lineText.length, lineNumber, occurrences, limit)) {
					return { occurrences, truncated: true }
				}
				break
			}

			const char = lineText[index]
			if (char === '"' || char === "'" || profile.persistentQuotes?.includes(char)) {
				const persistent = profile.persistentQuotes?.includes(char) === true
				index++
				let escaped = false
				let closed = false
				while (index < lineText.length) {
					const current = lineText[index++]
					if (!escaped && current === char) {
						closed = true
						break
					}
					escaped = !escaped && current === '\\'
					if (current !== '\\') escaped = false
				}
				if (persistent && !closed) persistentQuote = char
				continue
			}
			index++
		}
	}
	return { occurrences, truncated: false }
}

export function parseCodeMarkerMetadata(value: unknown): CodeMarkerMetadata | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
	const data = value as Record<string, unknown>
	if (data.type !== 'code-marker' || (data.marker !== 'TODO' && data.marker !== 'FIXME' && data.marker !== 'BUG')) return undefined
	if (typeof data.generatedLabel !== 'string' || typeof data.iconCustomized !== 'boolean') return undefined
	return {
		type: 'code-marker',
		marker: data.marker,
		generatedLabel: data.generatedLabel.slice(0, 1000),
		iconCustomized: data.iconCustomized,
	}
}
