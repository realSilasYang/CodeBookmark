import * as vscode from 'vscode'
import type { Bookmark } from '../models/Bookmark'
import { formatBookmarkLevelSummary, summarizeBookmarkTrees } from '../util/BookmarkStatistics'

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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
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
			void vscode.window.showInformationMessage(
				`书签存储目录转移完成：复制 ${result.copiedFiles} 个文件，合并 ${result.mergedFiles} 个文件${result.conflictFiles > 0 ? `，保留 ${result.conflictFiles} 个冲突副本` : ''}；当前结果：${formatBookmarkLevelSummary(summary)}。原目录中的书签配置已删除。`,
			)
		} catch (error) {
			port.activateRoot(transferCompleted ? targetRoot : sourceRoot)
			port.cancelStorageTransition()
			port.queueFullSave()
			await port.flushPendingSaves()
			await port.setupConfigWatcher()
			const message = transferCompleted
				? `书签存储目录已转移且原目录已清理，但完成切换时发生错误，已继续使用新目录：${errorMessage(error)}`
				: `书签存储目录转移失败，仍继续使用来源目录：${errorMessage(error)}`
			void vscode.window.showErrorMessage(message)
		}
	}
}
