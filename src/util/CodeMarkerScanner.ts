import * as path from 'path'

export const CODE_MARKER_ICON = 'status_idea_yellow.svg'
export const MAX_CODE_MARKERS_PER_FILE = 5_000
export const CODE_MARKER_FILE_GLOB = '**/*.{ahk,ahk2,c,cc,cpp,cxx,h,hpp,cs,css,dart,go,htm,html,java,js,jsx,kt,kts,less,lua,m,md,mm,php,pl,ps1,py,r,rb,rs,scss,sh,sql,svelte,swift,toml,ts,tsx,vue,xml,yaml,yml}'

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
	// AutoHotkey treats ';' as a comment delimiter at the first non-whitespace
	// position or when it is preceded by whitespace. It also supports C-style
	// block comments in the supported AutoHotkey dialects.
	lineComments: [{ value: ';', requiresWhitespaceBefore: true }],
	blockComments: [['/*', '*/']],
}

function fallbackProfileFor(languageId: string | undefined, fileName: string): CodeMarkerSyntaxProfile {
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
	fallback: CodeMarkerSyntaxProfile,
	discovered?: CodeMarkerSyntaxProfile,
): CodeMarkerSyntaxProfile {
	if (!discovered) return fallback
	const lineComments = discovered.lineComments.map(token => {
		const known = fallback.lineComments.find(candidate => candidate.value === token.value)
		return known ? { ...known, ...token } : token
	})
	return {
		lineComments,
		blockComments: discovered.blockComments,
		multilineStrings: discovered.multilineStrings ?? fallback.multilineStrings,
		persistentQuotes: discovered.persistentQuotes ?? fallback.persistentQuotes,
	}
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
	const profile = mergeProfile(fallbackProfileFor(languageId, fileName), discoveredProfile)
	return profile.lineComments.length > 0 || profile.blockComments.length > 0
}

function isIdentifierCharacter(value: string | undefined): boolean {
	return value !== undefined && /[a-z0-9_]/i.test(value)
}

function markerMatches(segment: string): Array<{ marker: CodeMarkerKind, offset: number, length: number }> {
	const result: Array<{ marker: CodeMarkerKind, offset: number, length: number }> = []
	const pattern = /TODO|FIXME|BUG/ig
	let match: RegExpExecArray | null
	while ((match = pattern.exec(segment)) !== null) {
		if (isIdentifierCharacter(segment[match.index - 1]) || isIdentifierCharacter(segment[match.index + match[0].length])) continue
		result.push({ marker: match[0].toUpperCase() as CodeMarkerKind, offset: match.index, length: match[0].length })
	}
	return result
}

function normalizedLabel(value: string, fallback: CodeMarkerKind): string {
	const cleaned = value
		.replace(/^[:\-\s]+/, '')
		.replace(/[\s*-]+$/, '')
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
	const matches = markerMatches(segment)
	for (let index = 0; index < matches.length; index++) {
		if (occurrences.length >= limit) return true
		const match = matches[index]
		const nextOffset = matches[index + 1]?.offset ?? segment.length
		const description = segment.slice(match.offset + match.length, nextOffset)
		occurrences.push({
			marker: match.marker,
			line,
			column: start + match.offset,
			label: normalizedLabel(description, match.marker),
			lineText,
		})
	}
	return false
}

export function scanCodeMarkers(
	lines: readonly string[],
	languageId?: string,
	fileName = '',
	limit = MAX_CODE_MARKERS_PER_FILE,
	discoveredProfile?: CodeMarkerSyntaxProfile,
): CodeMarkerScanResult {
	const profile = mergeProfile(fallbackProfileFor(languageId, fileName), discoveredProfile)
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
