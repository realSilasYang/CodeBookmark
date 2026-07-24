/**
 * 以稳定消息键标识可进入撤销与重做历史的领域操作。
 * 持久化只保存动作身份，界面在显示时再根据活动语言解析动作名称。
 */
import { localize, type LocalizationKey } from '../i18n/Localization'

export const UNDO_ACTION_MESSAGE_KEYS = {
	modifyBookmarks: 'undoAction.modifyBookmarks',
	reorderFiles: 'undoAction.reorderFiles',
	moveBookmarks: 'undoAction.moveBookmarks',
	addBookmarks: 'undoAction.addBookmarks',
	toggleBookmarks: 'undoAction.toggleBookmarks',
	deleteBookmarks: 'undoAction.deleteBookmarks',
	generateAIBookmarks: 'undoAction.generateAIBookmarks',
	optimizeAIBookmarks: 'undoAction.optimizeAIBookmarks',
	importBookmarks: 'undoAction.importBookmarks',
	renameBookmarks: 'undoAction.renameBookmarks',
	updateBookmarkPosition: 'undoAction.updateBookmarkPosition',
	updateBookmarkAndRename: 'undoAction.updateBookmarkAndRename',
	changeBookmarkIcons: 'undoAction.changeBookmarkIcons',
	restoreBookmarkIcons: 'undoAction.restoreBookmarkIcons',
	clearInvalidBookmarks: 'undoAction.clearInvalidBookmarks',
	setBookmarkContainer: 'undoAction.setBookmarkContainer',
	unsetBookmarkContainer: 'undoAction.unsetBookmarkContainer',
} as const satisfies Record<string, LocalizationKey>

export type UndoAction = keyof typeof UNDO_ACTION_MESSAGE_KEYS

export function undoActionLabel(action: UndoAction): string {
	return localize(UNDO_ACTION_MESSAGE_KEYS[action])
}
