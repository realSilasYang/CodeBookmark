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
import { buildAIBookmarks } from './AIBookmarkBuilder'
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
		vscode.window.showWarningMessage(localize('当前文件已有 AI 任务正在运行，请稍候再试。', 'An AI task is already running for the current file. Try again shortly.'))
		return
	}
	const existingBookmarks = port.bookmarksForPath(pathRel)

	if (mode === 'skip_existing' && existingBookmarks.length > 0) {
		vscode.window.showInformationMessage(localize('当前文件已有书签，根据模式已跳过生成。', 'The current file already has bookmarks, so generation was skipped for this mode.'))
		return
	}
	const bookmarkInputSnapshot = port.workflowGuard.captureBookmarkInput(pathRel)
	if (!port.taskRegistry.tryStartFile(taskKey)) {
		vscode.window.showWarningMessage(localize('当前文件已有 AI 任务正在运行，请稍候再试。', 'An AI task is already running for the current file. Try again shortly.'))
		return
	}

	try {
		await AIService.confirmSourceSize(aiContentByteLength(codeContent), sourcePath)
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: localize('AI 智能代码书签提取运行中...', 'AI is generating code bookmarks…'),
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
					vscode.window.showInformationMessage(localize('AI 未能发现需要添加书签的核心逻辑。', 'AI did not find any core logic that needs a bookmark.'))
					return
				}
				const currentBookmarks = port.bookmarksForPath(pathRel)
				if (mode === 'skip_existing' && currentBookmarks.length > 0) {
					vscode.window.showInformationMessage(localize(
						'AI 分析期间当前文件已添加书签，根据模式未应用生成结果。',
						'Bookmarks were added to the current file during AI analysis, so the generated result was not applied for this mode.',
					))
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
						? localize(`，已跳过 ${built.skipped} 个重复位置`, `; skipped ${built.skipped} duplicate locations`)
						: ''
					vscode.window.showInformationMessage(localize(
						`AI 未生成可添加的新书签${skipped}；生成结果：${formatBookmarkLevelSummary(summarizeBookmarkTrees([]))}。`,
						`AI did not generate any new bookmarks that could be added${skipped}. Generated: ${formatBookmarkLevelSummary(summarizeBookmarkTrees([]))}.`,
					))
					return
				}

				if (statusDisposable) statusDisposable.dispose()
				statusDisposable = vscode.window.setStatusBarMessage(localize('AI: 正在将智能书签落盘保存...', 'AI: Saving generated bookmarks…'))

				port.saveUndoState('generateAIBookmarks')
				if (mode === 'overwrite') {
					for (const bookmark of currentBookmarks) {
						if (bookmark.id) port.deleteBookmark(bookmark.id)
					}
				}
				for (const bookmark of built.roots) port.addBookmark(bookmark)

				port.saveBookmarks([document.uri.fsPath])
				port.refreshDecoration()
				const skipped = built.skipped > 0
					? localize(`，跳过 ${built.skipped} 个重复位置`, `; skipped ${built.skipped} duplicate locations`)
					: ''
				const summary = summarizeBookmarkTrees(built.roots)
				vscode.window.showInformationMessage(localize(
					`AI 分析完成，生成结果：${formatBookmarkLevelSummary(summary)}${skipped}。`,
					`AI analysis completed. Generated: ${formatBookmarkLevelSummary(summary)}${skipped}.`,
				))
			} catch (error: unknown) {
				const message = errorMessage(error)
				if (isUserCancelledError(error) || token.isCancellationRequested) {
					vscode.window.showInformationMessage(localize('已取消 AI 书签生成任务。', 'AI bookmark generation was cancelled.'))
				} else {
					vscode.window.showErrorMessage(localize(`AI 书签生成失败：${message}`, `AI bookmark generation failed: ${message}`))
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
		vscode.window.showWarningMessage(localize('当前文件已有 AI 任务正在运行，请稍候再试。', 'An AI task is already running for the current file. Try again shortly.'))
		return
	}

	const existingBookmarks = port.bookmarksForPath(pathRel)
	if (existingBookmarks.length === 0) {
		vscode.window.showInformationMessage(localize('当前文件没有可以优化的书签。', 'The current file has no bookmarks to improve.'))
		return
	}
	const bookmarkInputSnapshot = port.workflowGuard.captureBookmarkInput(pathRel)
	if (!port.taskRegistry.tryStartFile(taskKey)) {
		vscode.window.showWarningMessage(localize('当前文件已有 AI 任务正在运行，请稍候再试。', 'An AI task is already running for the current file. Try again shortly.'))
		return
	}

	try {
		await AIService.confirmSourceSize(aiContentByteLength(codeContent), sourcePath)
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: localize('AI 书签优化运行中...', 'AI is improving bookmarks…'),
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
					vscode.window.showInformationMessage(localize('AI 未返回任何有效的标签更新。', 'AI did not return any valid label updates.'))
					return
				}

				if (statusDisposable) statusDisposable.dispose()
				statusDisposable = vscode.window.setStatusBarMessage(localize('AI: 正在应用优化后的书签...', 'AI: Applying bookmark improvements…'))
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
					vscode.window.showInformationMessage(localize(
						`AI 书签优化完成，更新结果：${formatBookmarkLevelSummary(summary)}。`,
						`AI bookmark improvement completed. Updated: ${formatBookmarkLevelSummary(summary)}.`,
					))
				} else {
					vscode.window.showInformationMessage(localize(
						`AI 书签优化完成，但没有内容改变；更新结果：${formatBookmarkLevelSummary(summarizeBookmarks([]))}。`,
						`AI bookmark improvement completed with no changes. Updated: ${formatBookmarkLevelSummary(summarizeBookmarks([]))}.`,
					))
				}
			} catch (error: unknown) {
				const message = errorMessage(error)
				if (isUserCancelledError(error) || token.isCancellationRequested) {
					vscode.window.showInformationMessage(localize('已取消 AI 标签优化任务。', 'AI label improvement was cancelled.'))
				} else {
					vscode.window.showErrorMessage(localize(`AI 标签优化失败：${message}`, `AI label improvement failed: ${message}`))
				}
			} finally {
				if (statusDisposable) statusDisposable.dispose()
			}
		})
	} finally {
		port.taskRegistry.finishFile(taskKey)
	}
}
