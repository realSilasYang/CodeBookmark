import * as path from 'path'
import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import {
	CODE_MARKER_FILE_GLOB,
	supportsCodeMarkerSyntax,
	type CodeMarkerLineCommentToken,
	type CodeMarkerSyntaxProfile,
} from './CodeMarkerScanner'
import { logger } from './Logger'

const MAX_LANGUAGE_CONFIG_BYTES = 512 * 1024
const MAX_LANGUAGE_CONTRIBUTIONS = 4_096
const MAX_DISCOVERY_GLOBS = 64
const GLOB_CHUNK_SIZE = 48

interface LanguageContribution {
	id?: unknown
	exts?: unknown
	extensions?: unknown
	filenames?: unknown
	filenamePatterns?: unknown
	configuration?: unknown
}

interface ProfileState {
	profilesByLanguage: Map<string, CodeMarkerSyntaxProfile>
	languagesByExtension: Map<string, Set<string>>
	languagesByFilename: Map<string, Set<string>>
	filenamePatterns: Array<{ languageId: string, regex: RegExp, fullPath: boolean }>
	discoveryExtensions: Set<string>
	discoveryFilenames: Set<string>
	discoveryPatterns: Set<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stripJsonComments(value: string): string {
	let output = ''
	let inString = false
	let escaped = false
	let lineComment = false
	let blockComment = false
	for (let index = 0; index < value.length; index++) {
		const current = value[index]
		const next = value[index + 1]
		if (lineComment) {
			if (current === '\n' || current === '\r') {
				lineComment = false
				output += current
			} else {
				output += ' '
			}
			continue
		}
		if (blockComment) {
			if (current === '*' && next === '/') {
				output += '  '
				index++
				blockComment = false
			} else {
				output += current === '\n' || current === '\r' ? current : ' '
			}
			continue
		}
		if (inString) {
			output += current
			if (!escaped && current === '"') inString = false
			escaped = !escaped && current === '\\'
			if (current !== '\\') escaped = false
			continue
		}
		if (current === '"') {
			inString = true
			output += current
			continue
		}
		if (current === '/' && next === '/') {
			output += '  '
			index++
			lineComment = true
			continue
		}
		if (current === '/' && next === '*') {
			output += '  '
			index++
			blockComment = true
			continue
		}
		output += current
	}
	return output
}

function removeTrailingCommas(value: string): string {
	let output = ''
	let inString = false
	let escaped = false
	for (let index = 0; index < value.length; index++) {
		const current = value[index]
		if (inString) {
			output += current
			if (!escaped && current === '"') inString = false
			escaped = !escaped && current === '\\'
			if (current !== '\\') escaped = false
			continue
		}
		if (current === '"') {
			inString = true
			output += current
			continue
		}
		if (current === ',') {
			let lookahead = index + 1
			while (/\s/.test(value[lookahead] ?? '')) lookahead++
			if (value[lookahead] === '}' || value[lookahead] === ']') {
				output += ' '
				continue
			}
		}
		output += current
	}
	return output
}

export function parseLanguageConfigurationJson(value: string): unknown {
	const withoutBom = value.charCodeAt(0) === 0xFEFF ? value.slice(1) : value
	return JSON.parse(removeTrailingCommas(stripJsonComments(withoutBom)))
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	return value.filter((item): item is string => typeof item === 'string')
}

function lineCommentTokens(value: unknown, languageId: string): CodeMarkerLineCommentToken[] {
	const candidates = Array.isArray(value) ? value : [value]
	const tokens: CodeMarkerLineCommentToken[] = []
	for (const candidate of candidates) {
		const comment = typeof candidate === 'string'
			? candidate
			: isRecord(candidate) && typeof candidate.comment === 'string' ? candidate.comment : undefined
		if (!comment || comment.length > 32) continue
		const alphabetic = /^[a-z]+$/i.test(comment)
		tokens.push({
			value: comment,
			startOnly: isRecord(candidate) && candidate.noIndent === true,
			requiresWhitespaceBefore: alphabetic,
			requiresWhitespaceAfter: alphabetic,
			caseInsensitive: languageId === 'bat' || languageId === 'batch' || languageId === 'dosbatch',
		})
	}
	return tokens
}

function syntaxProfile(value: unknown, languageId: string): CodeMarkerSyntaxProfile | undefined {
	if (!isRecord(value) || !isRecord(value.comments)) return undefined
	const lineComments = lineCommentTokens(value.comments.lineComment, languageId)
	const block = value.comments.blockComment
	const blockComments: Array<readonly [string, string]> = []
	if (Array.isArray(block) && block.length === 2
		&& typeof block[0] === 'string' && typeof block[1] === 'string'
		&& block[0].length > 0 && block[1].length > 0
		&& block[0].length <= 32 && block[1].length <= 32) {
		blockComments.push([block[0], block[1]])
	}
	if (lineComments.length === 0 && blockComments.length === 0) return undefined
	return { lineComments, blockComments }
}

function mergeProfiles(first: CodeMarkerSyntaxProfile | undefined, second: CodeMarkerSyntaxProfile): CodeMarkerSyntaxProfile {
	if (!first) return second
	const lineComments = [...first.lineComments]
	for (const token of second.lineComments) {
		if (!lineComments.some(existing => existing.value === token.value)) lineComments.push(token)
	}
	const blockComments = [...first.blockComments]
	for (const pair of second.blockComments) {
		if (!blockComments.some(existing => existing[0] === pair[0] && existing[1] === pair[1])) blockComments.push(pair)
	}
	return {
		lineComments,
		blockComments,
		multilineStrings: first.multilineStrings ?? second.multilineStrings,
		persistentQuotes: first.persistentQuotes ?? second.persistentQuotes,
	}
}

function addAssociation(map: Map<string, Set<string>>, key: string, languageId: string): void {
	const values = map.get(key) ?? new Set<string>()
	values.add(languageId)
	map.set(key, values)
}

function safeConfigurationUri(extensionUri: vscode.Uri, value: unknown): vscode.Uri | undefined {
	if (typeof value !== 'string') return undefined
	const normalized = value.trim().replace(/\\/g, '/')
	if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return undefined
	const segments = normalized.split('/').filter(segment => segment !== '' && segment !== '.')
	if (segments.length === 0 || segments.some(segment => segment === '..')) return undefined
	return vscode.Uri.joinPath(extensionUri, ...segments)
}

function safeExtension(value: string): string | undefined {
	const trimmed = value.trim()
	if (!trimmed.startsWith('.') || trimmed.length > 64 || ['\\', '/', '{', '}', '*', '?', '[', ']'].some(char => trimmed.includes(char))) return undefined
	return trimmed
}

function safeFilename(value: string): string | undefined {
	const trimmed = value.trim()
	if (!trimmed || trimmed.length > 128 || ['\\', '/', '{', '}', '*', '?', '[', ']'].some(char => trimmed.includes(char))) return undefined
	return trimmed
}

function safeFilenamePattern(value: string): string | undefined {
	const normalized = value.trim().replace(/\\/g, '/')
	if (!normalized || normalized.length > 256 || normalized.startsWith('/') || normalized.split('/').includes('..')) return undefined
	return normalized.replace(/^\.\//, '')
}

function globPatternRegex(pattern: string, fullPath: boolean): RegExp {
	let source = ''
	for (let index = 0; index < pattern.length; index++) {
		const current = pattern[index]
		if (current === '*') {
			if (pattern[index + 1] === '*') {
				if (pattern[index + 2] === '/') {
					source += '(?:.*/)?'
					index += 2
				} else {
					source += '.*'
					index++
				}
			} else {
				source += '[^/]*'
			}
		} else if (current === '?') {
			source += '[^/]'
		} else if (current === '[') {
			const end = pattern.indexOf(']', index + 1)
			if (end > index + 1) {
				const content = pattern.slice(index + 1, end).replace(/\\/g, '\\\\')
				source += `[${content}]`
				index = end
			} else {
				source += '\\['
			}
		} else if (current === '{') {
			const end = pattern.indexOf('}', index + 1)
			if (end > index + 1) {
				const alternatives = pattern.slice(index + 1, end).split(',')
					.map(alternative => globPatternRegex(alternative, false).source.replace(/^\^|\$$/g, ''))
				source += `(?:${alternatives.join('|')})`
				index = end
			} else {
				source += '\\{'
			}
		} else {
			source += current.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
		}
	}
	const prefix = fullPath ? '(?:^|.*/)' : '^'
	return new RegExp(`${prefix}${source}$`, process.platform === 'win32' || process.platform === 'darwin' ? 'i' : '')
}

function emptyState(): ProfileState {
	return {
		profilesByLanguage: new Map(),
		languagesByExtension: new Map(),
		languagesByFilename: new Map(),
		filenamePatterns: [],
		discoveryExtensions: new Set(),
		discoveryFilenames: new Set(),
		discoveryPatterns: new Set(),
	}
}

function braceGlobs(prefix: string, values: readonly string[]): string[] {
	const globs: string[] = []
	for (let index = 0; index < values.length; index += GLOB_CHUNK_SIZE) {
		const chunk = values.slice(index, index + GLOB_CHUNK_SIZE)
		if (chunk.length === 1) globs.push(`${prefix}${chunk[0]}`)
		else if (chunk.length > 1) globs.push(`${prefix}{${chunk.join(',')}}`)
	}
	return globs
}

export class LanguageCommentProfileRegistry {
	private state = emptyState()
	private initializePromise: Promise<void> | undefined
	private initialized = false

	get isInitialized(): boolean { return this.initialized }

	initialize(): Promise<void> {
		if (!this.initializePromise) {
			this.initializePromise = this.load().catch(error => {
				logger.error(localize(`读取 VS Code 语言注释配置失败: ${error}`, `Failed to read a VS Code language comment configuration: ${error}`))
			}).finally(() => {
				this.initialized = true
			})
		}
		return this.initializePromise
	}

	async reload(): Promise<void> {
		if (this.initializePromise) await this.initializePromise
		this.initialized = false
		this.initializePromise = undefined
		await this.initialize()
	}

	private async readProfile(uri: vscode.Uri, languageId: string): Promise<CodeMarkerSyntaxProfile | undefined> {
		const stat = await vscode.workspace.fs.stat(uri)
		if (stat.size > MAX_LANGUAGE_CONFIG_BYTES) return undefined
		const content = await vscode.workspace.fs.readFile(uri)
		if (content.byteLength > MAX_LANGUAGE_CONFIG_BYTES) return undefined
		return syntaxProfile(parseLanguageConfigurationJson(Buffer.from(content).toString('utf8')), languageId)
	}

	private async load(): Promise<void> {
		const next = emptyState()
		const contributions: Array<{ extensionUri: vscode.Uri, language: LanguageContribution }> = []
		for (const extension of vscode.extensions.all) {
			const languages = extension.packageJSON?.contributes?.languages
			if (!Array.isArray(languages)) continue
			for (const language of languages) {
				if (isRecord(language) && contributions.length < MAX_LANGUAGE_CONTRIBUTIONS) {
					contributions.push({ extensionUri: extension.extensionUri, language })
				}
			}
		}

		const profileCache = new Map<string, Promise<CodeMarkerSyntaxProfile | undefined>>()
		let failedConfigurations = 0
		let failedPatterns = 0
		let cursor = 0
		const worker = async (): Promise<void> => {
			while (cursor < contributions.length) {
				const { extensionUri, language } = contributions[cursor++]
				if (typeof language.id !== 'string' || !language.id.trim()) continue
				const languageId = language.id.toLowerCase()
				const configUri = safeConfigurationUri(extensionUri, language.configuration)
				if (!configUri) continue
				const cacheKey = configUri.toString()
				let profilePromise = profileCache.get(cacheKey)
				if (!profilePromise) {
					profilePromise = this.readProfile(configUri, languageId).catch(() => {
						failedConfigurations++
						return undefined
					})
					profileCache.set(cacheKey, profilePromise)
				}
				const profile = await profilePromise
				if (!profile) continue
				next.profilesByLanguage.set(languageId, mergeProfiles(next.profilesByLanguage.get(languageId), profile))
			}
		}
		await Promise.all(Array.from({ length: Math.min(8, contributions.length) }, () => worker()))

		// VS Code frequently splits one language across multiple contributions: one owns
		// the configuration, while others add filenames or extensions. Associate files
		// only after every profile has been collected so those config-less entries inherit
		// the comment rules registered under the same language id.
		for (const { language } of contributions) {
			if (typeof language.id !== 'string' || !language.id.trim()) continue
			const languageId = language.id.toLowerCase()
			if (!next.profilesByLanguage.has(languageId)) continue
			for (const rawExtension of stringArray(language.extensions ?? language.exts)) {
				const extension = safeExtension(rawExtension)
				if (extension) {
					addAssociation(next.languagesByExtension, extension.toLowerCase(), languageId)
					next.discoveryExtensions.add(extension)
					continue
				}
				// A few built-in contributions use an exact filename in `extensions`.
				const filename = safeFilename(rawExtension)
				if (filename) {
					addAssociation(next.languagesByFilename, filename, languageId)
					addAssociation(next.languagesByFilename, filename.toLowerCase(), languageId)
					next.discoveryFilenames.add(filename)
				}
			}
			for (const rawFilename of stringArray(language.filenames)) {
				const filename = safeFilename(rawFilename)
				if (!filename) continue
				addAssociation(next.languagesByFilename, filename, languageId)
				addAssociation(next.languagesByFilename, filename.toLowerCase(), languageId)
				next.discoveryFilenames.add(filename)
			}
			for (const rawPattern of stringArray(language.filenamePatterns)) {
				const pattern = safeFilenamePattern(rawPattern)
				if (!pattern) continue
				const fullPath = pattern.includes('/')
				try {
					next.filenamePatterns.push({ languageId, regex: globPatternRegex(pattern, fullPath), fullPath })
					next.discoveryPatterns.add(pattern)
				} catch {
					failedPatterns++
				}
			}
		}
		this.state = next
		if (failedConfigurations > 0) {
			logger.error(localize(
				`有 ${failedConfigurations} 个语言注释配置无法读取；对应语言将使用内置兜底规则。`,
				`${failedConfigurations} language comment configurations could not be read; the affected languages will use built-in fallback rules.`,
			))
		}
		if (failedPatterns > 0) logger.error(localize(
			`已跳过 ${failedPatterns} 个无效的语言文件匹配模式。`,
			`Skipped ${failedPatterns} invalid language file-matching patterns.`,
		))
	}

	profileFor(languageId: string | undefined, fileName: string): CodeMarkerSyntaxProfile | undefined {
		if (languageId) {
			const direct = this.state.profilesByLanguage.get(languageId.toLowerCase())
			if (direct) return direct
		}
		const languageIds = new Set<string>()
		const basename = path.basename(fileName)
		const lowerBasename = basename.toLowerCase()
		for (let index = lowerBasename.indexOf('.'); index >= 0; index = lowerBasename.indexOf('.', index + 1)) {
			for (const id of this.state.languagesByExtension.get(lowerBasename.slice(index)) ?? []) languageIds.add(id)
		}
		for (const id of this.state.languagesByFilename.get(basename) ?? this.state.languagesByFilename.get(basename.toLowerCase()) ?? []) languageIds.add(id)
		const normalizedPath = fileName.replace(/\\/g, '/')
		for (const pattern of this.state.filenamePatterns) {
			if (pattern.regex.test(pattern.fullPath ? normalizedPath : basename)) languageIds.add(pattern.languageId)
		}
		let combined: CodeMarkerSyntaxProfile | undefined
		for (const id of languageIds) {
			const profile = this.state.profilesByLanguage.get(id)
			if (profile) combined = mergeProfiles(combined, profile)
		}
		return combined
	}

	supportsFile(fileName: string, languageId?: string): boolean {
		const profile = this.profileFor(languageId, fileName)
		return supportsCodeMarkerSyntax(languageId, fileName, profile)
	}

	discoveryGlobs(): string[] {
		const extensions = [...this.state.discoveryExtensions].sort()
		const filenames = [...this.state.discoveryFilenames].sort()
		const patterns = [...this.state.discoveryPatterns].sort().map(pattern => pattern.replace(/^\*\*\//, ''))
		const simplePatterns = patterns.filter(pattern => !/[{},]/.test(pattern))
		const complexPatterns = patterns.filter(pattern => /[{},]/.test(pattern)).map(pattern => `**/${pattern}`)
		const globs = [
			CODE_MARKER_FILE_GLOB,
			...braceGlobs('**/*', extensions),
			...braceGlobs('**/', filenames),
			...braceGlobs('**/', simplePatterns),
			...complexPatterns,
		]
		return [...new Set(globs)].slice(0, MAX_DISCOVERY_GLOBS)
	}
}
