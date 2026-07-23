/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `BookmarkHistoryWorkflowRunner`。
 *
 * 实现要点：执行一次边界清晰的工作流，通过端口注入副作用以便独立验证每条分支。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`BookmarkHistoryWorkflowPort`、`runBookmarkHistoryOperation`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import type { UndoApplyResult } from './UndoManager'
import type { Bookmark } from '../models/Bookmark'
import { formatBookmarkLevelSummary, summarizeBookmarkTrees } from '../util/BookmarkStatistics'
import { UNDO_ACTION_LABELS, UNDO_ACTION_LABELS_EN } from '../util/UndoActions'
import { currentLanguage, localize } from '../i18n/Localization'

type BookmarkHistoryOperation = 'undo' | 'redo'

export interface BookmarkHistoryWorkflowPort {
	applyHistory(operation: BookmarkHistoryOperation): UndoApplyResult | undefined
	currentStorageScope(): string | undefined
	setWorkspaceOrder(order: string[] | null): void
	workspaceOrderFilePath(): string | undefined
	writeWorkspaceOrder(filePath: string, order: string[]): Promise<boolean>
	reportWorkspaceOrderSaveFailure(): void
	bookmarkSourcePaths(): string[]
	bookmarks(): Iterable<Bookmark>
	saveBookmarks(filePaths: string[]): void
	saveAllBookmarks(): void
	refreshDecoration(): void
	showAppliedMessage(message: string): void
	showUnavailableMessage(message: string): void
}

async function persistRestoredWorkspaceOrder(
	order: string[] | null,
	port: BookmarkHistoryWorkflowPort,
): Promise<void> {
	if (!port.currentStorageScope()?.startsWith('workspace:')) {
		port.setWorkspaceOrder(null)
		return
	}
	const restoredOrder = order ? [...order] : []
	port.setWorkspaceOrder(restoredOrder)
	const orderFilePath = port.workspaceOrderFilePath()
	if (!orderFilePath) return
	if (!await port.writeWorkspaceOrder(orderFilePath, restoredOrder)) {
		port.reportWorkspaceOrderSaveFailure()
	}
}

export async function runBookmarkHistoryOperation(
	operation: BookmarkHistoryOperation,
	port: BookmarkHistoryWorkflowPort,
): Promise<void> {
	const previousPaths = port.bookmarkSourcePaths()
	const result = port.applyHistory(operation)
	if (!result) {
		port.showUnavailableMessage(operation === 'undo'
			? localize('没有可以撤销的操作。', 'There is nothing to undo.')
			: localize('没有可以恢复的操作。', 'There is nothing to redo.'))
		return
	}

	await persistRestoredWorkspaceOrder(result.workspaceOrder, port)
	const affectedPaths = new Set([...previousPaths, ...port.bookmarkSourcePaths()])
	if (affectedPaths.size > 0) port.saveBookmarks([...affectedPaths])
	else port.saveAllBookmarks()
	port.refreshDecoration()
	const prefix = operation === 'undo'
		? localize('已撤销', 'Undone')
		: localize('已重做', 'Redone')
	const summary = summarizeBookmarkTrees(port.bookmarks())
	const actionLabel = currentLanguage() === 'zh-cn'
		? UNDO_ACTION_LABELS[result.action]
		: UNDO_ACTION_LABELS_EN[result.action]
	const formattedSummary = formatBookmarkLevelSummary(summary)
	port.showAppliedMessage(localize(
		`${prefix}：${actionLabel}。当前结果：${formattedSummary}。`,
		`${prefix}: ${actionLabel}. Current result: ${formattedSummary}.`,
	))
}
