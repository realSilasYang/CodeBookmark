/**
 * 编排文件夹范围的 AI 生成与标签优化：扫描目标、逐文件执行并汇总成功、跳过和失败数量。
 * 它通过端口获取快照和提交结果，使批量策略不依赖具体的 VS Code 界面实现。
 */
import * as path from 'path'
import * as vscode from 'vscode'
import { isUserCancelledError, localize } from '../i18n/Localization'
import type { Bookmark } from '../models/Bookmark'
import { AIService, isAIAuthenticationError, isAIRateLimitError } from '../util/AIService'
import { Helper } from '../util/Helper'
import { applyAIOptimizationChanges, resolveAIOptimizationChanges } from '../util/AIOptimizationMutations'
import { listAISourceFilesInFolder } from '../util/AISourceFolderScanner'
import { assertAISourceSnapshot, readAISourceSnapshot, type AIFileSnapshot } from '../util/AISourceSnapshot'
import { formatBookmarkLevelSummary, summarizeBookmarks, summarizeBookmarkTrees } from '../util/BookmarkStatistics'
import { logger } from '../util/Logger'
import { buildAIBookmarks, expandGeneratedBookmarkTree } from './AIBookmarkBuilder'
import type { AIGenerationMode, AISingleFileWorkflowPort } from './AISingleFileWorkflowRunner'
import { isAIStorageScopeChangedError } from './AIWorkflowGuard'
import { errorMessage } from '../util/ErrorMessage'
import { findOpenFileDocument } from '../util/VscodeDocument'
import { ReplaceableDisposable } from '../util/ReplaceableDisposable'

export interface AIFolderWorkflowPort extends Omit<AISingleFileWorkflowPort, 'documentLines'> {
	currentStorageScope(): string | undefined
}

export interface AIFolderWorkflowTarget {
	readonly directory: string
	readonly storageScope: string
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
		vscode.window.showInformationMessage(localize("providers.AIFolderWorkflowRunner.noSupportedScriptFilesWereFoundInTheCurrent"))
		return
	}

	if (filesToProcess.length > 10) {
		const confirmAction = { title: localize("providers.AIFolderWorkflowRunner.continue"), action: 'continue' as const }
		const confirm = await vscode.window.showWarningMessage(
			localize("providers.AIFolderWorkflowRunner.theCurrentFolderAndItsSubfoldersContainScriptFiles", { filesToProcessCount: filesToProcess.length }),
			{ modal: true },
			confirmAction,
		)
		if (confirm?.action !== 'continue') return
	}

	if (!port.taskRegistry.tryStartFolder(taskScope)) {
		vscode.window.showWarningMessage(localize("providers.AIFolderWorkflowRunner.anAiFolderTaskIsAlreadyRunningInThe"))
		return
	}
	const statusMessage = new ReplaceableDisposable<vscode.Disposable>()
	try {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: localize("providers.AIFolderWorkflowRunner.aiIsGeneratingBookmarksForTheFolder"),
			cancellable: true,
		}, async (progress, token) => {
			let fileCount = 0
			let failedFilesCount = 0
			const changedPaths: string[] = []
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
					vscode.window.showWarningMessage(localize("providers.AIFolderWorkflowRunner.anAiTaskIsAlreadyRunningForTryAgain", { fileName: path.basename(filePath) }))
					continue
				}
				if (!shouldGenerateForFolderMode(mode, port.bookmarksForPath(pathRel).length)) continue
				const bookmarkInputSnapshot = port.workflowGuard.captureBookmarkInput(pathRel)
				if (!port.taskRegistry.tryStartFile(taskKey)) {
					vscode.window.showWarningMessage(localize("providers.AIFolderWorkflowRunner.anAiTaskIsAlreadyRunningForTryAgain", { fileName: path.basename(filePath) }))
					continue
				}

				let sourceSnapshot: AIFileSnapshot
				try {
					sourceSnapshot = await readAISourceSnapshot(filePath, findOpenFileDocument)
				} catch (error) {
					port.taskRegistry.finishFile(taskKey)
					const message = errorMessage(error)
					if (isUserCancelledError(error)) {
						userStopped = true
						break
					}
					failedFilesCount++
					logger.error(localize("providers.AIFolderWorkflowRunner.aiBatchGenerateFailedToRead", { filePath, message }))
					continue
				}
				const codeContent = sourceSnapshot.content

				fileCount++
				progress.report({ message: localize("providers.AIFolderWorkflowRunner.generating", { fileCount, filesToProcessCount: filesToProcess.length, fileName: path.basename(filePath) }) })

				try {
					const aiBookmarks = await AIService.generateBookmarks(codeContent, filePath, (message: string) => {
						statusMessage.replace(vscode.window.setStatusBarMessage(`AI: ${message}`))
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
						expandGeneratedBookmarkTree(built.roots)
						generatedBookmarks.push(...built.roots)
						changedPaths.push(filePath)
						port.saveBookmarks([filePath])
					}
				} catch (error: unknown) {
					const message = errorMessage(error)
					if (token.isCancellationRequested || isUserCancelledError(error)) {
						userStopped = true
						break
					}
					failedFilesCount++
					if (isAIAuthenticationError(error) || message.includes('API Key')) {
						userStopped = true
						vscode.window.showErrorMessage(localize("providers.AIFolderWorkflowRunner.aiServiceAuthenticationFailedCheckTheApiKeySetting", { message }))
						break
					}
					if (isAIRateLimitError(error)) {
						userStopped = true
						vscode.window.showErrorMessage(localize("providers.AIFolderWorkflowRunner.theAiServiceRateLimitWasReachedSoThe", { message }))
						break
					}
					if (isAIStorageScopeChangedError(error)) {
						scopeChanged = true
						break
					}
					consecutiveRequestFailures++
					if (consecutiveRequestFailures >= 3) {
						userStopped = true
						vscode.window.showErrorMessage(localize("providers.AIFolderWorkflowRunner.theAiRequestFailedTimesInARowSo", { consecutiveRequestFailures, message }))
						break
					}
					logger.error(localize("providers.AIFolderWorkflowRunner.aiBatchGenerateFailedFor", { pathRel, message }))
				} finally {
					port.taskRegistry.finishFile(taskKey)
				}
			}

			if (changedPaths.length > 0 && !scopeChanged && port.currentStorageScope() === taskScope) {
				port.refreshDecoration()
				await port.persistGeneratedExpansion(taskScope)
			}
			const generatedSummary = summarizeBookmarkTrees(generatedBookmarks)
			if ((token.isCancellationRequested || userStopped) && !scopeChanged) {
				vscode.window.showInformationMessage(localize("providers.AIFolderWorkflowRunner.theAiFolderTaskStoppedResultsForFilesWere", { changedPathsCount: changedPaths.length, formatBookmarkLevelSummary: formatBookmarkLevelSummary(generatedSummary) }))
			} else if (changedPaths.length > 0 && !scopeChanged && port.currentStorageScope() === taskScope) {
				const failMsg = failedFilesCount > 0 ? localize("providers.AIFolderWorkflowRunner.filesFailed", { failedFilesCount }) : ''
				vscode.window.showInformationMessage(localize("providers.AIFolderWorkflowRunner.folderAiProcessingCompletedForFilesGenerated", { changedPathsCount: changedPaths.length, formatBookmarkLevelSummary: formatBookmarkLevelSummary(generatedSummary), failMsg }))
			} else if (changedPaths.length === 0 && !token.isCancellationRequested && !scopeChanged) {
				const failMsg = failedFilesCount > 0 ? localize("providers.AIFolderWorkflowRunner.filesFailed2", { failedFilesCount }) : ''
				vscode.window.showInformationMessage(localize("providers.AIFolderWorkflowRunner.aiProcessingCompletedWithoutGeneratingNewBookmarks", { formatBookmarkLevelSummary: formatBookmarkLevelSummary(generatedSummary), failMsg }))
			}
			if (scopeChanged) vscode.window.showInformationMessage(localize("providers.AIFolderWorkflowRunner.theBookmarkScopeChangedSoTheAiFolderTask", { formatBookmarkLevelSummary: formatBookmarkLevelSummary(generatedSummary) }))
		})
	} finally {
		statusMessage.dispose()
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
		vscode.window.showInformationMessage(localize("providers.AIFolderWorkflowRunner.noSupportedScriptFilesWereFoundInTheCurrent"))
		return
	}

	if (files.length > 10) {
		const confirmAction = { title: localize("providers.AIFolderWorkflowRunner.continue"), action: 'continue' as const }
		const confirm = await vscode.window.showWarningMessage(
			localize("providers.AIFolderWorkflowRunner.theCurrentFolderAndItsSubfoldersContainScriptFiles2", { filesCount: files.length }),
			{ modal: true },
			confirmAction,
		)
		if (confirm?.action !== 'continue') return
	}

	if (!port.taskRegistry.tryStartFolder(taskScope)) {
		vscode.window.showWarningMessage(localize("providers.AIFolderWorkflowRunner.anAiFolderTaskIsAlreadyRunningInThe"))
		return
	}
	const statusMessage = new ReplaceableDisposable<vscode.Disposable>()
	try {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: localize("providers.AIFolderWorkflowRunner.aiIsScanningBookmarksInTheFolder"),
			cancellable: true,
		}, async (progress, token) => {
			let fileCount = 0
			let failedFilesCount = 0
			const changedPaths: string[] = []
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
					vscode.window.showWarningMessage(localize("providers.AIFolderWorkflowRunner.anAiTaskIsAlreadyRunningForTryAgain", { fileName: path.basename(filePath) }))
					continue
				}

				const existingBookmarks = port.bookmarksForPath(pathRel)
				if (existingBookmarks.length === 0) continue
				const bookmarkInputSnapshot = port.workflowGuard.captureBookmarkInput(pathRel)
				if (!port.taskRegistry.tryStartFile(taskKey)) {
					vscode.window.showWarningMessage(localize("providers.AIFolderWorkflowRunner.anAiTaskIsAlreadyRunningForTryAgain", { fileName: path.basename(filePath) }))
					continue
				}

				let sourceSnapshot: AIFileSnapshot
				try {
					sourceSnapshot = await readAISourceSnapshot(filePath, findOpenFileDocument)
				} catch (error) {
					port.taskRegistry.finishFile(taskKey)
					const message = errorMessage(error)
					if (isUserCancelledError(error)) {
						userStopped = true
						break
					}
					failedFilesCount++
					logger.error(localize("providers.AIFolderWorkflowRunner.aiBatchOptimizeFailedToRead", { filePath, message }))
					continue
				}
				const codeContent = sourceSnapshot.content

				fileCount++
				progress.report({ message: localize("providers.AIFolderWorkflowRunner.improving", { fileCount, filesCount: files.length, fileName: path.basename(filePath) }) })

				try {
					const optimizedList = await AIService.optimizeBookmarks(
						codeContent,
						filePath,
						existingBookmarks,
						(message: string) => {
							statusMessage.replace(vscode.window.setStatusBarMessage(`AI: ${message}`))
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
					if (token.isCancellationRequested || isUserCancelledError(error)) {
						userStopped = true
						break
					}
					failedFilesCount++
					if (isAIAuthenticationError(error) || message.includes('API Key')) {
						userStopped = true
						vscode.window.showErrorMessage(localize("providers.AIFolderWorkflowRunner.aiServiceAuthenticationFailedCheckTheApiKeySetting", { message }))
						break
					}
					if (isAIRateLimitError(error)) {
						userStopped = true
						vscode.window.showErrorMessage(localize("providers.AIFolderWorkflowRunner.theAiServiceRateLimitWasReachedSoThe", { message }))
						break
					}
					if (isAIStorageScopeChangedError(error)) {
						scopeChanged = true
						break
					}
					consecutiveRequestFailures++
					if (consecutiveRequestFailures >= 3) {
						userStopped = true
						vscode.window.showErrorMessage(localize("providers.AIFolderWorkflowRunner.theAiRequestFailedTimesInARowSo", { consecutiveRequestFailures, message }))
						break
					}
					logger.error(localize("providers.AIFolderWorkflowRunner.aiBatchOptimizeFailedFor", { pathRel, message }))
				} finally {
					port.taskRegistry.finishFile(taskKey)
				}
			}

			const optimizedSummary = summarizeBookmarks(optimizedBookmarks)
			if ((token.isCancellationRequested || userStopped) && !scopeChanged) {
				vscode.window.showInformationMessage(localize("providers.AIFolderWorkflowRunner.theAiFolderTaskStoppedResultsForFilesWere2", { changedPathsCount: changedPaths.length, formatBookmarkLevelSummary: formatBookmarkLevelSummary(optimizedSummary) }))
			} else if (changedPaths.length > 0 && !scopeChanged && port.currentStorageScope() === taskScope) {
				port.refreshDecoration()
				const failMsg = failedFilesCount > 0 ? localize("providers.AIFolderWorkflowRunner.filesFailed", { failedFilesCount }) : ''
				vscode.window.showInformationMessage(localize("providers.AIFolderWorkflowRunner.folderAiImprovementCompletedForFilesUpdated", { changedPathsCount: changedPaths.length, formatBookmarkLevelSummary: formatBookmarkLevelSummary(optimizedSummary), failMsg }))
			} else if (changedPaths.length === 0 && !token.isCancellationRequested && !scopeChanged) {
				const failMsg = failedFilesCount > 0 ? localize("providers.AIFolderWorkflowRunner.filesFailed2", { failedFilesCount }) : ''
				vscode.window.showInformationMessage(localize("providers.AIFolderWorkflowRunner.aiProcessingCompletedWithoutUpdatingAnyBookmarks", { formatBookmarkLevelSummary: formatBookmarkLevelSummary(optimizedSummary), failMsg }))
			}
			if (scopeChanged) vscode.window.showInformationMessage(localize("providers.AIFolderWorkflowRunner.theBookmarkScopeChangedSoTheAiFolderTask", { formatBookmarkLevelSummary: formatBookmarkLevelSummary(optimizedSummary) }))
		})
	} finally {
		statusMessage.dispose()
		port.taskRegistry.finishFolder(taskScope)
	}
}
