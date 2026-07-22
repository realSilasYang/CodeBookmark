export const UNDO_ACTION_LABELS = {
	modifyBookmarks: '修改书签',
	reorderFiles: '调整文件顺序',
	moveBookmarks: '移动书签',
	addBookmarks: '添加书签',
	toggleBookmarks: '添加/删除书签',
	deleteBookmarks: '删除书签',
	generateAIBookmarks: 'AI 生成书签',
	optimizeAIBookmarks: 'AI 优化书签标签',
	importBookmarks: '导入书签配置',
	renameBookmarks: '重命名书签',
	updateBookmarkPosition: '更新书签位置',
	updateBookmarkAndRename: '更新位置并重命名',
	changeBookmarkIcons: '更改书签图标',
	restoreBookmarkIcons: '恢复默认图标',
	clearInvalidBookmarks: '清除失效书签',
	setBookmarkContainer: '设置新书签容器',
	unsetBookmarkContainer: '取消新书签容器',
} as const

export type UndoAction = keyof typeof UNDO_ACTION_LABELS
