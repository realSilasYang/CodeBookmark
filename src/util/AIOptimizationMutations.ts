/**
 * 把 AI 给出的标签和图标建议解析为针对现有书签 ID 的最小变更集，并应用到树上。
 * 未知 ID、无变化项和自动标记节点都会被忽略，保证优化不会创建、删除或重排书签。
 */
import type { AIOptimizedBookmark } from './AIBookmarkSchema'

interface AIOptimizationBookmark {
	readonly id: string
	label?: string | { label: string }
	icon: string
	readonly isUsingDefaultIcon: boolean
	readonly defaultIconName: string
	codeMarker?: { generatedLabel?: string, iconCustomized: boolean }
	refreshDisplayProps(): void
}

interface AIOptimizationChange<TBookmark extends AIOptimizationBookmark = AIOptimizationBookmark> {
	bookmark: TBookmark
	label?: string
	iconName?: string
}

export function resolveAIOptimizationChanges<TBookmark extends AIOptimizationBookmark>(
	updates: readonly AIOptimizedBookmark[],
	candidates: readonly TBookmark[],
	findBookmark: (bookmark: TBookmark) => TBookmark | undefined,
	assignIcons: boolean,
	formatLabel: (label: string) => string,
): AIOptimizationChange<TBookmark>[] {
	const candidatesById = new Map(candidates.map(bookmark => [
		bookmark.id,
		findBookmark(bookmark) ?? bookmark,
	]))
	const changes: AIOptimizationChange<TBookmark>[] = []
	for (const update of updates) {
		const bookmark = candidatesById.get(update.id)
		if (!bookmark) continue
		const label = update.new_label === undefined ? undefined : formatLabel(update.new_label)
		const currentLabel = typeof bookmark.label === 'string' ? bookmark.label : bookmark.label?.label ?? ''
		const changedLabel = label !== undefined && label !== currentLabel ? label : undefined
		const changedIcon = assignIcons
			&& bookmark.isUsingDefaultIcon
			&& update.iconName !== undefined
			&& update.iconName !== bookmark.icon
			? update.iconName
			: undefined
		if (changedLabel !== undefined || changedIcon !== undefined) {
			changes.push({ bookmark, label: changedLabel, iconName: changedIcon })
		}
	}
	return changes
}

export function applyAIOptimizationChanges<TBookmark extends AIOptimizationBookmark>(
	changes: readonly AIOptimizationChange<TBookmark>[],
): void {
	for (const change of changes) {
		if (change.label !== undefined) {
			change.bookmark.label = change.label
			if (change.bookmark.codeMarker) change.bookmark.codeMarker.generatedLabel = change.label
		}
		if (change.iconName !== undefined) {
			change.bookmark.icon = change.iconName
			if (change.bookmark.codeMarker) {
				change.bookmark.codeMarker.iconCustomized = change.iconName !== change.bookmark.defaultIconName
			}
		}
		change.bookmark.refreshDisplayProps()
	}
}
