/**
 * 统计书签总数及各层级数量，并合并多个脚本或文件夹操作的结果。
 * 格式化函数生成中英文完成提示，让批量操作准确说明新增、更新或删除了多少层级节点。
 */
import { localize, type LocalizationKey } from '../i18n/Localization'

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
	const namedLevelKeys: readonly LocalizationKey[] = [
		'bookmarkStatistics.level1', 'bookmarkStatistics.level2', 'bookmarkStatistics.level3',
		'bookmarkStatistics.level4', 'bookmarkStatistics.level5', 'bookmarkStatistics.level6',
		'bookmarkStatistics.level7', 'bookmarkStatistics.level8', 'bookmarkStatistics.level9',
		'bookmarkStatistics.level10',
	]
	const namedKey = namedLevelKeys[level - 1]
	return namedKey ? localize(namedKey) : localize('bookmarkStatistics.level', { level })
}

export function formatBookmarkLevelSummary(summary: BookmarkLevelSummary): string {
	if (summary.total === 0) return localize('bookmarkStatistics.empty')
	const levels = summary.levelCounts.map((count, index) =>
		localize('bookmarkStatistics.levelCount', { level: levelLabel(index + 1), count }))
	return localize(summary.total === 1
		? 'bookmarkStatistics.summarySingle'
		: 'bookmarkStatistics.summaryMultiple', {
		total: summary.total,
		levels: levels.join(localize('common.listSeparator')),
	})
}
