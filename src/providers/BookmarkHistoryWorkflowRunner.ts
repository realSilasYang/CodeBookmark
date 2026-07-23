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
