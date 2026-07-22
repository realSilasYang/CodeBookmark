import * as path from 'path'

const ICON_FILE_PATTERN = /^[a-z0-9][a-z0-9_.-]*\.svg$/i

export function normalizeBookmarkIconName(value: unknown): string {
	if (typeof value !== 'string' || !ICON_FILE_PATTERN.test(value)) return ''
	return path.basename(value) === value ? value : ''
}
