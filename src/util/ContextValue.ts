/**
 * 集中定义书签树节点的 contextValue，并提供文件节点与普通书签节点的类型判断。
 * 命令菜单依赖这些稳定值决定显隐，不能把展示文案当作节点身份。
 */
export enum ContextBookmark {
	Bookmark = 'bookmark',
	File = 'file',
	FileCustom = 'fileCustom',
	FilePinned = 'filePinned',
	FilePinnedCustom = 'filePinnedCustom',
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
