import { isLocalAIHostname } from './AIAddressClassifier'

const DEFAULT_TIMEOUT_S = 60
const MIN_TIMEOUT_S = 1
const MAX_TIMEOUT_S = 10 * 60
export const AI_SOURCE_WARNING_BYTES = 512 * 1024
export const AI_RESPONSE_WARNING_BYTES = 2 * 1024 * 1024
export const AI_SOURCE_MAX_BYTES = 8 * 1024 * 1024
export const AI_REQUEST_MAX_BYTES = 16 * 1024 * 1024
export const AI_RESPONSE_MAX_BYTES = 16 * 1024 * 1024

const AI_SOURCE_EXTENSIONS = new Set([
	'.ahk', '.ahk2', '.bash', '.c', '.cc', '.cjs', '.clj', '.cljs', '.cpp', '.cs', '.css',
	'.cts', '.cxx', '.dart', '.ex', '.exs', '.fs', '.fsx', '.go', '.groovy', '.h', '.hpp',
	'.hs', '.htm', '.html', '.java', '.js', '.jsx', '.kt', '.kts', '.less', '.lua', '.m',
	'.mm', '.mjs', '.mts', '.php', '.pl', '.ps1', '.py', '.r', '.rb', '.rs', '.scala',
	'.scss', '.sh', '.sql', '.svelte', '.swift', '.ts', '.tsx', '.vue', '.zsh',
])

const AI_SOURCE_FILENAMES = new Set(['dockerfile', 'makefile'])

export function aiContentByteLength(content: string): number {
	return Buffer.byteLength(content)
}

export function isAISourceFile(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, '/')
	const basename = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
	const extensionIndex = basename.lastIndexOf('.')
	const extension = extensionIndex >= 0 ? basename.slice(extensionIndex) : ''
	return AI_SOURCE_FILENAMES.has(basename) || AI_SOURCE_EXTENSIONS.has(extension)
}

export function normalizeAIRequestTimeoutSeconds(value: unknown): number {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_S
	return Math.min(MAX_TIMEOUT_S, Math.max(MIN_TIMEOUT_S, Math.round(parsed)))
}

export function isRemoteHttpEndpoint(endpoint: string): boolean {
	try {
		const url = new URL(endpoint)
		if (url.protocol !== 'http:') return false
		return !isLocalAIHostname(url.hostname)
	} catch {
		return false
	}
}
