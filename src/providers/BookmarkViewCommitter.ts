/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `BookmarkViewCommitter`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`commitBookmarkView`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import type { Bookmark } from '../models/Bookmark'
import type { PreparedBookmarkView } from './BookmarkViewPreparation'
import type { ViewTransitionState } from '../util/ViewTransition'

interface BookmarkViewCommitPort {
	currentStorageScope(): string | undefined
	currentBookmarkCount(): number
	handleStorageScopeChange(): void
	setCurrentStorageScope(storageScope: string): void
	setCurrentScopeFilePath(scopeFilePath: string | undefined): void
	setWorkspaceOrder(order: string[] | null): void
	setBookmarks(bookmarks: PreparedBookmarkView['bookmarks']): void
	rebuildFileNodeCache(bookmarks: readonly Bookmark[]): void
	invalidatePathIndex(): void
}

export function commitBookmarkView(
	prepared: PreparedBookmarkView,
	port: BookmarkViewCommitPort,
): ViewTransitionState {
	const previousHasContent = port.currentBookmarkCount() > 0
	if (prepared.storageScope !== port.currentStorageScope()) port.handleStorageScopeChange()
	port.setCurrentStorageScope(prepared.storageScope)
	port.setCurrentScopeFilePath(prepared.scopeFilePath)
	port.setWorkspaceOrder(prepared.workspaceOrder)
	port.setBookmarks(prepared.bookmarks)
	port.rebuildFileNodeCache(prepared.bookmarks.values)
	port.invalidatePathIndex()
	return { previousHasContent, nextHasContent: prepared.bookmarks.size > 0 }
}
