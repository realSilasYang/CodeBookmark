import { isJsonRecord } from './JsonRecord'

export interface AIResponse {
	choices?: Array<{ message?: { content?: unknown }, text?: unknown }>
}

const MAX_ERROR_PREVIEW_LENGTH = 4000

export function aiResponseContent(content: unknown): string {
	if (typeof content === 'string') return content
	if (isJsonRecord(content) && typeof content.text === 'string') return content.text
	if (!Array.isArray(content)) return ''
	return content.map(part => {
		if (typeof part === 'string') return part
		if (isJsonRecord(part) && typeof part.text === 'string') return part.text
		return ''
	}).join('')
}

export function aiErrorPreview(content: string): string {
	const sanitized = [...content].map(character => {
		const code = character.charCodeAt(0)
		return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127
			? ' '
			: character
	}).join('').trim()
	return sanitized.length > MAX_ERROR_PREVIEW_LENGTH
		? `${sanitized.slice(0, MAX_ERROR_PREVIEW_LENGTH)}…`
		: sanitized
}

export function stripMarkdownCodeFence(content: string): string {
	const trimmed = content.trim()
	const fenced = trimmed.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i)
	return (fenced ? fenced[1] : trimmed).trim()
}

export function repairJsonStringEscapes(value: string): string {
	let output = ''
	let inString = false
	for (let index = 0; index < value.length; index++) {
		const current = value[index]
		if (!inString) {
			output += current
			if (current === '"') inString = true
			continue
		}

		if (current === '"') {
			output += current
			inString = false
			continue
		}
		if (current === '\\') {
			const next = value[index + 1]
			if ('"\\/bfnrt'.includes(next ?? '')) {
				output += current + next
				index++
				continue
			}
			if (next === 'u' && /^[0-9a-f]{4}$/i.test(value.slice(index + 2, index + 6))) {
				output += value.slice(index, index + 6)
				index += 5
				continue
			}
			output += '\\\\'
			continue
		}
		if (current === '\n') {
			output += '\\n'
			continue
		}
		if (current === '\r') {
			output += '\\r'
			continue
		}
		if (current.charCodeAt(0) < 32) {
			output += `\\u${current.charCodeAt(0).toString(16).padStart(4, '0')}`
			continue
		}
		output += current
	}
	return output
}

export function parseAIJsonReply(content: unknown, expectedOpening: '{' | '['): unknown {
	const text = stripMarkdownCodeFence(aiResponseContent(content)).replace(/^\uFEFF/, '')
	if (!text) throw new Error('AI response content is empty')
	const candidates = [text]
	const start = text.indexOf(expectedOpening)
	const closing = expectedOpening === '{' ? '}' : ']'
	const end = text.lastIndexOf(closing)
	if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1))

	let lastError: unknown
	for (const candidate of candidates) {
		try {
			return JSON.parse(candidate)
		} catch (error) {
			lastError = error
			const repaired = repairJsonStringEscapes(candidate)
			if (repaired !== candidate) {
				try {
					return JSON.parse(repaired)
				} catch (repairError) {
					lastError = repairError
				}
			}
		}
	}
	throw lastError instanceof Error ? lastError : new Error('AI response is not valid JSON')
}
