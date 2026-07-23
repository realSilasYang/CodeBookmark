import { currentLanguage } from '../i18n/Localization'

interface BookmarkStatisticsNode {
	readonly isFile?: boolean
	readonly parent?: BookmarkStatisticsNode
	readonly subs?: Iterable<BookmarkStatisticsNode>
}

export interface BookmarkLevelSummary {
	readonly total: number
	readonly levelCounts: readonly number[]
}

function bookmarkLevel(bookmark: BookmarkStatisticsNode): number {
	let level = 1
	let parent = bookmark.parent
	const visited = new Set<BookmarkStatisticsNode>([bookmark])
	while (parent && !visited.has(parent)) {
		visited.add(parent)
		if (!parent.isFile) level++
		parent = parent.parent
	}
	return level
}

export function summarizeBookmarkLevels(levels: Iterable<number>): BookmarkLevelSummary {
	const levelCounts: number[] = []
	let total = 0
	for (const level of levels) {
		if (!Number.isSafeInteger(level) || level < 1) continue
		while (levelCounts.length < level) levelCounts.push(0)
		levelCounts[level - 1]++
		total++
	}
	return { total, levelCounts }
}

export function summarizeBookmarks(bookmarks: Iterable<BookmarkStatisticsNode>): BookmarkLevelSummary {
	const seen = new Set<BookmarkStatisticsNode>()
	const levels: number[] = []
	for (const bookmark of bookmarks) {
		if (seen.has(bookmark)) continue
		seen.add(bookmark)
		if (!bookmark.isFile) levels.push(bookmarkLevel(bookmark))
	}
	return summarizeBookmarkLevels(levels)
}

export function summarizeBookmarkTrees(roots: Iterable<BookmarkStatisticsNode>): BookmarkLevelSummary {
	const seen = new Set<BookmarkStatisticsNode>()
	const levels: number[] = []
	const visit = (bookmark: BookmarkStatisticsNode): void => {
		if (seen.has(bookmark)) return
		seen.add(bookmark)
		if (!bookmark.isFile) levels.push(bookmarkLevel(bookmark))
		for (const child of bookmark.subs ?? []) visit(child)
	}
	for (const root of roots) visit(root)
	return summarizeBookmarkLevels(levels)
}

export function mergeBookmarkLevelSummaries(
	...summaries: readonly BookmarkLevelSummary[]
): BookmarkLevelSummary {
	const levelCounts: number[] = []
	for (const summary of summaries) {
		for (let index = 0; index < summary.levelCounts.length; index++) {
			levelCounts[index] = (levelCounts[index] ?? 0) + summary.levelCounts[index]
		}
	}
	return {
		total: levelCounts.reduce((total, count) => total + count, 0),
		levelCounts,
	}
}

function levelLabel(level: number): string {
	if (currentLanguage() === 'en') return `Level ${level}`
	const chineseNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
	return level <= chineseNumbers.length ? `${chineseNumbers[level - 1]}级` : `第 ${level} 级`
}

export function formatBookmarkLevelSummary(summary: BookmarkLevelSummary): string {
	if (currentLanguage() === 'en') {
		const bookmarkNoun = summary.total === 1 ? 'bookmark' : 'bookmarks'
		if (summary.total === 0) return `0 ${bookmarkNoun} total`
		const levels = summary.levelCounts.map((count, index) => `${levelLabel(index + 1)}: ${count}`)
		return `${summary.total} ${bookmarkNoun} total: ${levels.join(', ')}`
	}
	if (summary.total === 0) return '共 0 个书签'
	const levels = summary.levelCounts.map((count, index) => `${levelLabel(index + 1)} ${count} 个`)
	return `共 ${summary.total} 个书签：${levels.join('、')}`
}
