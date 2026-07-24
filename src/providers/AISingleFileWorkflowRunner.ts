/**
 * 编排当前脚本的 AI 生成、追加、替换与标签优化，并在请求前后核对文件快照。
 * 源文件或存储作用域在等待 AI 时发生变化会中止提交，避免把过期结果写进新内容。
 */
import * as path from 'path'
import * as vscode from 'vscode'
import { isUserCancelledError, localize } from '../i18n/Localization'
import { Bookmark } from '../models/Bookmark'
import { aiContentByteLength } from '../util/AIRequestPolicy'
import { AIService } from '../util/AIService'
import { Helper } from '../util/Helper'
import { applyAIOptimizationChanges, resolveAIOptimizationChanges } from '../util/AIOptimizationMutations'
import { assertAIDocumentSnapshot } from '../util/AISourceSnapshot'
import { formatBookmarkLevelSummary, summarizeBookmarks, summarizeBookmarkTrees } from '../util/BookmarkStatistics'
import { buildAIBookmarks, expandGeneratedBookmarkTree } from './AIBookmarkBuilder'
import type { AITaskRegistry } from './AITaskRegistry'
import type { AIWorkflowGuard } from './AIWorkflowGuard'

export type AIGenerationMode = 'append' | 'overwrite' | 'skip_existing'

export interface AISingleFileWorkflowPort {
	absoluteToRelative(filePath: string): string
	storageScopeForUri(uri: vscode.Uri): string
	taskRegistry: AITaskRegistry
	workflowGuard: AIWorkflowGuard
	bookmarksForPath(pathRel: string): Bookmark[]
	documentLines(document: vscode.TextDocument): string[]
	deleteBookmark(id: string): void
	addBookmark(bookmark: Bookmark): void
	persistGeneratedExpansion(storageScope: string): Promise<void>
	saveUndoState(action: 'generateAIBookmarks' | 'optimizeAIBookmarks'): void
	saveBookmarks(filePaths: string[]): void
	refreshDecoration(): void
	findBookmark(bookmark: Bookmark): Bookmark | undefined
	assignAIIcons(): boolean
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

export async function runGenerateBookmarksForFile(
	editor: vscode.TextEditor,
	mode: AIGenerationMode,
	port: AISingleFileWorkflowPort,
): Promise<void> {
	const document = editor.document
	const codeContent = document.getText()
	const sourceVersion = document.version
	const sourcePath = path.resolve(document.uri.fsPath)
	const pathRel = port.absoluteToRelative(document.uri.fsPath)
	const taskScope = port.storageScopeForUri(document.uri)
	port.workflowGuard.assertStorageScope(taskScope)
	const taskKey = port.taskRegistry.fileTaskKey(taskScope, pathRel)

	if (port.taskRegistry.isFileRunning(taskKey)) {
		vscode.window.showWarningMessage(localize("providers.AISingleFileWorkflowRunner.anAiTaskIsAlreadyRunningForTheCurrent"))
		return
	}
	const existingBookmarks = port.bookmarksForPath(pathRel)

	if (mode === 'skip_existing' && existingBookmarks.length > 0) {
		vscode.window.showInformationMessage(localize("providers.AISingleFileWorkflowRunner.theCurrentFileAlreadyHasBookmarksSoGenerationWas"))
		return
	}
	const bookmarkInputSnapshot = port.workflowGuard.captureBookmarkInput(pathRel)
	if (!port.taskRegistry.tryStartFile(taskKey)) {
		vscode.window.showWarningMessage(localize("providers.AISingleFileWorkflowRunner.anAiTaskIsAlreadyRunningForTheCurrent"))
		return
	}

	try {
		await AIService.confirmSourceSize(aiContentByteLength(codeContent), sourcePath)
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: localize("providers.AISingleFileWorkflowRunner.aiIsGeneratingCodeBookmarks"),
			cancellable: true,
		}, async (_progress, token) => {
			let statusDisposable: vscode.Disposable | undefined
			try {
				const aiBookmarks = await AIService.generateBookmarks(codeContent, document.uri.fsPath, (message: string) => {
					if (statusDisposable) statusDisposable.dispose()
					statusDisposable = vscode.window.setStatusBarMessage(`AI: ${message}`)
				}, token)

				if (token.isCancellationRequested) return
				port.workflowGuard.assertStorageScope(taskScope)
				assertAIDocumentSnapshot(document, sourceVersion, codeContent, sourcePath)

				if (!aiBookmarks || aiBookmarks.length === 0) {
					vscode.window.showInformationMessage(localize("providers.AISingleFileWorkflowRunner.aiDidNotFindAnyCoreLogicThatNeeds"))
					return
				}
				const currentBookmarks = port.bookmarksForPath(pathRel)
				if (mode === 'skip_existing' && currentBookmarks.length > 0) {
					vscode.window.showInformationMessage(localize("providers.AISingleFileWorkflowRunner.bookmarksWereAddedToTheCurrentFileDuringAi"))
					return
				}
				if (mode === 'overwrite') port.workflowGuard.assertBookmarkInput(pathRel, bookmarkInputSnapshot)
				const built = buildAIBookmarks(
					aiBookmarks,
					port.documentLines(document),
					pathRel,
					currentBookmarks,
					mode === 'overwrite',
					port.assignAIIcons(),
				)
				if (built.roots.length === 0) {
					const skipped = built.skipped > 0
						? localize("providers.AISingleFileWorkflowRunner.skippedDuplicateLocations", { skipped: built.skipped })
						: ''
					vscode.window.showInformationMessage(localize("providers.AISingleFileWorkflowRunner.aiDidNotGenerateAnyNewBookmarksThatCould", { skipped, formatBookmarkLevelSummary: formatBookmarkLevelSummary(summarizeBookmarkTrees([])) }))
					return
				}

				if (statusDisposable) statusDisposable.dispose()
				statusDisposable = vscode.window.setStatusBarMessage(localize("providers.AISingleFileWorkflowRunner.aiSavingGeneratedBookmarks"))

				port.saveUndoState('generateAIBookmarks')
				if (mode === 'overwrite') {
					for (const bookmark of currentBookmarks) {
						if (bookmark.id) port.deleteBookmark(bookmark.id)
					}
				}
				for (const bookmark of built.roots) port.addBookmark(bookmark)
				expandGeneratedBookmarkTree(built.roots)

				port.saveBookmarks([document.uri.fsPath])
				port.refreshDecoration()
				await port.persistGeneratedExpansion(taskScope)
				const skipped = built.skipped > 0
					? localize("providers.AISingleFileWorkflowRunner.skippedDuplicateLocations2", { skipped: built.skipped })
					: ''
				const summary = summarizeBookmarkTrees(built.roots)
				vscode.window.showInformationMessage(localize("providers.AISingleFileWorkflowRunner.aiAnalysisCompletedGenerated", { formatBookmarkLevelSummary: formatBookmarkLevelSummary(summary), skipped }))
			} catch (error: unknown) {
				const message = errorMessage(error)
				if (isUserCancelledError(error) || token.isCancellationRequested) {
					vscode.window.showInformationMessage(localize("providers.AISingleFileWorkflowRunner.aiBookmarkGenerationWasCancelled"))
				} else {
					vscode.window.showErrorMessage(localize("providers.AISingleFileWorkflowRunner.aiBookmarkGenerationFailed", { message }))
				}
			} finally {
				if (statusDisposable) statusDisposable.dispose()
			}
		})
	} finally {
		port.taskRegistry.finishFile(taskKey)
	}
}

export async function runOptimizeBookmarksForFile(
	editor: vscode.TextEditor,
	port: AISingleFileWorkflowPort,
): Promise<void> {
	const document = editor.document
	const codeContent = document.getText()
	const sourceVersion = document.version
	const sourcePath = path.resolve(document.uri.fsPath)
	const pathRel = port.absoluteToRelative(document.uri.fsPath)
	const taskScope = port.storageScopeForUri(document.uri)
	port.workflowGuard.assertStorageScope(taskScope)
	const taskKey = port.taskRegistry.fileTaskKey(taskScope, pathRel)

	if (port.taskRegistry.isFileRunning(taskKey)) {
		vscode.window.showWarningMessage(localize("providers.AISingleFileWorkflowRunner.anAiTaskIsAlreadyRunningForTheCurrent"))
		return
	}

	const existingBookmarks = port.bookmarksForPath(pathRel)
	if (existingBookmarks.length === 0) {
		vscode.window.showInformationMessage(localize("providers.AISingleFileWorkflowRunner.theCurrentFileHasNoBookmarksToImprove"))
		return
	}
	const bookmarkInputSnapshot = port.workflowGuard.captureBookmarkInput(pathRel)
	if (!port.taskRegistry.tryStartFile(taskKey)) {
		vscode.window.showWarningMessage(localize("providers.AISingleFileWorkflowRunner.anAiTaskIsAlreadyRunningForTheCurrent"))
		return
	}

	try {
		await AIService.confirmSourceSize(aiContentByteLength(codeContent), sourcePath)
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: localize("providers.AISingleFileWorkflowRunner.aiIsImprovingBookmarks"),
			cancellable: true,
		}, async (_progress, token) => {
			let statusDisposable: vscode.Disposable | undefined
			try {
				const optimizedList = await AIService.optimizeBookmarks(
					codeContent,
					document.uri.fsPath,
					existingBookmarks,
					(message: string) => {
						if (statusDisposable) statusDisposable.dispose()
						statusDisposable = vscode.window.setStatusBarMessage(`AI: ${message}`)
					},
					token,
				)

				if (token.isCancellationRequested) return
				port.workflowGuard.assertStorageScope(taskScope)
				assertAIDocumentSnapshot(document, sourceVersion, codeContent, sourcePath)
				port.workflowGuard.assertBookmarkInput(pathRel, bookmarkInputSnapshot)

				if (!optimizedList || optimizedList.length === 0) {
					vscode.window.showInformationMessage(localize("providers.AISingleFileWorkflowRunner.aiDidNotReturnAnyValidLabelUpdates"))
					return
				}

				if (statusDisposable) statusDisposable.dispose()
				statusDisposable = vscode.window.setStatusBarMessage(localize("providers.AISingleFileWorkflowRunner.aiApplyingBookmarkImprovements"))
				const changes = resolveAIOptimizationChanges(
					optimizedList,
					port.bookmarksForPath(pathRel),
					bookmark => port.findBookmark(bookmark),
					port.assignAIIcons(),
					Helper.formatLabelSpacing,
				)
				if (changes.length > 0) {
					port.saveUndoState('optimizeAIBookmarks')
					applyAIOptimizationChanges(changes)
					port.saveBookmarks([document.uri.fsPath])
					port.refreshDecoration()
					const summary = summarizeBookmarks(changes.map(change => change.bookmark))
					vscode.window.showInformationMessage(localize("providers.AISingleFileWorkflowRunner.aiBookmarkImprovementCompletedUpdated", { formatBookmarkLevelSummary: formatBookmarkLevelSummary(summary) }))
				} else {
					vscode.window.showInformationMessage(localize("providers.AISingleFileWorkflowRunner.aiBookmarkImprovementCompletedWithNoChangesUpdated", { formatBookmarkLevelSummary: formatBookmarkLevelSummary(summarizeBookmarks([])) }))
				}
			} catch (error: unknown) {
				const message = errorMessage(error)
				if (isUserCancelledError(error) || token.isCancellationRequested) {
					vscode.window.showInformationMessage(localize("providers.AISingleFileWorkflowRunner.aiLabelImprovementWasCancelled"))
				} else {
					vscode.window.showErrorMessage(localize("providers.AISingleFileWorkflowRunner.aiLabelImprovementFailed", { message }))
				}
			} finally {
				if (statusDisposable) statusDisposable.dispose()
			}
		})
	} finally {
		port.taskRegistry.finishFile(taskKey)
	}
}
