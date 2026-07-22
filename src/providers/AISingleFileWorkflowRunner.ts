import * as path from 'path'
import * as vscode from 'vscode'
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
		vscode.window.showWarningMessage('当前文件已有 AI 任务正在运行，请稍候再试。')
		return
	}
	const existingBookmarks = port.bookmarksForPath(pathRel)

	if (mode === 'skip_existing' && existingBookmarks.length > 0) {
		vscode.window.showInformationMessage('当前文件已有书签，根据模式已跳过生成。')
		return
	}
	const bookmarkInputSnapshot = port.workflowGuard.captureBookmarkInput(pathRel)
	if (!port.taskRegistry.tryStartFile(taskKey)) {
		vscode.window.showWarningMessage('当前文件已有 AI 任务正在运行，请稍候再试。')
		return
	}

	try {
		await AIService.confirmSourceSize(aiContentByteLength(codeContent), sourcePath)
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'AI 智能代码书签提取运行中...',
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
					vscode.window.showInformationMessage('AI 未能发现需要添加书签的核心逻辑。')
					return
				}
				const currentBookmarks = port.bookmarksForPath(pathRel)
				if (mode === 'skip_existing' && currentBookmarks.length > 0) {
					vscode.window.showInformationMessage('AI 分析期间当前文件已添加书签，根据模式未应用生成结果。')
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
					const skipped = built.skipped > 0 ? `，已跳过 ${built.skipped} 个重复位置` : ''
					vscode.window.showInformationMessage(`AI 未生成可添加的新书签${skipped}；生成结果：${formatBookmarkLevelSummary(summarizeBookmarkTrees([]))}。`)
					return
				}

				if (statusDisposable) statusDisposable.dispose()
				statusDisposable = vscode.window.setStatusBarMessage('AI: 正在将智能书签落盘保存...')

				port.saveUndoState('generateAIBookmarks')
				if (mode === 'overwrite') {
					for (const bookmark of currentBookmarks) {
						if (bookmark.id) port.deleteBookmark(bookmark.id)
					}
				}
				for (const bookmark of built.roots) port.addBookmark(bookmark)

				port.saveBookmarks([document.uri.fsPath])
				port.refreshDecoration()
				const skipped = built.skipped > 0 ? `，跳过 ${built.skipped} 个重复位置` : ''
				const summary = summarizeBookmarkTrees(built.roots)
				vscode.window.showInformationMessage(`AI 分析完成，生成结果：${formatBookmarkLevelSummary(summary)}${skipped}。`)
			} catch (error: unknown) {
				const message = errorMessage(error)
				if (message.includes('主动取消')) {
					vscode.window.showInformationMessage('已取消 AI 书签生成任务。')
				} else {
					vscode.window.showErrorMessage(`AI 书签生成失败：${message}`)
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
		vscode.window.showWarningMessage('当前文件已有 AI 任务正在运行，请稍候再试。')
		return
	}

	const existingBookmarks = port.bookmarksForPath(pathRel)
	if (existingBookmarks.length === 0) {
		vscode.window.showInformationMessage('当前文件没有可以优化的书签。')
		return
	}
	const bookmarkInputSnapshot = port.workflowGuard.captureBookmarkInput(pathRel)
	if (!port.taskRegistry.tryStartFile(taskKey)) {
		vscode.window.showWarningMessage('当前文件已有 AI 任务正在运行，请稍候再试。')
		return
	}

	try {
		await AIService.confirmSourceSize(aiContentByteLength(codeContent), sourcePath)
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'AI 书签优化运行中...',
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
					vscode.window.showInformationMessage('AI 未返回任何有效的标签更新。')
					return
				}

				if (statusDisposable) statusDisposable.dispose()
				statusDisposable = vscode.window.setStatusBarMessage('AI: 正在应用优化后的书签...')
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
					vscode.window.showInformationMessage(`AI 书签优化完成，更新结果：${formatBookmarkLevelSummary(summary)}。`)
				} else {
					vscode.window.showInformationMessage(`AI 书签优化完成，但没有内容改变；更新结果：${formatBookmarkLevelSummary(summarizeBookmarks([]))}。`)
				}
			} catch (error: unknown) {
				const message = errorMessage(error)
				if (message.includes('主动取消')) {
					vscode.window.showInformationMessage('已取消 AI 标签优化任务。')
				} else {
					vscode.window.showErrorMessage(`AI 标签优化失败：${message}`)
				}
			} finally {
				if (statusDisposable) statusDisposable.dispose()
			}
		})
	} finally {
		port.taskRegistry.finishFile(taskKey)
	}
}
