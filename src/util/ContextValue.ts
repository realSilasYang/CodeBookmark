/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `ContextValue`。
 *
 * 实现要点：集中实现 `ContextValue` 的无界面规则和边界处理，供多个上层流程复用。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`ContextBookmark`、`isBookmarkItemContext`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
export enum ContextBookmark {
	Bookmark = 'bookmark',
	File = 'file',
	BookmarkInvalid = 'bookmarkInvalid',
	BookmarkPinned = 'bookmarkPinned',
	CodeMarkerDefault = 'bookmarkCodeMarkerDefault',
	CodeMarkerCustom = 'bookmarkCodeMarkerCustom',
	CodeMarkerPinnedDefault = 'bookmarkCodeMarkerPinnedDefault',
	CodeMarkerPinnedCustom = 'bookmarkCodeMarkerPinnedCustom',
}

const BOOKMARK_ITEM_CONTEXTS = new Set<ContextBookmark>([
	ContextBookmark.Bookmark,
	ContextBookmark.BookmarkPinned,
	ContextBookmark.CodeMarkerDefault,
	ContextBookmark.CodeMarkerCustom,
	ContextBookmark.CodeMarkerPinnedDefault,
	ContextBookmark.CodeMarkerPinnedCustom,
])

export function isBookmarkItemContext(value: string | undefined): boolean {
	return BOOKMARK_ITEM_CONTEXTS.has(value as ContextBookmark)
}
