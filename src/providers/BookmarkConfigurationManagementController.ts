/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `BookmarkConfigurationManagementController`。
 *
 * 实现要点：把上层意图编排为多个纯工作流，并在单一边界适配 VS Code 与持久化依赖。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`BookmarkConfigurationManagementController`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import {
	listBookmarkConfigurationFiles,
	type BookmarkConfigurationDeleteRequest,
	type BookmarkConfigurationEntry,
} from '../repository/BookmarkConfigurationCatalog'
import { bookmarkRepository } from '../repository/BookmarkRepository'
import { formatBookmarkLevelSummary } from '../util/BookmarkStatistics'
import { BookmarkConfigurationManagerWebview } from './BookmarkConfigurationManagerWebview'

interface BookmarkConfigurationManagementPort {
	storageRoot(): string | undefined
	flushPendingSaves(requireSuccess?: boolean): Promise<void>
	beginStorageTransition(): void
	finishStorageTransition(): boolean
	cancelStorageTransition(): void
	saveAllBookmarks(): void
	reloadActiveTab(forceReloadDisk: boolean): Promise<void>
}

export class BookmarkConfigurationManagementController {
	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly port: BookmarkConfigurationManagementPort,
	) {}

	open(): void {
		BookmarkConfigurationManagerWebview.createOrShow(this.context, {
			load: async () => {
				await this.port.flushPendingSaves(true)
				const storageRoot = this.requiredStorageRoot()
				return {
					storageRoot,
					entries: await listBookmarkConfigurationFiles(storageRoot),
				}
			},
			delete: requests => this.delete(requests),
			openSource: entry => this.openSource(entry),
			revealConfiguration: entry => this.revealConfiguration(entry),
			revealStorageRoot: async storageRoot => {
				await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(storageRoot))
			},
		})
	}

	private requiredStorageRoot(): string {
		const storageRoot = this.port.storageRoot()
		if (!storageRoot) {
			throw new Error(localize(
				'尚未配置书签存储目录',
				'The bookmark storage folder is not configured.',
			))
		}
		return storageRoot
	}

	private async delete(requests: readonly BookmarkConfigurationDeleteRequest[]): Promise<void> {
		this.requiredStorageRoot()
		this.port.beginStorageTransition()
		try {
			await this.port.flushPendingSaves(true)
			const result = await bookmarkRepository.deleteBookmarkConfigurationFiles(requests)
			if (this.port.finishStorageTransition()) {
				this.port.saveAllBookmarks()
				await this.port.flushPendingSaves(true)
			}
			await this.port.reloadActiveTab(true)
			const skipped = result.changedFiles + result.missingFiles + result.failedFiles
			const deletedScripts = result.deletedEntries.filter(entry => entry.kind === 'script').length
			const deletedWorkspaceOrders = result.deletedEntries.filter(entry => entry.kind === 'workspaceOrder').length
			const deletedTransferJournals = result.deletedEntries.filter(entry => entry.kind === 'transferJournal').length
			const deletedKinds = [
				deletedScripts > 0 ? localize(`书签配置 ${deletedScripts} 条（${formatBookmarkLevelSummary(result.bookmarkSummary)}）`, `${deletedScripts} bookmark configurations (${formatBookmarkLevelSummary(result.bookmarkSummary)})`) : '',
				deletedWorkspaceOrders > 0 ? localize(`工作区排序记录 ${deletedWorkspaceOrders} 条`, `${deletedWorkspaceOrders} workspace order records`) : '',
				deletedTransferJournals > 0 ? localize(`存储迁移记录 ${deletedTransferJournals} 条`, `${deletedTransferJournals} storage transfer journals`) : '',
			].filter(Boolean).join(localize('；', '; ')) || localize('无', 'none')
			const message = localize(
				`书签存储记录清理完成：请求 ${result.requestedFiles} 条，清理 ${result.deletedFiles} 条，跳过 ${skipped} 条；${deletedKinds}。`,
				`Bookmark storage cleanup completed: ${result.requestedFiles} requested, ${result.deletedFiles} removed, ${skipped} skipped; ${deletedKinds}.`,
			)
			if (skipped > 0) void vscode.window.showWarningMessage(message)
			else void vscode.window.showInformationMessage(message)
		} catch (error) {
			this.port.cancelStorageTransition()
			this.port.saveAllBookmarks()
			await this.port.flushPendingSaves()
			throw error
		}
	}

	private async openSource(entry: BookmarkConfigurationEntry): Promise<void> {
		if (entry.kind !== 'script') {
			void vscode.window.showInformationMessage(localize(
				'这条记录不对应脚本，不能打开脚本。',
				'This record does not represent a script, so no script can be opened.',
			))
			return
		}
		if (!entry.scriptPath || !entry.sourceExists) {
			void vscode.window.showWarningMessage(localize(
				'对应脚本不存在，无法打开。',
				'The corresponding script does not exist and cannot be opened.',
			))
			return
		}
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(entry.scriptPath))
		await vscode.window.showTextDocument(document, { preview: true })
	}

	private async revealConfiguration(entry: BookmarkConfigurationEntry): Promise<void> {
		await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(entry.filePath))
	}
}
