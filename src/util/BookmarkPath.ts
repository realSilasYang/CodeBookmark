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
