/**
 * 处理书签存储目录的选择、迁移、恢复默认值与当前根目录激活。
 * 迁移前后协调保存、监听器和视图重载，确保旧目录数据转移完成后再切换配置。
 */
import * as vscode from 'vscode'
import type { Bookmark } from '../models/Bookmark'
import { formatBookmarkLevelSummary, summarizeBookmarkTrees } from '../util/BookmarkStatistics'
import { localize } from '../i18n/Localization'
import { errorMessage } from '../util/ErrorMessage'

interface StorageRootTransferResult {
	copiedFiles: number
	mergedFiles: number
	conflictFiles: number
}

export interface BookmarkStoragePathWorkflowPort {
	activeRoot(): string | undefined
	ensureConfigured(): boolean
	configuredRoot(): string
	sameRoot(left: string, right: string): boolean
	activateRoot(root: string): void
	rememberRoot(root: string): Promise<void>
	reloadActiveTab(forceReloadDisk: boolean): Promise<void>
	queueFullSave(): void
	beginStorageTransition(): void
	finishStorageTransition(): boolean
	cancelStorageTransition(): void
	flushPendingSaves(requireSuccess?: boolean): Promise<void>
	transferRoot(sourceRoot: string, targetRoot: string): Promise<StorageRootTransferResult>
	setupConfigWatcher(): Promise<void>
	reportPreviousFailure(error: unknown): void
	bookmarks(): Iterable<Bookmark>
}

export class BookmarkStoragePathWorkflowRunner {
	private transitionPromise: Promise<void> = Promise.resolve()

	run(port: BookmarkStoragePathWorkflowPort): Promise<void> {
		const operation = this.transitionPromise
			.catch(error => port.reportPreviousFailure(error))
			.then(() => this.perform(port))
		this.transitionPromise = operation
		return operation
	}

	private async perform(port: BookmarkStoragePathWorkflowPort): Promise<void> {
		const sourceRoot = port.activeRoot()
		if (!port.ensureConfigured()) return
		const targetRoot = port.configuredRoot()
		if (!sourceRoot) {
			port.activateRoot(targetRoot)
			await port.rememberRoot(targetRoot)
			await port.reloadActiveTab(true)
			return
		}
		if (port.sameRoot(sourceRoot, targetRoot)) return

		port.queueFullSave()
		port.beginStorageTransition()
		let transferCompleted = false
		try {
			await port.flushPendingSaves(true)
			const result = await port.transferRoot(sourceRoot, targetRoot)
			transferCompleted = true
			port.activateRoot(targetRoot)
			await port.rememberRoot(targetRoot)
			if (port.finishStorageTransition()) {
				port.queueFullSave()
				await port.flushPendingSaves(true)
			}

			await port.reloadActiveTab(true)
			const summary = summarizeBookmarkTrees(port.bookmarks())
			const formattedSummary = formatBookmarkLevelSummary(summary)
			const conflictSummary = result.conflictFiles > 0
				? localize('providers.BookmarkStoragePathWorkflowRunner.retainedConflictCopies', { count: result.conflictFiles })
				: ''
			void vscode.window.showInformationMessage(localize("providers.BookmarkStoragePathWorkflowRunner.bookmarkStorageTransferCompletedCopiedFilesMergedFilesCurrent", {
				copiedFiles: result.copiedFiles,
				mergedFiles: result.mergedFiles,
				conflictSummary,
				formattedSummary,
			}))
		} catch (error) {
			port.activateRoot(transferCompleted ? targetRoot : sourceRoot)
			port.cancelStorageTransition()
			port.queueFullSave()
			await port.flushPendingSaves()
			await port.setupConfigWatcher()
			const message = transferCompleted
				? localize("providers.BookmarkStoragePathWorkflowRunner.bookmarkStorageWasTransferredAndTheOriginalDirectoryWas", { errorMessage: errorMessage(error) })
				: localize("providers.BookmarkStoragePathWorkflowRunner.bookmarkStorageTransferFailedTheOriginalDirectoryRemainsActive", { errorMessage: errorMessage(error) })
			void vscode.window.showErrorMessage(message)
		}
	}
}
