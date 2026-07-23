/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `AISelectedBookmarksWorkflowRunner`。
 *
 * 实现要点：执行一次边界清晰的工作流，通过端口注入副作用以便独立验证每条分支。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`AISelectedBookmarksWorkflowPort`、`runOptimizeSelectedBookmarks`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
import { isUserCancelledError, localize } from '../i18n/Localization'

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
		vscode.window.showInformationMessage(localize(
			'选中的项不包含可优化的书签。',
			'The selection does not contain bookmarks that can be improved.',
		))
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
			vscode.window.showWarningMessage(localize(
				`文件 ${path.basename(filePath)} 正在进行 AI 任务，请稍后再试。`,
				`An AI task is already running for ${path.basename(filePath)}. Try again shortly.`,
			))
			continue
		}

		let sourceSnapshot: AIFileSnapshot
		try {
			sourceSnapshot = await readAISourceSnapshot(filePath, openDocumentForPath)
		} catch (error) {
			port.taskRegistry.finishFile(taskKey)
			const message = errorMessage(error)
			if (isUserCancelledError(error)) break
			vscode.window.showErrorMessage(localize(
				`无法读取文件源码 ${filePath}：${message}`,
				`Unable to read source from ${filePath}: ${message}`,
			))
			continue
		}
		const fileContent = sourceSnapshot.content

		try {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: localize(
					`AI 正在优化 ${path.basename(filePath)} 中的 ${bookmarks.length} 个书签...`,
					`AI is improving ${bookmarks.length} bookmarks in ${path.basename(filePath)}…`,
				),
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
							const formattedSummary = formatBookmarkLevelSummary(summary)
							vscode.window.showInformationMessage(localize(
								`选中书签优化完成，更新结果：${formattedSummary}。`,
								`Selected bookmark improvement completed. Updated: ${formattedSummary}.`,
							))
						} else {
							vscode.window.showInformationMessage(localize(
								'AI 未能返回任何有效的标签更新。',
								'AI did not return any valid label updates.',
							))
						}
					}
				} finally {
					if (statusDisposable) statusDisposable.dispose()
				}
			})
		} catch (error: unknown) {
			const message = errorMessage(error)
			if (isUserCancelledError(error)) {
				vscode.window.showInformationMessage(localize(
					`已取消 AI 选中书签优化任务：${path.basename(filePath)}`,
					`Cancelled AI improvement for selected bookmarks in ${path.basename(filePath)}.`,
				))
			} else {
				vscode.window.showErrorMessage(localize(
					`AI 优化选中书签失败：${message}`,
					`AI improvement for selected bookmarks failed: ${message}`,
				))
			}
		} finally {
			port.taskRegistry.finishFile(taskKey)
		}
	}
	if (changedPaths.size > 0 && port.currentStorageScope() === taskScope) port.refreshDecoration()
}
