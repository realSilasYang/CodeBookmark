/**
 * 执行撤销或重做，并把历史快照重新绑定到当前书签作用域后提交。
 * 历史为空或作用域已经变化时保持现状，避免跨文件夹恢复不属于当前视图的数据。
 */
import type { UndoApplyResult } from './UndoManager'
import type { Bookmark } from '../models/Bookmark'
import { formatBookmarkLevelSummary, summarizeBookmarkTrees } from '../util/BookmarkStatistics'
import { undoActionLabel } from '../util/UndoActions'
import { localize } from '../i18n/Localization'
import type { WorkspaceLayout } from '../models/WorkspaceLayout'

type BookmarkHistoryOperation = 'undo' | 'redo'

export interface BookmarkHistoryWorkflowPort {
	applyHistory(operation: BookmarkHistoryOperation): UndoApplyResult | undefined
	currentStorageScope(): string | undefined
	setWorkspaceOrder(order: string[] | null): void
	setWorkspaceLayout(layout: WorkspaceLayout | null): void
	workspaceOrderFilePath(): string | undefined
	writeWorkspaceOrder(filePath: string, order: string[]): Promise<boolean>
	reportWorkspaceOrderSaveFailure(): void
	bookmarkSourcePaths(): string[]
	bookmarks(): Iterable<Bookmark>
	saveBookmarks(filePaths: string[]): void
	saveAllBookmarks(): void
	commitTopology(): Promise<void>
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
			? localize("providers.BookmarkHistoryWorkflowRunner.thereIsNothingToUndo")
			: localize("providers.BookmarkHistoryWorkflowRunner.thereIsNothingToRedo"))
		return
	}

	await persistRestoredWorkspaceOrder(result.workspaceOrder, port)
	port.setWorkspaceLayout(result.workspaceLayout)
	const affectedPaths = new Set([...previousPaths, ...port.bookmarkSourcePaths()])
	if (affectedPaths.size > 0) port.saveBookmarks([...affectedPaths])
	else port.saveAllBookmarks()
	await port.commitTopology()
	port.refreshDecoration()
	const prefix = operation === 'undo'
		? localize("providers.BookmarkHistoryWorkflowRunner.undone")
		: localize("providers.BookmarkHistoryWorkflowRunner.redone")
	const summary = summarizeBookmarkTrees(port.bookmarks())
	const actionLabel = undoActionLabel(result.action)
	const formattedSummary = formatBookmarkLevelSummary(summary)
	port.showAppliedMessage(localize("providers.BookmarkHistoryWorkflowRunner.currentResult", { prefix, actionLabel, formattedSummary }))
}
