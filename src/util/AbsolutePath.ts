import * as path from 'path'

export function normalizedAbsolutePath(value: string): string {
	return path.resolve(value)
}

export function absolutePathKey(value: string): string {
	return normalizedAbsolutePath(value)
}

export function isSameOrDescendantAbsolutePath(candidate: string, target: string): boolean {
	const relative = path.relative(normalizedAbsolutePath(target), normalizedAbsolutePath(candidate))
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function renamedAbsolutePath(candidate: string, oldPath: string, newPath: string): string {
	const relative = path.relative(normalizedAbsolutePath(oldPath), normalizedAbsolutePath(candidate))
	return normalizedAbsolutePath(path.join(newPath, relative))
}
