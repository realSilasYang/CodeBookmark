import * as path from 'path'
import * as vscode from 'vscode'
import type { Bookmark } from '../models/Bookmark'
import { AIService, isAIAuthenticationError, isAIRateLimitError } from '../util/AIService'
import { Helper } from '../util/Helper'
import { applyAIOptimizationChanges, resolveAIOptimizationChanges } from '../util/AIOptimizationMutations'
import { normalizedAbsolutePath } from '../util/AbsolutePath'
import { listAISourceFilesInFolder } from '../util/AISourceFolderScanner'
import { assertAISourceSnapshot, readAISourceSnapshot, type AIFileSnapshot } from '../util/AISourceSnapshot'
import { formatBookmarkLevelSummary, summarizeBookmarks, summarizeBookmarkTrees } from '../util/BookmarkStatistics'
import { logger } from '../util/Logger'
import { buildAIBookmarks } from './AIBookmarkBuilder'
import type { AIGenerationMode, AISingleFileWorkflowPort } from './AISingleFileWorkflowRunner'

export interface AIFolderWorkflowPort extends Omit<AISingleFileWorkflowPort, 'documentLines'> {
	currentStorageScope(): string | undefined
}

export interface AIFolderWorkflowTarget {
	readonly directory: string
	readonly storageScope: string
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function openDocumentForPath(filePath: string): vscode.TextDocument | undefined {
	return vscode.workspace.textDocuments.find(document => document.uri.scheme === 'file'
		&& normalizedAbsolutePath(document.uri.fsPath) === normalizedAbsolutePath(filePath))
}

function shouldGenerateForFolderMode(mode: AIGenerationMode, bookmarkCount: number): boolean {
	return mode === 'skip_existing' ? bookmarkCount === 0 : bookmarkCount > 0
}

export async function runGenerateBookmarksForFolder(
	target: AIFolderWorkflowTarget,
	mode: AIGenerationMode,
	port: AIFolderWorkflowPort,
): Promise<void> {
	const taskScope = target.storageScope
	port.workflowGuard.assertStorageScope(taskScope)
	const dirPath = target.directory
	const filesToProcess = await listAISourceFilesInFolder(dirPath)

	if (filesToProcess.length === 0) {
		vscode.window.showInformationMessage('未在当前文件夹及其子目录中找到支持的脚本文件。')
		return
	}

	if (filesToProcess.length > 10) {
		const confirm = await vscode.window.showWarningMessage(
			`当前文件夹（包含子目录）共扫描到 ${filesToProcess.length} 个脚本文件，批量处理可能需要较长时间并大量消耗 AI API 的额度。确定要继续吗？`,
			{ modal: true },
			'确定',
		)
		if (confirm !== '确定') return
	}

	if (!port.taskRegistry.tryStartFolder(taskScope)) {
		vscode.window.showWarningMessage('当前书签作用域已有 AI 文件夹任务正在运行，请稍候再试。')
		return
	}
	try {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'AI 批量智能提取书签运行中...',
			cancellable: true,
		}, async (progress, token) => {
			let fileCount = 0
			let failedFilesCount = 0
			const changedPaths: string[] = []
			let statusDisposable: vscode.Disposable | undefined
			let hasSavedUndoState = false
			let scopeChanged = false
			let userStopped = false
			let consecutiveRequestFailures = 0
			const generatedBookmarks: Bookmark[] = []

			for (const filePath of filesToProcess) {
				if (token.isCancellationRequested) break
				if (port.currentStorageScope() !== taskScope) {
					scopeChanged = true
					break
				}
				const pathRel = port.absoluteToRelative(filePath)
				const taskKey = port.taskRegistry.fileTaskKey(taskScope, pathRel)
				if (port.taskRegistry.isFileRunning(taskKey)) {
					vscode.window.showWarningMessage(`文件 ${path.basename(filePath)} 正在进行 AI 任务，请稍后再试。`)
					continue
				}
				if (!shouldGenerateForFolderMode(mode, port.bookmarksForPath(pathRel).length)) continue
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
					if (message.includes('主动取消')) {
						userStopped = true
						break
					}
					failedFilesCount++
					logger.error(`[AI Batch Generate] Failed to read ${filePath}: ${message}`)
					continue
				}
				const codeContent = sourceSnapshot.content

				fileCount++
				progress.report({ message: `（${fileCount}/${filesToProcess.length}）正在提取：${path.basename(filePath)}` })

				try {
					const aiBookmarks = await AIService.generateBookmarks(codeContent, filePath, (message: string) => {
						if (statusDisposable) statusDisposable.dispose()
						statusDisposable = vscode.window.setStatusBarMessage(`AI: ${message}`)
					}, token)
					consecutiveRequestFailures = 0
					await assertAISourceSnapshot(filePath, sourceSnapshot)
					port.workflowGuard.assertStorageScope(taskScope)

					if (token.isCancellationRequested) {
						port.taskRegistry.finishFile(taskKey)
						break
					}

					if (aiBookmarks && aiBookmarks.length > 0) {
						const currentBookmarks = port.bookmarksForPath(pathRel)
						if (!shouldGenerateForFolderMode(mode, currentBookmarks.length)) continue
						if (mode === 'overwrite') {
							port.workflowGuard.assertBookmarkInput(pathRel, bookmarkInputSnapshot)
						}
						const built = buildAIBookmarks(
							aiBookmarks,
							codeContent.split(/\r\n|\n|\r/),
							pathRel,
							currentBookmarks,
							mode === 'overwrite',
							port.assignAIIcons(),
						)
						if (built.roots.length === 0) continue

						if (!hasSavedUndoState) {
							port.saveUndoState('generateAIBookmarks')
							hasSavedUndoState = true
						}

						if (mode === 'overwrite') {
							for (const bookmark of currentBookmarks) {
								if (bookmark.id) port.deleteBookmark(bookmark.id)
							}
						}
						for (const bookmark of built.roots) port.addBookmark(bookmark)
						generatedBookmarks.push(...built.roots)
						changedPaths.push(filePath)
						port.saveBookmarks([filePath])
					}
				} catch (error: unknown) {
					const message = errorMessage(error)
					if (token.isCancellationRequested || message.includes('主动取消')) {
						userStopped = true
						break
					}
					failedFilesCount++
					if (isAIAuthenticationError(error) || message.includes('API Key')) {
						userStopped = true
						vscode.window.showErrorMessage(`接口验证失败，请检查 API Key 配置: ${message}`)
						break
					}
					if (isAIRateLimitError(error)) {
						userStopped = true
						vscode.window.showErrorMessage(`AI 接口触发速率限制，已停止文件夹任务：${message}`)
						break
					}
					if (message.includes('作用域已切换')) {
						scopeChanged = true
						break
					}
					consecutiveRequestFailures++
					if (consecutiveRequestFailures >= 3) {
						userStopped = true
						vscode.window.showErrorMessage(`AI 请求连续失败 ${consecutiveRequestFailures} 次，已停止文件夹任务：${message}`)
						break
					}
					logger.error(`[AI Batch Generate] Failed for ${pathRel}: ${message}`)
				} finally {
					port.taskRegistry.finishFile(taskKey)
				}
			}

			const generatedSummary = summarizeBookmarkTrees(generatedBookmarks)
			if ((token.isCancellationRequested || userStopped) && !scopeChanged) {
				vscode.window.showInformationMessage(`AI 文件夹任务已停止；此前 ${changedPaths.length} 个文件的结果已进入保存队列，生成结果：${formatBookmarkLevelSummary(generatedSummary)}。`)
			} else if (changedPaths.length > 0 && !scopeChanged && port.currentStorageScope() === taskScope) {
				port.refreshDecoration()
				const failMsg = failedFilesCount > 0 ? `（有 ${failedFilesCount} 个文件处理失败）` : ''
				vscode.window.showInformationMessage(`文件夹 AI 处理完成，已处理 ${changedPaths.length} 个文件；生成结果：${formatBookmarkLevelSummary(generatedSummary)}。${failMsg}`)
			} else if (changedPaths.length === 0 && !token.isCancellationRequested && !scopeChanged) {
				const failMsg = failedFilesCount > 0 ? `（其中 ${failedFilesCount} 个文件处理失败）` : ''
				vscode.window.showInformationMessage(`AI 处理完毕，没有生成新的书签；${formatBookmarkLevelSummary(generatedSummary)}。${failMsg}`)
			}
			if (scopeChanged) vscode.window.showInformationMessage(`书签作用域已切换，AI 文件夹任务已停止；此前处理结果：${formatBookmarkLevelSummary(generatedSummary)}。`)
			if (statusDisposable) statusDisposable.dispose()
		})
	} finally {
		port.taskRegistry.finishFolder(taskScope)
	}
}

export async function runOptimizeBookmarksForFolder(
	target: AIFolderWorkflowTarget,
	port: AIFolderWorkflowPort,
): Promise<void> {
	const taskScope = target.storageScope
	port.workflowGuard.assertStorageScope(taskScope)
	const dirPath = target.directory
	const files = await listAISourceFilesInFolder(dirPath)

	if (files.length === 0) {
		vscode.window.showInformationMessage('未在当前文件夹及其子目录中找到支持的脚本文件。')
		return
	}

	if (files.length > 10) {
		const confirm = await vscode.window.showWarningMessage(
			`当前文件夹（包含子目录）共扫描到 ${files.length} 个脚本文件，批量处理可能需要较长时间并大量消耗 AI API 的额度。确定要继续吗？`,
			{ modal: true },
			'确定',
		)
		if (confirm !== '确定') return
	}

	if (!port.taskRegistry.tryStartFolder(taskScope)) {
		vscode.window.showWarningMessage('当前书签作用域已有 AI 文件夹任务正在运行，请稍候再试。')
		return
	}
	try {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'AI 正在扫描文件夹中的书签...',
			cancellable: true,
		}, async (progress, token) => {
			let fileCount = 0
			let failedFilesCount = 0
			const changedPaths: string[] = []
			let statusDisposable: vscode.Disposable | undefined
			let hasSavedUndoState = false
			let scopeChanged = false
			let userStopped = false
			let consecutiveRequestFailures = 0
			const optimizedBookmarks: Bookmark[] = []

			for (const filePath of files) {
				if (token.isCancellationRequested) break
				if (port.currentStorageScope() !== taskScope) {
					scopeChanged = true
					break
				}
				const pathRel = port.absoluteToRelative(filePath)
				const taskKey = port.taskRegistry.fileTaskKey(taskScope, pathRel)
				if (port.taskRegistry.isFileRunning(taskKey)) {
					vscode.window.showWarningMessage(`文件 ${path.basename(filePath)} 正在进行 AI 任务，请稍后再试。`)
					continue
				}

				const existingBookmarks = port.bookmarksForPath(pathRel)
				if (existingBookmarks.length === 0) continue
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
					if (message.includes('主动取消')) {
						userStopped = true
						break
					}
					failedFilesCount++
					logger.error(`[AI Batch Optimize] Failed to read ${filePath}: ${message}`)
					continue
				}
				const codeContent = sourceSnapshot.content

				fileCount++
				progress.report({ message: `（${fileCount}/${files.length}）正在优化：${path.basename(filePath)}` })

				try {
					const optimizedList = await AIService.optimizeBookmarks(
						codeContent,
						filePath,
						existingBookmarks,
						(message: string) => {
							if (statusDisposable) statusDisposable.dispose()
							statusDisposable = vscode.window.setStatusBarMessage(`AI: ${message}`)
						},
						token,
					)
					consecutiveRequestFailures = 0
					await assertAISourceSnapshot(filePath, sourceSnapshot)
					port.workflowGuard.assertStorageScope(taskScope)

					if (token.isCancellationRequested) {
						port.taskRegistry.finishFile(taskKey)
						break
					}

					if (optimizedList && optimizedList.length > 0) {
						port.workflowGuard.assertBookmarkInput(pathRel, bookmarkInputSnapshot)
						const changes = resolveAIOptimizationChanges(
							optimizedList,
							port.bookmarksForPath(pathRel),
							bookmark => port.findBookmark(bookmark),
							port.assignAIIcons(),
							Helper.formatLabelSpacing,
						)
						if (changes.length === 0) continue
						if (!hasSavedUndoState) {
							port.saveUndoState('optimizeAIBookmarks')
							hasSavedUndoState = true
						}
						applyAIOptimizationChanges(changes)
						optimizedBookmarks.push(...changes.map(change => change.bookmark))
						changedPaths.push(filePath)
						port.saveBookmarks([filePath])
					}
				} catch (error: unknown) {
					const message = errorMessage(error)
					if (token.isCancellationRequested || message.includes('主动取消')) {
						userStopped = true
						break
					}
					failedFilesCount++
					if (isAIAuthenticationError(error) || message.includes('API Key')) {
						userStopped = true
						vscode.window.showErrorMessage(`接口验证失败，请检查 API Key 配置: ${message}`)
						break
					}
					if (isAIRateLimitError(error)) {
						userStopped = true
						vscode.window.showErrorMessage(`AI 接口触发速率限制，已停止文件夹任务：${message}`)
						break
					}
					if (message.includes('作用域已切换')) {
						scopeChanged = true
						break
					}
					consecutiveRequestFailures++
					if (consecutiveRequestFailures >= 3) {
						userStopped = true
						vscode.window.showErrorMessage(`AI 请求连续失败 ${consecutiveRequestFailures} 次，已停止文件夹任务：${message}`)
						break
					}
					logger.error(`[AI Batch Optimize] Failed for ${pathRel}: ${message}`)
				} finally {
					port.taskRegistry.finishFile(taskKey)
				}
			}

			const optimizedSummary = summarizeBookmarks(optimizedBookmarks)
			if ((token.isCancellationRequested || userStopped) && !scopeChanged) {
				vscode.window.showInformationMessage(`AI 文件夹任务已停止；此前 ${changedPaths.length} 个文件的结果已进入保存队列，更新结果：${formatBookmarkLevelSummary(optimizedSummary)}。`)
			} else if (changedPaths.length > 0 && !scopeChanged && port.currentStorageScope() === taskScope) {
				port.refreshDecoration()
				const failMsg = failedFilesCount > 0 ? `（有 ${failedFilesCount} 个文件处理失败）` : ''
				vscode.window.showInformationMessage(`文件夹 AI 优化完成，已处理 ${changedPaths.length} 个文件；更新结果：${formatBookmarkLevelSummary(optimizedSummary)}。${failMsg}`)
			} else if (changedPaths.length === 0 && !token.isCancellationRequested && !scopeChanged) {
				const failMsg = failedFilesCount > 0 ? `（其中 ${failedFilesCount} 个文件处理失败）` : ''
				vscode.window.showInformationMessage(`AI 处理完毕，没有更新任何书签；${formatBookmarkLevelSummary(optimizedSummary)}。${failMsg}`)
			}
			if (scopeChanged) vscode.window.showInformationMessage(`书签作用域已切换，AI 文件夹任务已停止；此前处理结果：${formatBookmarkLevelSummary(optimizedSummary)}。`)
			if (statusDisposable) statusDisposable.dispose()
		})
	} finally {
		port.taskRegistry.finishFolder(taskScope)
	}
}
