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
