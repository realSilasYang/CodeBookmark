/**
 * 只优化用户在树中选中的书签，建立可提交的变更集后统一保存与刷新。
 * 选择为空、节点不属于当前作用域或 AI 没有给出有效变化时，不制造无意义的历史记录。
 */
import * as path from 'path'
import * as vscode from 'vscode'
import { Bookmark } from '../models/Bookmark'
import { AIService } from '../util/AIService'
import { Helper } from '../util/Helper'
import { applyAIOptimizationChanges, resolveAIOptimizationChanges } from '../util/AIOptimizationMutations'
import { assertAISourceSnapshot, readAISourceSnapshot, type AIFileSnapshot } from '../util/AISourceSnapshot'
import { formatBookmarkLevelSummary, summarizeBookmarks } from '../util/BookmarkStatistics'
import { isBookmarkItemContext } from '../util/ContextValue'
import type { AIFolderWorkflowPort } from './AIFolderWorkflowRunner'
import { isUserCancelledError, localize } from '../i18n/Localization'
import { errorMessage } from '../util/ErrorMessage'
import { findOpenFileDocument } from '../util/VscodeDocument'
import { ReplaceableDisposable } from '../util/ReplaceableDisposable'

export interface AISelectedBookmarksWorkflowPort extends AIFolderWorkflowPort {
	absoluteBookmarkPath(bookmarkPath: string): string
	resolveTargets(bookmark?: Bookmark, selectedBookmarks?: Bookmark[]): Bookmark[]
}

export async function runOptimizeSelectedBookmarks(
	bookmark: Bookmark | undefined,
	selectedBookmarks: Bookmark[] | undefined,
	port: AISelectedBookmarksWorkflowPort,
): Promise<void> {
	const taskScope = port.currentStorageScope()
	if (!taskScope) return
	const targets = port.resolveTargets(bookmark, selectedBookmarks)
	if (targets.length === 0) return

	const bookmarksToOptimize = targets.filter(target => isBookmarkItemContext(target.contextValue))
	if (bookmarksToOptimize.length === 0) {
		vscode.window.showInformationMessage(localize("providers.AISelectedBookmarksWorkflowRunner.theSelectionDoesNotContainBookmarksThatCanBe"))
		return
	}

	const groupedByPath = new Map<string, Bookmark[]>()
	for (const target of bookmarksToOptimize) {
		const filePath = port.absoluteBookmarkPath(target.path)
		const grouped = groupedByPath.get(filePath)
		if (grouped) grouped.push(target)
		else groupedByPath.set(filePath, [target])
	}

	let hasSavedUndoState = false
	const changedPaths = new Set<string>()

	for (const [filePath, bookmarks] of groupedByPath.entries()) {
		port.workflowGuard.assertStorageScope(taskScope)
		const pathRel = port.absoluteToRelative(filePath)
		const taskKey = port.taskRegistry.fileTaskKey(taskScope, pathRel)
		const bookmarkInputSnapshot = port.workflowGuard.captureBookmarkInput(pathRel)
		if (!port.taskRegistry.tryStartFile(taskKey)) {
			vscode.window.showWarningMessage(localize("providers.AISelectedBookmarksWorkflowRunner.anAiTaskIsAlreadyRunningForTryAgain", { fileName: path.basename(filePath) }))
			continue
		}

		let sourceSnapshot: AIFileSnapshot
		try {
			sourceSnapshot = await readAISourceSnapshot(filePath, findOpenFileDocument)
		} catch (error) {
			port.taskRegistry.finishFile(taskKey)
			const message = errorMessage(error)
			if (isUserCancelledError(error)) break
			vscode.window.showErrorMessage(localize("providers.AISelectedBookmarksWorkflowRunner.unableToReadSourceFrom", { filePath, message }))
			continue
		}
		const fileContent = sourceSnapshot.content

		try {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: localize("providers.AISelectedBookmarksWorkflowRunner.aiIsImprovingBookmarksIn", { fileName: path.basename(filePath), bookmarksCount: bookmarks.length }),
				cancellable: true,
			}, async (_progress, token) => {
				const statusMessage = new ReplaceableDisposable<vscode.Disposable>()
				try {
					const optimizedList = await AIService.optimizeBookmarks(
						fileContent,
						filePath,
						bookmarks,
						(message: string) => {
							statusMessage.replace(vscode.window.setStatusBarMessage(`AI: ${message}`))
						},
						token,
					)
					await assertAISourceSnapshot(filePath, sourceSnapshot)
					if (token.isCancellationRequested) return
					port.workflowGuard.assertStorageScope(taskScope)
					port.workflowGuard.assertBookmarkInput(pathRel, bookmarkInputSnapshot)

					if (optimizedList && optimizedList.length > 0) {
						const changes = resolveAIOptimizationChanges(
							optimizedList,
							bookmarks,
							candidate => port.findBookmark(candidate),
							port.assignAIIcons(),
							Helper.formatLabelSpacing,
						)

						if (changes.length > 0) {
							if (!hasSavedUndoState) {
								port.saveUndoState('optimizeAIBookmarks')
								hasSavedUndoState = true
							}
							applyAIOptimizationChanges(changes)
							changedPaths.add(filePath)
							port.saveBookmarks([filePath])
							const summary = summarizeBookmarks(changes.map(change => change.bookmark))
							const formattedSummary = formatBookmarkLevelSummary(summary)
							vscode.window.showInformationMessage(localize("providers.AISelectedBookmarksWorkflowRunner.selectedBookmarkImprovementCompletedUpdated", { formattedSummary }))
						} else {
							vscode.window.showInformationMessage(localize("providers.AISelectedBookmarksWorkflowRunner.aiDidNotReturnAnyValidLabelUpdates"))
						}
					}
				} finally {
					statusMessage.dispose()
				}
			})
		} catch (error: unknown) {
			const message = errorMessage(error)
			if (isUserCancelledError(error)) {
				vscode.window.showInformationMessage(localize("providers.AISelectedBookmarksWorkflowRunner.cancelledAiImprovementForSelectedBookmarksIn", { fileName: path.basename(filePath) }))
			} else {
				vscode.window.showErrorMessage(localize("providers.AISelectedBookmarksWorkflowRunner.aiImprovementForSelectedBookmarksFailed", { message }))
			}
		} finally {
			port.taskRegistry.finishFile(taskKey)
		}
	}
	if (changedPaths.size > 0 && port.currentStorageScope() === taskScope) port.refreshDecoration()
}
