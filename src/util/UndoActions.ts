/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `UndoActions`。
 *
 * 实现要点：集中实现 `UndoActions` 的无界面规则和边界处理，供多个上层流程复用。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`UNDO_ACTION_LABELS`、`UndoAction`、`UNDO_ACTION_LABELS_EN`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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

export const UNDO_ACTION_LABELS_EN: Record<UndoAction, string> = {
	modifyBookmarks: 'Modify Bookmarks',
	reorderFiles: 'Reorder Files',
	moveBookmarks: 'Move Bookmarks',
	addBookmarks: 'Add Bookmarks',
	toggleBookmarks: 'Add/Remove Bookmarks',
	deleteBookmarks: 'Delete Bookmarks',
	generateAIBookmarks: 'Generate Bookmarks with AI',
	optimizeAIBookmarks: 'Improve Bookmark Labels with AI',
	importBookmarks: 'Import Bookmark Configuration',
	renameBookmarks: 'Rename Bookmarks',
	updateBookmarkPosition: 'Update Bookmark Position',
	updateBookmarkAndRename: 'Update Position and Rename',
	changeBookmarkIcons: 'Change Bookmark Icons',
	restoreBookmarkIcons: 'Restore Default Icons',
	clearInvalidBookmarks: 'Clear Invalid Bookmarks',
	setBookmarkContainer: 'Set New Bookmark Container',
	unsetBookmarkContainer: 'Unset New Bookmark Container',
}
