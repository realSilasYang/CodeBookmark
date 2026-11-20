/**
 * 将书签树的展示排序记录在当前工作区或独立脚本的 VS Code 状态中。
 * 初次打开时按代码位置升序排列，拖拽形成的自定义顺序由书签树单独保存。
 */
import type { ExtensionContext } from 'vscode'
import { ExtensionStateKeys } from '../util/constants/ExtensionStateKeys'

export enum SortModeBookmark {
	Custom = 0,
	TimeAsc = 1,
	TimeDesc = 2,
	LineAsc = 3,
	LineDesc = 4,
}

export interface BookmarkSortPreference {
	mode: SortModeBookmark
	save(mode: SortModeBookmark): Thenable<void>
}

export function bookmarkSortPreference(
	context: Pick<ExtensionContext, 'workspaceState' | 'globalState'>,
	scope: string | undefined,
): BookmarkSortPreference | undefined {
	const isWorkspace = scope?.startsWith('workspace:')
	if (!isWorkspace && !scope?.startsWith('file:')) return undefined

	const state = isWorkspace ? context.workspaceState : context.globalState
	const key = isWorkspace ? ExtensionStateKeys.bookmarkSortMode : `${ExtensionStateKeys.bookmarkSortMode}:${scope}`
	const saved = state.get<unknown>(key)
	const mode = typeof saved === 'number' && SortModeBookmark[saved] !== undefined ? saved : SortModeBookmark.LineAsc
	return { mode, save: next => state.update(key, next) }
}
