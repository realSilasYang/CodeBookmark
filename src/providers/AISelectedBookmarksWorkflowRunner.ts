import * as path from 'path'
import * as vscode from 'vscode'
import { Bookmark } from '../models/Bookmark'
import { AIService } from '../util/AIService'
import { Helper } from '../util/Helper'
import { applyAIOptimizationChanges, resolveAIOptimizationChanges } from '../util/AIOptimizationMutations'
import { normalizedAbsolutePath } from '../util/AbsolutePath'
import { assertAISourceSnapshot, readAISourceSnapshot, type AIFileSnapshot } from '../util/AISourceSnapshot'
import { formatBookmarkLevelSummary, summarizeBookmarks } from '../util/BookmarkStatistics'
import { isBookmarkItemContext } from '../util/ContextValue'
import type { AIFolderWorkflowPort } from './AIFolderWorkflowRunner'

export interface AISelectedBookmarksWorkflowPort extends AIFolderWorkflowPort {
	absoluteBookmarkPath(bookmarkPath: string): string
	resolveTargets(bookmark?: Bookmark, selectedBookmarks?: Bookmark[]): Bookmark[]
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function openDocumentForPath(filePath: string): vscode.TextDocument | undefined {
	return vscode.workspace.textDocuments.find(document => document.uri.scheme === 'file'
		&& normalizedAbsolutePath(document.uri.fsPath) === normalizedAbsolutePath(filePath))
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
		vscode.window.showInformationMessage('选中的项不包含可优化的书签。')
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
			vscode.window.showWarningMessage(`文件 ${path.basename(filePath)} 正在进行 AI 任务，请稍后再试。`)
			continue
		}

		let sourceSnapshot: AIFileSnapshot
		try {
			sourceSnapshot = await readAISourceSnapshot(filePath, openDocumentForPath)
		} catch (error) {
			port.taskRegistry.finishFile(taskKey)
			const message = errorMessage(error)
			if (message.includes('主动取消')) break
			vscode.window.showErrorMessage(`无法读取文件源码 ${filePath}：${message}`)
			continue
		}
		const fileContent = sourceSnapshot.content

		try {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `AI 正在优化 ${path.basename(filePath)} 中的 ${bookmarks.length} 个书签...`,
				cancellable: true,
			}, async (_progress, token) => {
				let statusDisposable: vscode.Disposable | undefined
				try {
					const optimizedList = await AIService.optimizeBookmarks(
						fileContent,
						filePath,
						bookmarks,
						(message: string) => {
							if (statusDisposable) statusDisposable.dispose()
							statusDisposable = vscode.window.setStatusBarMessage(`AI: ${message}`)
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
							vscode.window.showInformationMessage(`选中书签优化完成，更新结果：${formatBookmarkLevelSummary(summary)}。`)
						} else {
							vscode.window.showInformationMessage('AI 未能返回任何有效的标签更新。')
						}
					}
				} finally {
					if (statusDisposable) statusDisposable.dispose()
				}
			})
		} catch (error: unknown) {
			const message = errorMessage(error)
			if (message.includes('取消')) {
				vscode.window.showInformationMessage(`已取消 AI 选中书签优化任务：${path.basename(filePath)}`)
			} else {
				vscode.window.showErrorMessage(`AI 优化选中书签失败：${message}`)
			}
		} finally {
			port.taskRegistry.finishFile(taskKey)
		}
	}
	if (changedPaths.size > 0 && port.currentStorageScope() === taskScope) port.refreshDecoration()
}
