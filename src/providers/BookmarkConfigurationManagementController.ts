/**
 * 为配置管理页面提供列表、重新绑定、删除与历史残留清理操作。
 * 控制器在执行破坏性操作前确认用户意图，并在完成后刷新仓库与页面数据。
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
	cleanupEmptyScopeFolders(): Promise<void>
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
			throw new Error(localize("providers.BookmarkConfigurationManagementController.theBookmarkStorageFolderIsNotConfigured"))
		}
		return storageRoot
	}

	private async delete(requests: readonly BookmarkConfigurationDeleteRequest[]): Promise<void> {
		this.requiredStorageRoot()
		this.port.beginStorageTransition()
		try {
			await this.port.flushPendingSaves(true)
			const result = await bookmarkRepository.deleteBookmarkConfigurationFiles(requests)
			await this.port.cleanupEmptyScopeFolders()
			if (this.port.finishStorageTransition()) {
				this.port.saveAllBookmarks()
				await this.port.flushPendingSaves(true)
			}
			await this.port.reloadActiveTab(true)
			const skipped = result.changedFiles + result.missingFiles + result.failedFiles
			const deletedScripts = result.deletedEntries.filter(entry => entry.kind === 'script').length
			const deletedWorkspaceOrders = result.deletedEntries.filter(entry => entry.kind === 'workspaceOrder').length
			const deletedWorkspaceLayouts = result.deletedEntries.filter(entry => entry.kind === 'workspaceLayout').length
			const deletedTransferJournals = result.deletedEntries.filter(entry => entry.kind === 'transferJournal').length
			const deletedPortableExchanges = result.deletedEntries.filter(entry => entry.kind === 'portableExchange').length
			const deletedTemporaryArtifacts = result.deletedEntries.filter(entry => entry.kind === 'temporaryArtifact').length
			const deletedKinds = [
				deletedScripts > 0 ? localize("providers.BookmarkConfigurationManagementController.bookmarkConfigurations", { deletedScripts, formatBookmarkLevelSummary: formatBookmarkLevelSummary(result.bookmarkSummary) }) : '',
				deletedWorkspaceOrders > 0 ? localize("providers.BookmarkConfigurationManagementController.workspaceOrderRecords", { deletedWorkspaceOrders }) : '',
				deletedWorkspaceLayouts > 0 ? localize("providers.BookmarkConfigurationManagementController.workspaceLayoutRecords", { deletedWorkspaceLayouts }) : '',
				deletedTransferJournals > 0 ? localize("providers.BookmarkConfigurationManagementController.storageTransferJournals", { deletedTransferJournals }) : '',
				deletedPortableExchanges > 0 ? localize('providers.BookmarkConfigurationManagementController.portableExchangeRecords', { deletedPortableExchanges }) : '',
				deletedTemporaryArtifacts > 0 ? localize("providers.BookmarkConfigurationManagementController.temporaryArtifacts", { deletedTemporaryArtifacts }) : '',
			].filter(Boolean).join(localize("providers.BookmarkConfigurationManagementController.message")) || localize("providers.BookmarkConfigurationManagementController.none")
			const message = localize("providers.BookmarkConfigurationManagementController.bookmarkStorageCleanupCompletedRequestedRemovedSkipped", { requestedFiles: result.requestedFiles, deletedFiles: result.deletedFiles, skipped, deletedKinds })
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
			void vscode.window.showInformationMessage(localize("providers.BookmarkConfigurationManagementController.thisRecordDoesNotRepresentAScriptSoNo"))
			return
		}
		if (!entry.scriptPath || !entry.sourceExists) {
			void vscode.window.showWarningMessage(localize("providers.BookmarkConfigurationManagementController.theCorrespondingScriptDoesNotExistAndCannotBe"))
			return
		}
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(entry.scriptPath))
		await vscode.window.showTextDocument(document, { preview: true })
	}

	private async revealConfiguration(entry: BookmarkConfigurationEntry): Promise<void> {
		await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(entry.filePath))
	}
}
