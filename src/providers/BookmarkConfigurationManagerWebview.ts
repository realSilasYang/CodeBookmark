/**
 * 生成书签配置管理 Webview，展示路径、健康状态、更新时间、大小和可执行操作。
 * 页面只通过带类型的消息请求控制器操作；CSP、主题颜色和焦点状态都由此处统一处理。
 */
import * as crypto from 'crypto'
import * as vscode from 'vscode'
import { currentFormattingLocale, localize } from '../i18n/Localization'
import type {
	BookmarkConfigurationDeleteRequest,
	BookmarkConfigurationEntry,
} from '../repository/BookmarkConfigurationCatalog'
import { logger } from '../util/Logger'
import { errorMessage } from '../util/ErrorMessage'

interface BookmarkConfigurationManagerSnapshot {
	storageRoot: string
	entries: readonly BookmarkConfigurationEntry[]
}

interface BookmarkConfigurationManagerPort {
	load(): Promise<BookmarkConfigurationManagerSnapshot>
	delete(requests: readonly BookmarkConfigurationDeleteRequest[]): Promise<void>
	openSource(entry: BookmarkConfigurationEntry): Promise<void>
	revealConfiguration(entry: BookmarkConfigurationEntry): Promise<void>
	revealStorageRoot(storageRoot: string): Promise<void>
}

export class BookmarkConfigurationManagerWebview {
	private static currentPanel: BookmarkConfigurationManagerWebview | undefined
	private readonly disposables: vscode.Disposable[] = []
	private readonly entries = new Map<string, BookmarkConfigurationEntry>()
	private loadGeneration = 0
	private deleting = false
	private disposed = false
	private storageRoot: string | undefined

	static createOrShow(context: vscode.ExtensionContext, port: BookmarkConfigurationManagerPort): void {
		const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One
		if (this.currentPanel) {
			this.currentPanel.port = port
			this.currentPanel.panel.reveal(column)
			void this.currentPanel.load()
			return
		}
		const panel = vscode.window.createWebviewPanel(
			'codebookmark.configurationManager',
			localize("providers.BookmarkConfigurationManagerWebview.bookmarkConfigurationManager"),
			column,
			{
				enableScripts: true,
				localResourceRoots: [],
				retainContextWhenHidden: true,
			},
		)
		this.currentPanel = new BookmarkConfigurationManagerWebview(panel, context, port)
	}

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		context: vscode.ExtensionContext,
		private port: BookmarkConfigurationManagerPort,
	) {
		this.panel.onDidDispose(() => this.disposeResources(), null, this.disposables)
		this.panel.webview.onDidReceiveMessage(
			message => { void this.handleMessage(message) },
			null,
			this.disposables,
		)
		// 页面设置 HTML 后会立即发送 ready；监听器必须先就位，避免调试宿主启动较快时永久丢失首次加载请求。
		this.panel.webview.html = this.html()
		context.subscriptions.push({ dispose: () => this.dispose() })
	}

	private async handleMessage(message: unknown): Promise<void> {
		if (typeof message !== 'object' || message === null) return
		const candidate = message as Record<string, unknown>
		if (typeof candidate.command !== 'string') return
		try {
			switch (candidate.command) {
				case 'ready':
				case 'refresh':
					await this.load()
					return
				case 'delete':
					await this.deleteEntries(candidate.storagePaths)
					return
				case 'openSource':
					await this.openEntry(candidate.storagePath, true)
					return
				case 'revealConfiguration':
					await this.openEntry(candidate.storagePath, false)
					return
				case 'openStorageRoot':
					if (this.storageRoot) await this.port.revealStorageRoot(this.storageRoot)
					return
			}
		} catch (error) {
			logger.error(localize("providers.BookmarkConfigurationManagerWebview.failedToProcessABookmarkConfigurationManagerMessage", { error }))
			void vscode.window.showErrorMessage(localize("providers.BookmarkConfigurationManagerWebview.bookmarkConfigurationManagerFailed", { errorMessage: errorMessage(error) }))
			this.post({ type: 'operationComplete' })
		}
	}

	private async openEntry(storagePath: unknown, source: boolean): Promise<void> {
		if (typeof storagePath !== 'string') return
		const entry = this.entries.get(storagePath)
		if (!entry) return
		if (source) await this.port.openSource(entry)
		else await this.port.revealConfiguration(entry)
	}

	private async deleteEntries(storagePaths: unknown): Promise<void> {
		if (this.deleting || !Array.isArray(storagePaths) || storagePaths.length > 20_000) return
		const requests: BookmarkConfigurationDeleteRequest[] = []
		const seen = new Set<string>()
		for (const value of storagePaths) {
			if (typeof value !== 'string' || seen.has(value)) continue
			seen.add(value)
			const entry = this.entries.get(value)
			if (entry) requests.push({ storagePath: entry.storagePath, revision: entry.revision })
		}
		if (requests.length === 0) return
		this.deleting = true
		this.post({ type: 'operationStarted' })
		try {
			await this.port.delete(requests)
			await this.load()
		} finally {
			this.deleting = false
		}
	}

	private async load(): Promise<void> {
		const generation = ++this.loadGeneration
		this.post({ type: 'loading' })
		try {
			const snapshot = await this.port.load()
			if (this.disposed || generation !== this.loadGeneration) return
			this.storageRoot = snapshot.storageRoot
			this.entries.clear()
			for (const entry of snapshot.entries) this.entries.set(entry.storagePath, entry)
			this.post({
				type: 'state',
				storageRoot: snapshot.storageRoot,
				entries: snapshot.entries,
			})
		} catch (error) {
			if (this.disposed || generation !== this.loadGeneration) return
			logger.error(localize("providers.BookmarkConfigurationManagerWebview.failedToReadTheBookmarkConfigurationFolder", { error }))
			this.post({
				type: 'loadError',
				message: errorMessage(error),
			})
		}
	}

	private post(message: unknown): void {
		if (!this.disposed) void this.panel.webview.postMessage(message)
	}

	dispose(): void {
		if (!this.disposed) this.panel.dispose()
	}

	private disposeResources(): void {
		if (this.disposed) return
		this.disposed = true
		if (BookmarkConfigurationManagerWebview.currentPanel === this) {
			BookmarkConfigurationManagerWebview.currentPanel = undefined
		}
		while (this.disposables.length > 0) this.disposables.pop()?.dispose()
	}

	private html(): string {
		const nonce = crypto.randomBytes(16).toString('base64')
		const locale = currentFormattingLocale()
		const text = {
			title: localize("providers.BookmarkConfigurationManagerWebview.bookmarkConfigurationManager"),
			openStorageFolder: localize("providers.BookmarkConfigurationManagerWebview.openStorageFolder"),
			readingStorageFolder: localize("providers.BookmarkConfigurationManagerWebview.readingStorageFolder"),
			statisticsAria: localize("providers.BookmarkConfigurationManagerWebview.bookmarkStorageRecordStatistics"),
			metrics: [
				localize("providers.BookmarkConfigurationManagerWebview.storageRecords"),
				localize("providers.BookmarkConfigurationManagerWebview.bookmarks"),
				localize("providers.BookmarkConfigurationManagerWebview.bound"),
				localize("providers.BookmarkConfigurationManagerWebview.backupsAndConflicts"),
				localize("providers.BookmarkConfigurationManagerWebview.workspaceData"),
				localize("providers.BookmarkConfigurationManagerWebview.needsAttention"),
			],
			searchPlaceholder: localize("providers.BookmarkConfigurationManagerWebview.searchScriptPathsWorkspacesRecordsOrBookmarkLabels"),
			searchAria: localize("providers.BookmarkConfigurationManagerWebview.searchBookmarkStorageRecords"),
			filterAria: localize("providers.BookmarkConfigurationManagerWebview.filterBookmarkStorageRecords"),
			filters: [
				localize("providers.BookmarkConfigurationManagerWebview.allStatuses"), localize("providers.BookmarkConfigurationManagerWebview.primaryConfigurations"),
				localize("providers.BookmarkConfigurationManagerWebview.bound"), localize("providers.BookmarkConfigurationManagerWebview.emptyConfigurations"),
				localize("providers.BookmarkConfigurationManagerWebview.scriptMissing"), localize("providers.BookmarkConfigurationManagerWebview.currentWorkspaceData"),
				localize("providers.BookmarkConfigurationManagerWebview.backupsAndConflicts"), localize('providers.BookmarkConfigurationManagerWebview.portableExchangeRecords'),
				localize("providers.BookmarkConfigurationManagerWebview.storageTransferJournals"), localize("providers.BookmarkConfigurationManagerWebview.temporaryArtifacts"), localize("providers.BookmarkConfigurationManagerWebview.unparseable"),
			],
			sortAria: localize("providers.BookmarkConfigurationManagerWebview.sortConfigurationFiles"),
			sorts: [
				localize("providers.BookmarkConfigurationManagerWebview.recentlyModified"), localize("providers.BookmarkConfigurationManagerWebview.bookmarkCount"),
				localize("providers.BookmarkConfigurationManagerWebview.scriptPath"), localize("providers.BookmarkConfigurationManagerWebview.fileSize"),
			],
			initialResult: localize("providers.BookmarkConfigurationManagerWebview.showingOfRecords"),
			refresh: localize("providers.BookmarkConfigurationManagerWebview.refresh"),
			deleteSelected: localize("providers.BookmarkConfigurationManagerWebview.deleteSelected"),
			selectCurrentResults: localize("providers.BookmarkConfigurationManagerWebview.selectCurrentResults"),
			columns: [
				localize("providers.BookmarkConfigurationManagerWebview.scriptWorkspaceOrRecord"),
				localize("providers.BookmarkConfigurationManagerWebview.status"), localize("providers.BookmarkConfigurationManagerWebview.contentSummary"),
				localize("providers.BookmarkConfigurationManagerWebview.timeAndSize"),
			],
			readingConfigurations: localize("providers.BookmarkConfigurationManagerWebview.readingConfigurationFiles"),
			showMore: localize("providers.BookmarkConfigurationManagerWebview.showMore"),
			defaultDeleteTitle: localize("providers.BookmarkConfigurationManagerWebview.removeTheSelectedBookmarkStorageRecords"),
			cancel: localize("providers.BookmarkConfigurationManagerWebview.cancel"),
			delete: localize("providers.BookmarkConfigurationManagerWebview.delete"),
			roleLabels: {
				primary: localize("providers.BookmarkConfigurationManagerWebview.primaryConfiguration"), backup: localize("providers.BookmarkConfigurationManagerWebview.transferBackup"),
				conflict: localize("providers.BookmarkConfigurationManagerWebview.conflictCopy"), superseded: localize("providers.BookmarkConfigurationManagerWebview.superseded"),
				workspaceOrder: localize("providers.BookmarkConfigurationManagerWebview.workspaceOrder"), workspaceLayout: localize("providers.BookmarkConfigurationManagerWebview.workspaceLayout"), transferJournal: localize("providers.BookmarkConfigurationManagerWebview.storageTransferJournal"),
				portableExchange: localize('providers.BookmarkConfigurationManagerWebview.portableExchangeRecord'),
				batchRenameTemporary: localize("providers.BookmarkConfigurationManagerWebview.batchRenameTemporaryFile"),
				unknown: localize("providers.BookmarkConfigurationManagerWebview.otherFile"),
			},
			healthLabels: {
				bound: localize("providers.BookmarkConfigurationManagerWebview.bound2"), missing: localize("providers.BookmarkConfigurationManagerWebview.scriptMissing"), empty: localize("providers.BookmarkConfigurationManagerWebview.emptyConfiguration"),
				snapshot: localize("providers.BookmarkConfigurationManagerWebview.historicalCopy"), valid: localize("providers.BookmarkConfigurationManagerWebview.validRecord"), temporary: localize("providers.BookmarkConfigurationManagerWebview.temporaryArtifact"), invalid: localize("providers.BookmarkConfigurationManagerWebview.unparseable"),
			},
			unknown: localize("providers.BookmarkConfigurationManagerWebview.unknown"),
			levelLabels: [
				localize("providers.BookmarkConfigurationManagerWebview.level"), localize("providers.BookmarkConfigurationManagerWebview.level2"), localize("providers.BookmarkConfigurationManagerWebview.level3"), localize("providers.BookmarkConfigurationManagerWebview.level4"),
				localize("providers.BookmarkConfigurationManagerWebview.level5"), localize("providers.BookmarkConfigurationManagerWebview.level6"), localize("providers.BookmarkConfigurationManagerWebview.level7"), localize("providers.BookmarkConfigurationManagerWebview.level8"),
			],
			levelFallback: localize("providers.BookmarkConfigurationManagerWebview.level9"),
			levelCount: localize("providers.BookmarkConfigurationManagerWebview.message"),
			noLevelBookmarks: localize("providers.BookmarkConfigurationManagerWebview.noLeveledBookmarks"),
			totalBookmarksWithLevels: localize("providers.BookmarkConfigurationManagerWebview.bookmarks2"),
			transferComplete: localize("providers.BookmarkConfigurationManagerWebview.completed"),
			transferInProgress: localize("providers.BookmarkConfigurationManagerWebview.inProgress"),
			deleteQuestion: localize("providers.BookmarkConfigurationManagerWebview.removeBookmarkStorageRecords"),
			deleteSummary: localize("providers.BookmarkConfigurationManagerWebview.recordsAreRecheckedBeforeRemovalRecordsModifiedByAnother"),
			deleteScriptDetails: localize("providers.BookmarkConfigurationManagerWebview.bookmarkConfigurations"),
			deleteWorkspaceDetails: localize("providers.BookmarkConfigurationManagerWebview.workspaceOrderRecordsAffectsFileOrderOnlyBookmarksAre"),
			deleteLayoutDetails: localize("providers.BookmarkConfigurationManagerWebview.workspaceLayoutRecordsLocalScriptHierarchiesAreRestoredAfter"),
			deleteTransferDetails: localize("providers.BookmarkConfigurationManagerWebview.storageTransferJournalsRemovesHistoryOnlyCurrentBookmarksAre"),
			deleteExchangeDetails: localize('providers.BookmarkConfigurationManagerWebview.portableExchangeRecordsRemovalEffect'),
			deleteTemporaryDetails: localize("providers.BookmarkConfigurationManagerWebview.batchRenameTemporaryArtifactsUnappliedLabelDraftsInThem"),
			deleteWarning: localize("providers.BookmarkConfigurationManagerWebview.deletedBookmarkConfigurationsCannotBeRestoredWithBookmarkUndo"),
			deleteSelectedCount: localize("providers.BookmarkConfigurationManagerWebview.deleteSelected2"),
			unidentifiedScript: localize("providers.BookmarkConfigurationManagerWebview.unableToIdentifyTheCorrespondingScript"),
			workspace: localize("providers.BookmarkConfigurationManagerWebview.workspace"),
			pathHash: localize("providers.BookmarkConfigurationManagerWebview.pathHash"),
			additionalRecords: localize("providers.BookmarkConfigurationManagerWebview.more"),
			transferJournal: localize("providers.BookmarkConfigurationManagerWebview.storageTransferJournal"),
			portableExchangeRecord: localize('providers.BookmarkConfigurationManagerWebview.portableExchangeRecord'),
			exchangeIdentity: localize('providers.BookmarkConfigurationManagerWebview.exchangeIdentity'),
			exchangeScope: localize('providers.BookmarkConfigurationManagerWebview.exchangeScope'),
			exchangeRevision: localize('providers.BookmarkConfigurationManagerWebview.exchangeRevision'),
			exchangeMappings: localize('providers.BookmarkConfigurationManagerWebview.exchangeMappings'),
			exchangePurpose: localize('providers.BookmarkConfigurationManagerWebview.exchangePurpose'),
			exchangeUpdated: localize('providers.BookmarkConfigurationManagerWebview.exchangeUpdated'),
			batchRenameTemporary: localize("providers.BookmarkConfigurationManagerWebview.batchRenameTemporaryArtifact"),
			temporaryDraftPurpose: localize("providers.BookmarkConfigurationManagerWebview.retainedAfterAnInterruptionOrAnEditorThatDid"),
			source: localize("providers.BookmarkConfigurationManagerWebview.source"),
			target: localize("providers.BookmarkConfigurationManagerWebview.target"),
			orderedPaths: localize("providers.BookmarkConfigurationManagerWebview.orderedPaths"),
			workspaceOrderPurpose: localize("providers.BookmarkConfigurationManagerWebview.restoresScriptDisplayOrderForThisWorkspace"),
			workspaceLayoutPurpose: localize("providers.BookmarkConfigurationManagerWebview.nodesCrossFileRelationshipsHiddenFileNodes"),
			workspaceExpansionPurpose: localize("providers.BookmarkConfigurationManagerWebview.expandedCollapsed"),
			pinnedContainer: localize("providers.BookmarkConfigurationManagerWebview.pinnedContainer"),
			transferState: localize("providers.BookmarkConfigurationManagerWebview.transfer"),
			transferCounts: localize("providers.BookmarkConfigurationManagerWebview.copiedMergedConflicts"),
			totalBookmarks: localize("providers.BookmarkConfigurationManagerWebview.bookmarks3"),
			automaticBookmarks: localize("providers.BookmarkConfigurationManagerWebview.automaticBookmarks"),
			invalidBookmarks: localize("providers.BookmarkConfigurationManagerWebview.invalidOrAbnormal"),
			selectRecord: localize("providers.BookmarkConfigurationManagerWebview.select"),
			bindingUpdated: localize("providers.BookmarkConfigurationManagerWebview.bindingUpdated"),
			transferStarted: localize("providers.BookmarkConfigurationManagerWebview.transferStarted"),
			transferCompleted: localize("providers.BookmarkConfigurationManagerWebview.transferCompleted"),
			recordType: localize("providers.BookmarkConfigurationManagerWebview.recordType"),
			fileModified: localize("providers.BookmarkConfigurationManagerWebview.fileModified"),
			size: localize("providers.BookmarkConfigurationManagerWebview.size"),
			openScript: localize("providers.BookmarkConfigurationManagerWebview.openScript"),
			revealFile: localize("providers.BookmarkConfigurationManagerWebview.revealFile"),
			deleteConfiguration: localize("providers.BookmarkConfigurationManagerWebview.deleteConfiguration"),
			cleanRecord: localize("providers.BookmarkConfigurationManagerWebview.removeRecord"),
			readingRecords: localize("providers.BookmarkConfigurationManagerWebview.readingBookmarkStorageRecords"),
			emptyRecords: localize("providers.BookmarkConfigurationManagerWebview.noBookmarkStorageRecordsMatchTheCurrentFilters"),
			resultAll: localize("providers.BookmarkConfigurationManagerWebview.showingOfRecords2"),
			resultFiltered: localize("providers.BookmarkConfigurationManagerWebview.showingOfMatchingRecordsTotal"),
			loadFailed: localize("providers.BookmarkConfigurationManagerWebview.failedToLoad"),
			storageFolder: localize("providers.BookmarkConfigurationManagerWebview.storageFolder"),
			revealStorageFolder: localize("providers.BookmarkConfigurationManagerWebview.openInTheFileExplorer"),
		}
		const serializedText = JSON.stringify(text).replace(/</g, '\\u003c')
		return `<!DOCTYPE html>
<html lang="${locale}">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'nonce-${nonce}'; script-src ${this.panel.webview.cspSource} 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${text.title}</title>
	<style nonce="${nonce}">
		* { box-sizing: border-box; letter-spacing: 0; }
		html, body { min-height: 100%; margin: 0; }
		body { padding: 24px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
		body.vscode-dark, body.vscode-high-contrast { color-scheme: dark; }
		body.vscode-light, body.vscode-high-contrast-light { color-scheme: light; }
		button, input { font: inherit; }
		.page { --content-inset: 24px; width: 100%; max-width: 1680px; margin: 0 auto; }
		.header { padding: 20px var(--content-inset) 16px; border-bottom: 1px solid var(--vscode-panel-border); }
		.title-row { display: flex; align-items: center; gap: 12px; min-width: 0; }
		h1 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; }
		.storage-root { display: block; max-width: 100%; min-height: 0; margin-top: 5px; padding: 0; overflow: hidden; color: var(--vscode-textLink-foreground); background: transparent; border: 0; text-align: left; text-decoration: underline; text-decoration-style: dotted; text-overflow: ellipsis; white-space: nowrap; }
		.storage-root:hover { color: var(--vscode-textLink-activeForeground); background: transparent; }
		.storage-root:disabled { color: var(--vscode-descriptionForeground); text-decoration: none; }
		.summary { display: grid; grid-template-columns: repeat(6, minmax(110px, 1fr)); border-bottom: 1px solid var(--vscode-panel-border); }
		.metric { min-width: 0; padding: 13px var(--content-inset); border-right: 1px solid var(--vscode-panel-border); }
		.metric:last-child { border-right: 0; }
		.metric-value { display: block; font-size: 19px; line-height: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
		.metric-label { display: block; margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 12px; }
		.toolbar { display: flex; align-items: center; gap: 8px; min-height: 54px; padding: 9px var(--content-inset); border-bottom: 1px solid var(--vscode-panel-border); }
		.search { width: min(360px, 42vw); min-width: 190px; }
		input { width: 100%; height: 32px; padding: 0 9px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; outline: none; }
		input:focus, button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
		.toolbar-spacer { flex: 1; }
		.result-count { color: var(--vscode-descriptionForeground); white-space: nowrap; }
		button { min-height: 30px; padding: 4px 10px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 2px; cursor: pointer; }
		button:hover { background: var(--vscode-button-hoverBackground); }
		button.secondary { color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground); }
		button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
		button.danger { color: var(--vscode-button-foreground); background: var(--vscode-inputValidation-errorBackground, var(--vscode-button-background)); border: 1px solid var(--vscode-inputValidation-errorBorder, transparent); }
		button.icon-button { width: 32px; min-width: 32px; padding: 0; font-size: 18px; }
		button:disabled { opacity: .5; cursor: default; }
		.dropdown { position: relative; width: 118px; flex: 0 0 118px; }
		.dropdown-trigger { display: flex; width: 100%; height: 32px; min-height: 32px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 10px; overflow: hidden; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 0; }
		.dropdown-trigger:hover { background: var(--vscode-list-hoverBackground, var(--vscode-dropdown-background)); }
		.dropdown-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.dropdown-chevron { width: 7px; height: 7px; flex: 0 0 7px; margin: -4px 2px 0 0; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); }
		.dropdown.open .dropdown-chevron { margin-top: 4px; transform: rotate(225deg); }
		.dropdown-menu { position: absolute; top: calc(100% + 2px); left: 0; z-index: 20; width: max-content; min-width: 100%; padding: 2px 0; overflow: hidden; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 0; border-radius: 2px; box-shadow: 0 2px 8px var(--vscode-widget-shadow); }
		.dropdown-option { display: flex; width: 100%; min-height: 32px; align-items: center; justify-content: space-between; gap: 16px; padding: 5px 10px; color: var(--vscode-dropdown-foreground); background: transparent; border: 0; border-radius: 0; text-align: left; white-space: nowrap; }
		.dropdown-option:hover, .dropdown-option.active { color: var(--vscode-list-activeSelectionForeground); background: var(--vscode-list-activeSelectionBackground); }
		.dropdown-option[aria-selected="true"]::after { content: '✓'; }
		.table-wrap { width: 100%; overflow: auto; }
		table { width: 100%; min-width: 920px; border-collapse: collapse; table-layout: fixed; }
		col.select-col { width: 42px; }
		col.script-col { width: 33%; }
		col.status-col { width: 110px; }
		col.count-col { width: 17%; }
		col.info-col { width: 28%; }
		col.action-col { width: 160px; }
		th { position: sticky; top: 0; z-index: 2; height: 36px; padding: 0 10px; color: var(--vscode-descriptionForeground); background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); text-align: left; font-size: 12px; font-weight: 600; }
		td { padding: 11px 10px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
		tr:hover td { background: var(--vscode-list-hoverBackground); }
		input[type="checkbox"] { position: relative; width: 16px; height: 16px; margin: 2px 0 0; padding: 0; appearance: none; color: var(--vscode-checkbox-foreground); background: var(--vscode-checkbox-background); border: 1px solid var(--vscode-checkbox-border, transparent); border-radius: 2px; cursor: pointer; }
		input[type="checkbox"]:checked, input[type="checkbox"]:indeterminate { background: var(--vscode-checkbox-selectBackground, var(--vscode-checkbox-background)); }
		input[type="checkbox"]:checked::after { position: absolute; top: 1px; left: 4px; width: 4px; height: 8px; content: ''; border: solid var(--vscode-checkbox-foreground); border-width: 0 2px 2px 0; transform: rotate(45deg); }
		input[type="checkbox"]:indeterminate::after { position: absolute; top: 6px; left: 3px; width: 8px; height: 2px; content: ''; background: var(--vscode-checkbox-foreground); }
		.primary-text { overflow: hidden; color: var(--vscode-foreground); font-weight: 600; line-height: 20px; text-overflow: ellipsis; white-space: nowrap; }
		.secondary-text { margin-top: 2px; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
		.preview { margin-top: 4px; overflow: hidden; color: var(--vscode-descriptionForeground); line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
		.detail-value { cursor: help; }
		.status-line { display: flex; align-items: center; gap: 6px; min-height: 20px; }
		.status-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: var(--vscode-descriptionForeground); }
		.status-line[data-health="bound"] .status-dot, .status-line[data-health="valid"] .status-dot { background: var(--vscode-testing-iconPassed); }
		.status-line[data-health="missing"] .status-dot { background: var(--vscode-testing-iconQueued); }
		.status-line[data-health="invalid"] .status-dot { background: var(--vscode-testing-iconFailed); }
		.status-line[data-health="empty"] .status-dot { background: var(--vscode-disabledForeground); }
		.status-line[data-health="temporary"] .status-dot { background: var(--vscode-editorWarning-foreground); }
		.role { margin-top: 3px; color: var(--vscode-descriptionForeground); font-size: 12px; }
		.count { font-size: 16px; line-height: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
		.levels, .aux-counts, .time-line { margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 18px; }
		.actions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; }
		.actions button { width: 100%; min-height: 28px; padding: 3px 4px; font-size: 12px; white-space: nowrap; }
		.actions .delete-action { grid-column: 1 / -1; }
		.actions.record-actions .secondary { grid-column: 1 / -1; }
		.empty { height: 160px; color: var(--vscode-descriptionForeground); text-align: center; vertical-align: middle; }
		.error { padding: 28px; color: var(--vscode-errorForeground); }
		.modal-backdrop { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0, 0, 0, .45); }
		.modal { width: min(560px, 100%); max-height: min(720px, calc(100vh - 48px)); overflow: auto; color: var(--vscode-foreground); background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); border-radius: 4px; box-shadow: 0 8px 32px var(--vscode-widget-shadow); }
		.modal-header { display: flex; align-items: flex-start; gap: 12px; padding: 20px 22px 14px; border-bottom: 1px solid var(--vscode-panel-border); }
		.modal-title-mark { display: grid; width: 24px; height: 24px; flex: 0 0 24px; place-items: center; color: var(--vscode-editor-background); background: var(--vscode-editorWarning-foreground, var(--vscode-charts-yellow)); border-radius: 50%; font-weight: 700; }
		.modal-title { margin: 0; color: var(--vscode-foreground); font-size: 16px; line-height: 24px; font-weight: 600; }
		.modal-content { padding: 16px 22px 20px; }
		.modal-summary { margin: 0; color: var(--vscode-foreground); line-height: 22px; }
		.modal-details { display: grid; gap: 8px; margin: 14px 0 0; padding: 0; list-style: none; }
		.modal-detail { padding: 9px 11px; color: var(--vscode-descriptionForeground); background: var(--vscode-textBlockQuote-background, var(--vscode-editor-background)); border-left: 2px solid var(--vscode-textLink-foreground); line-height: 20px; }
		.modal-warning { margin: 14px 0 0; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 18px; }
		.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 22px 18px; background: var(--vscode-editor-background); border-top: 1px solid var(--vscode-panel-border); }
		.modal-actions button { min-width: 84px; }
		.modal-actions .confirm-delete { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
		.modal-actions .confirm-delete:hover { background: var(--vscode-button-hoverBackground); }
		.pagination { display: flex; justify-content: center; padding: 12px 16px 20px; }
		[hidden] { display: none !important; }
		@media (max-width: 760px) {
			body { padding: 12px; }
			.page { --content-inset: 16px; }
			.header { padding: 16px var(--content-inset); }
			.summary { grid-template-columns: repeat(2, minmax(110px, 1fr)); }
			.metric { border-bottom: 1px solid var(--vscode-panel-border); }
			.toolbar { align-items: stretch; flex-wrap: wrap; }
			.search { width: 100%; }
			.toolbar-spacer { display: none; }
			.result-count { width: 100%; }
		}
	</style>
</head>
<body>
	<main class="page">
	<header class="header">
		<div class="title-row"><h1>${text.title}</h1></div>
		<button class="storage-root" id="storage-root" type="button" title="${text.openStorageFolder}" disabled>${text.readingStorageFolder}</button>
	</header>
			<section class="summary" aria-label="${text.statisticsAria}">
				<div class="metric"><span class="metric-value" id="metric-files">0</span><span class="metric-label">${text.metrics[0]}</span></div>
				<div class="metric"><span class="metric-value" id="metric-bookmarks">0</span><span class="metric-label">${text.metrics[1]}</span></div>
				<div class="metric"><span class="metric-value" id="metric-bound">0</span><span class="metric-label">${text.metrics[2]}</span></div>
				<div class="metric"><span class="metric-value" id="metric-snapshots">0</span><span class="metric-label">${text.metrics[3]}</span></div>
				<div class="metric"><span class="metric-value" id="metric-workspace-data">0</span><span class="metric-label">${text.metrics[4]}</span></div>
				<div class="metric"><span class="metric-value" id="metric-attention">0</span><span class="metric-label">${text.metrics[5]}</span></div>
	</section>
	<div class="toolbar">
				<div class="search"><input id="search" type="search" placeholder="${text.searchPlaceholder}" aria-label="${text.searchAria}"></div>
		<div class="dropdown" id="filter" data-value="all">
					<button class="dropdown-trigger" type="button" role="combobox" aria-label="${text.filterAria}" aria-haspopup="listbox" aria-expanded="false" aria-controls="filter-options"><span class="dropdown-label">${text.filters[0]}</span><span class="dropdown-chevron" aria-hidden="true"></span></button>
			<div class="dropdown-menu" id="filter-options" role="listbox" hidden>
				<button class="dropdown-option" id="filter-option-all" type="button" role="option" data-value="all" aria-selected="true">${text.filters[0]}</button>
				<button class="dropdown-option" id="filter-option-primary" type="button" role="option" data-value="primary" aria-selected="false">${text.filters[1]}</button>
				<button class="dropdown-option" id="filter-option-bound" type="button" role="option" data-value="bound" aria-selected="false">${text.filters[2]}</button>
				<button class="dropdown-option" id="filter-option-empty" type="button" role="option" data-value="empty" aria-selected="false">${text.filters[3]}</button>
				<button class="dropdown-option" id="filter-option-missing" type="button" role="option" data-value="missing" aria-selected="false">${text.filters[4]}</button>
				<button class="dropdown-option" id="filter-option-workspace-data" type="button" role="option" data-value="workspaceData" aria-selected="false">${text.filters[5]}</button>
				<button class="dropdown-option" id="filter-option-snapshot" type="button" role="option" data-value="snapshot" aria-selected="false">${text.filters[6]}</button>
				<button class="dropdown-option" id="filter-option-exchange" type="button" role="option" data-value="exchange" aria-selected="false">${text.filters[7]}</button>
				<button class="dropdown-option" id="filter-option-transfer" type="button" role="option" data-value="transfer" aria-selected="false">${text.filters[8]}</button>
				<button class="dropdown-option" id="filter-option-temporary" type="button" role="option" data-value="temporary" aria-selected="false">${text.filters[9]}</button>
				<button class="dropdown-option" id="filter-option-invalid" type="button" role="option" data-value="invalid" aria-selected="false">${text.filters[10]}</button>
			</div>
		</div>
		<div class="dropdown" id="sort" data-value="modified">
			<button class="dropdown-trigger" type="button" role="combobox" aria-label="${text.sortAria}" aria-haspopup="listbox" aria-expanded="false" aria-controls="sort-options"><span class="dropdown-label">${text.sorts[0]}</span><span class="dropdown-chevron" aria-hidden="true"></span></button>
			<div class="dropdown-menu" id="sort-options" role="listbox" hidden>
				<button class="dropdown-option" id="sort-option-modified" type="button" role="option" data-value="modified" aria-selected="true">${text.sorts[0]}</button>
				<button class="dropdown-option" id="sort-option-bookmarks" type="button" role="option" data-value="bookmarks" aria-selected="false">${text.sorts[1]}</button>
				<button class="dropdown-option" id="sort-option-path" type="button" role="option" data-value="path" aria-selected="false">${text.sorts[2]}</button>
				<button class="dropdown-option" id="sort-option-size" type="button" role="option" data-value="size" aria-selected="false">${text.sorts[3]}</button>
			</div>
		</div>
		<div class="toolbar-spacer"></div>
				<span class="result-count" id="result-count">${text.initialResult}</span>
		<button class="secondary icon-button" id="refresh" title="${text.refresh}" aria-label="${text.refresh}">↻</button>
		<button class="danger" id="delete-selected" disabled>${text.deleteSelected}</button>
	</div>
	<div class="table-wrap">
		<table>
			<colgroup><col class="select-col"><col class="script-col"><col class="status-col"><col class="count-col"><col class="info-col"><col class="action-col"></colgroup>
			<thead><tr><th><input id="select-all" type="checkbox" aria-label="${text.selectCurrentResults}"></th><th>${text.columns[0]}</th><th>${text.columns[1]}</th><th>${text.columns[2]}</th><th>${text.columns[3]}</th><th></th></tr></thead>
			<tbody id="rows"><tr><td class="empty" colspan="6">${text.readingConfigurations}</td></tr></tbody>
		</table>
	</div>
	<div class="pagination" id="pagination" hidden><button class="secondary" id="show-more">${text.showMore}</button></div>
	</main>
	<div id="delete-confirmation" class="modal-backdrop" hidden>
		<section class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-summary">
			<header class="modal-header">
				<div class="modal-title-mark" aria-hidden="true">!</div>
				<h2 class="modal-title" id="delete-dialog-title">${text.defaultDeleteTitle}</h2>
			</header>
			<div class="modal-content">
				<p class="modal-summary" id="delete-dialog-summary"></p>
				<ul class="modal-details" id="delete-dialog-details"></ul>
				<p class="modal-warning" id="delete-dialog-warning" hidden></p>
			</div>
			<footer class="modal-actions">
				<button class="secondary" id="cancel-delete" type="button">${text.cancel}</button>
				<button class="confirm-delete" id="confirm-delete" type="button">${text.delete}</button>
			</footer>
		</section>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const text = ${serializedText};
		const locale = ${JSON.stringify(locale)};
		const PAGE_SIZE = 200;
		const state = { entries: [], selected: new Set(), pendingDeletePaths: [], previousFocus: null, loading: true, deleting: false, visibleLimit: PAGE_SIZE };
		const roleLabels = text.roleLabels;
		const healthLabels = text.healthLabels;
		const byId = id => document.getElementById(id);
		const formatText = (template, values = {}) => template.replace(/{([a-zA-Z]+)}/g, (_match, key) => String(values[key] ?? ''));
		const create = (tag, className, text) => {
			const element = document.createElement(tag);
			if (className) element.className = className;
			if (text !== undefined) element.textContent = text;
			return element;
		};
		const formatNumber = value => new Intl.NumberFormat(locale).format(value || 0);
		const formatDate = value => value ? new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : text.unknown;
		const formatSize = value => {
			if (value < 1024) return value + ' B';
			if (value < 1024 * 1024) return (value / 1024).toFixed(value < 10240 ? 1 : 0) + ' KiB';
			return (value / 1024 / 1024).toFixed(1) + ' MiB';
		};
		const levelName = index => text.levelLabels[index] || formatText(text.levelFallback, { level: index + 1 });
		const levelSummary = entry => (entry.bookmarkSummary.levelCounts || []).map((count, index) => formatText(text.levelCount, { level: levelName(index), count: formatNumber(count) })).join(' · ') || text.noLevelBookmarks;
		const transferStatusLabel = status => status === 'complete' ? text.transferComplete : status === 'in_progress' ? text.transferInProgress : text.unknown;
		const selectedEntriesForPaths = storagePaths => {
			const requested = new Set(storagePaths);
			return state.entries.filter(entry => requested.has(entry.storagePath));
		};
		const aggregateBookmarkSummary = entries => {
			const levelCounts = [];
			let total = 0;
			for (const entry of entries) {
				total += Number(entry.bookmarkSummary?.total || 0);
				for (const [index, count] of (entry.bookmarkSummary?.levelCounts || []).entries()) levelCounts[index] = (levelCounts[index] || 0) + Number(count || 0);
			}
			return { total, levelCounts };
		};
		const aggregateLevelSummary = entries => {
			const summary = aggregateBookmarkSummary(entries);
			const levels = summary.levelCounts.map((count, index) => formatText(text.levelCount, { level: levelName(index), count: formatNumber(count) })).join(' · ');
			return formatText(text.totalBookmarksWithLevels, { total: formatNumber(summary.total), levels: levels || text.noLevelBookmarks });
		};
		const closeDeleteConfirmation = restoreFocus => {
			const modal = byId('delete-confirmation');
			modal.hidden = true;
			state.pendingDeletePaths = [];
			const previousFocus = state.previousFocus;
			state.previousFocus = null;
			if (restoreFocus && previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) previousFocus.focus();
		};
		const openDeleteConfirmation = storagePaths => {
			if (state.deleting) return;
			const entries = selectedEntriesForPaths(storagePaths);
			if (entries.length === 0) return;
			state.pendingDeletePaths = entries.map(entry => entry.storagePath);
			state.previousFocus = document.activeElement;
			byId('delete-dialog-title').textContent = formatText(text.deleteQuestion, { count: formatNumber(entries.length) });
			byId('delete-dialog-summary').textContent = text.deleteSummary;
			const details = byId('delete-dialog-details');
			details.replaceChildren();
			const scripts = entries.filter(entry => entry.kind === 'script');
			const workspaceOrders = entries.filter(entry => entry.kind === 'workspaceOrder');
			const workspaceLayouts = entries.filter(entry => entry.kind === 'workspaceLayout');
			const transferJournals = entries.filter(entry => entry.kind === 'transferJournal');
			const portableExchanges = entries.filter(entry => entry.kind === 'portableExchange');
			const temporaryArtifacts = entries.filter(entry => entry.kind === 'temporaryArtifact');
			if (scripts.length) details.appendChild(create('li', 'modal-detail', formatText(text.deleteScriptDetails, { count: formatNumber(scripts.length), summary: aggregateLevelSummary(scripts) })));
			if (workspaceOrders.length) details.appendChild(create('li', 'modal-detail', formatText(text.deleteWorkspaceDetails, { count: formatNumber(workspaceOrders.length) })));
			if (workspaceLayouts.length) details.appendChild(create('li', 'modal-detail', formatText(text.deleteLayoutDetails, { count: formatNumber(workspaceLayouts.length) })));
			if (transferJournals.length) details.appendChild(create('li', 'modal-detail', formatText(text.deleteTransferDetails, { count: formatNumber(transferJournals.length) })));
			if (portableExchanges.length) details.appendChild(create('li', 'modal-detail', formatText(text.deleteExchangeDetails, { count: formatNumber(portableExchanges.length) })));
			if (temporaryArtifacts.length) details.appendChild(create('li', 'modal-detail', formatText(text.deleteTemporaryDetails, { count: formatNumber(temporaryArtifacts.length) })));
			const warning = byId('delete-dialog-warning');
			warning.hidden = scripts.length === 0;
			warning.textContent = scripts.length ? text.deleteWarning : '';
			byId('confirm-delete').disabled = false;
			byId('delete-confirmation').hidden = false;
			byId('cancel-delete').focus();
		};
		const confirmDelete = () => {
			if (state.pendingDeletePaths.length === 0 || state.deleting) return;
			const storagePaths = [...state.pendingDeletePaths];
			closeDeleteConfirmation(false);
			vscode.postMessage({ command: 'delete', storagePaths });
		};
		const isCurrentWorkspaceData = entry => entry.role === 'workspaceOrder' || entry.role === 'workspaceLayout';
		const matchesFilter = entry => {
			const filter = byId('filter').dataset.value;
			if (filter === 'primary') return entry.role === 'primary';
			if (filter === 'snapshot') return ['backup', 'conflict', 'superseded'].includes(entry.role);
			if (filter === 'workspaceData') return isCurrentWorkspaceData(entry);
			if (filter === 'exchange') return entry.kind === 'portableExchange';
			if (filter === 'transfer') return entry.kind === 'transferJournal';
			if (filter !== 'all') return entry.health === filter;
			return true;
		};
		const visibleEntries = () => {
			const query = byId('search').value.trim().toLocaleLowerCase(locale);
			const entries = state.entries.filter(entry => {
				if (!matchesFilter(entry)) return false;
				if (!query) return true;
				return [entry.storagePath, entry.fileName, entry.filePath, entry.scriptPath, entry.workspaceName,
					entry.workspacePathHash, entry.transferSource, entry.transferTarget, entry.exchangeId, entry.exchangeScope,
					entry.exchangeRevisionId, ...(entry.orderedPaths || []), ...(entry.labelPreview || [])]
					.filter(Boolean).some(value => String(value).toLocaleLowerCase(locale).includes(query));
			});
			const sort = byId('sort').dataset.value;
			return entries.sort((left, right) => {
				if (sort === 'bookmarks') return right.bookmarkSummary.total - left.bookmarkSummary.total || right.modifiedAt - left.modifiedAt;
				if (sort === 'path') return (left.scriptPath || left.workspaceName || left.transferSource || left.storagePath).localeCompare(right.scriptPath || right.workspaceName || right.transferSource || right.storagePath, locale);
				if (sort === 'size') return right.sizeBytes - left.sizeBytes || right.modifiedAt - left.modifiedAt;
				return right.modifiedAt - left.modifiedAt || left.storagePath.localeCompare(right.storagePath);
			});
		};
		function updateSelection(visible) {
			const availablePaths = new Set(state.entries.map(entry => entry.storagePath));
			for (const storagePath of [...state.selected]) if (!availablePaths.has(storagePath)) state.selected.delete(storagePath);
			const selectedVisible = visible.filter(entry => state.selected.has(entry.storagePath)).length;
			const selectAll = byId('select-all');
			selectAll.checked = visible.length > 0 && selectedVisible === visible.length;
			selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
			const button = byId('delete-selected');
			button.disabled = state.deleting || state.selected.size === 0;
			button.textContent = state.selected.size > 0 ? formatText(text.deleteSelectedCount, { count: formatNumber(state.selected.size) }) : text.deleteSelected;
		}
		function addAction(container, label, action, entry, disabled) {
			const button = create('button', 'secondary', label);
			button.title = label;
			button.disabled = Boolean(disabled) || state.deleting;
			button.addEventListener('click', () => vscode.postMessage({ command: action, storagePath: entry.storagePath }));
			container.appendChild(button);
		}
		function appendDetailedValue(cell, className, value, detail = value) {
			const element = create('div', className + ' detail-value', value);
			element.title = detail;
			cell.appendChild(element);
		}
		function appendScriptDetails(cell, entry) {
			appendDetailedValue(cell, 'primary-text', entry.scriptPath || text.unidentifiedScript);
			appendDetailedValue(cell, 'secondary-text', entry.storagePath);
			if (entry.labelPreview && entry.labelPreview.length) {
				appendDetailedValue(cell, 'preview', entry.labelPreview.join(' · '), entry.labelPreview.join(String.fromCharCode(10)));
			}
		}
		function appendWorkspaceDetails(cell, entry) {
			appendDetailedValue(cell, 'primary-text', formatText(text.workspace, { value: entry.workspaceName || text.unknown }));
			appendDetailedValue(cell, 'secondary-text', formatText(text.pathHash, { value: entry.workspacePathHash || text.unknown }));
			appendDetailedValue(cell, 'secondary-text', entry.storagePath);
			const paths = entry.orderedPaths || [];
			if (paths.length) {
				const preview = paths.slice(0, 8).join(' · ') + (paths.length > 8 ? formatText(text.additionalRecords, { count: formatNumber(paths.length - 8) }) : '');
				appendDetailedValue(cell, 'preview', preview, paths.join(String.fromCharCode(10)));
			}
		}
		function appendTransferDetails(cell, entry) {
			appendDetailedValue(cell, 'primary-text', text.transferJournal);
			appendDetailedValue(cell, 'secondary-text', formatText(text.source, { value: entry.transferSource || text.unknown }));
			appendDetailedValue(cell, 'secondary-text', formatText(text.target, { value: entry.transferTarget || text.unknown }));
			appendDetailedValue(cell, 'secondary-text', entry.storagePath);
		}
		function appendExchangeDetails(cell, entry) {
			appendDetailedValue(cell, 'primary-text', text.portableExchangeRecord);
			appendDetailedValue(cell, 'secondary-text', formatText(text.exchangeIdentity, { value: entry.exchangeId || text.unknown }));
			appendDetailedValue(cell, 'secondary-text', formatText(text.exchangeScope, { value: entry.exchangeScope || text.unknown }));
			appendDetailedValue(cell, 'secondary-text', formatText(text.exchangeRevision, { value: entry.exchangeRevisionId || text.unknown }));
			appendDetailedValue(cell, 'secondary-text', entry.storagePath);
		}
		function appendTemporaryArtifactDetails(cell, entry) {
			appendDetailedValue(cell, 'primary-text', text.batchRenameTemporary);
			appendDetailedValue(cell, 'secondary-text', formatText(text.workspace, { value: entry.workspaceName || text.unknown }));
			appendDetailedValue(cell, 'secondary-text', entry.storagePath);
			if (entry.labelPreview && entry.labelPreview.length) appendDetailedValue(cell, 'preview', entry.labelPreview.join(' · '), entry.labelPreview.join(String.fromCharCode(10)));
		}
		function appendContentSummary(cell, entry) {
			if (entry.kind === 'workspaceLayout') {
				appendDetailedValue(cell, 'count', formatText(text.workspaceLayoutPurpose, {
					nodes: formatNumber(entry.layoutNodeCount), relations: formatNumber(entry.layoutCrossFileRelationCount), hidden: formatNumber(entry.layoutHiddenFileCount),
				}));
				appendDetailedValue(cell, 'levels', formatText(text.workspaceExpansionPurpose, {
					expanded: formatNumber(entry.layoutExpandedNodeCount), collapsed: formatNumber(entry.layoutCollapsedNodeCount),
				}));
				if (entry.layoutPinnedContainer) appendDetailedValue(cell, 'levels', formatText(text.pinnedContainer, { value: entry.layoutPinnedContainer }));
				return;
			}
			if (entry.kind === 'workspaceOrder') {
				appendDetailedValue(cell, 'count', formatText(text.orderedPaths, { count: formatNumber((entry.orderedPaths || []).length) }));
				appendDetailedValue(cell, 'levels', text.workspaceOrderPurpose);
				return;
			}
			if (entry.kind === 'transferJournal') {
				appendDetailedValue(cell, 'count', formatText(text.transferState, { status: transferStatusLabel(entry.transferStatus) }));
				appendDetailedValue(cell, 'levels', formatText(text.transferCounts, { copied: formatNumber(entry.transferCopiedFiles), merged: formatNumber(entry.transferMergedFiles), conflicts: formatNumber(entry.transferConflictFiles) }));
				return;
			}
			if (entry.kind === 'portableExchange') {
				appendDetailedValue(cell, 'count', formatText(text.exchangeMappings, {
					scripts: formatNumber(entry.exchangeScriptMappingCount), bookmarks: formatNumber(entry.exchangeBookmarkMappingCount), bases: formatNumber(entry.exchangeBaseScriptCount),
				}));
				appendDetailedValue(cell, 'levels', text.exchangePurpose);
				return;
			}
			if (entry.kind === 'temporaryArtifact') {
				appendDetailedValue(cell, 'count', text.batchRenameTemporary);
				appendDetailedValue(cell, 'levels', text.temporaryDraftPurpose);
				return;
			}
			appendDetailedValue(cell, 'count', formatText(text.totalBookmarks, { count: formatNumber(entry.bookmarkSummary.total) }));
			appendDetailedValue(cell, 'levels', levelSummary(entry));
			const auxiliary = [];
			if (entry.automaticBookmarkCount) auxiliary.push(formatText(text.automaticBookmarks, { count: formatNumber(entry.automaticBookmarkCount) }));
			if (entry.invalidBookmarkCount) auxiliary.push(formatText(text.invalidBookmarks, { count: formatNumber(entry.invalidBookmarkCount) }));
			if (auxiliary.length) appendDetailedValue(cell, 'aux-counts', auxiliary.join(' · '));
		}
		function renderRow(entry) {
			const row = document.createElement('tr');
			const selectCell = document.createElement('td');
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox'; checkbox.checked = state.selected.has(entry.storagePath); checkbox.setAttribute('aria-label', formatText(text.selectRecord, { path: entry.storagePath }));
			checkbox.addEventListener('change', () => { checkbox.checked ? state.selected.add(entry.storagePath) : state.selected.delete(entry.storagePath); render(); });
			selectCell.appendChild(checkbox); row.appendChild(selectCell);
			const scriptCell = document.createElement('td');
			if (entry.kind === 'workspaceOrder' || entry.kind === 'workspaceLayout') appendWorkspaceDetails(scriptCell, entry);
			else if (entry.kind === 'portableExchange') appendExchangeDetails(scriptCell, entry);
			else if (entry.kind === 'transferJournal') appendTransferDetails(scriptCell, entry);
			else if (entry.kind === 'temporaryArtifact') appendTemporaryArtifactDetails(scriptCell, entry);
			else appendScriptDetails(scriptCell, entry);
			if (entry.problem) appendDetailedValue(scriptCell, 'preview', entry.problem);
			row.appendChild(scriptCell);
			const statusCell = document.createElement('td');
			const statusLine = create('div', 'status-line'); statusLine.dataset.health = entry.health;
			statusLine.appendChild(create('span', 'status-dot')); statusLine.appendChild(create('span', '', healthLabels[entry.health] || entry.health));
			statusLine.title = healthLabels[entry.health] || entry.health;
			statusCell.appendChild(statusLine); appendDetailedValue(statusCell, 'role', roleLabels[entry.role] || entry.role); row.appendChild(statusCell);
			const countCell = document.createElement('td');
			appendContentSummary(countCell, entry);
			row.appendChild(countCell);
			const infoCell = document.createElement('td');
			if (entry.kind === 'script') appendDetailedValue(infoCell, 'time-line', formatText(text.bindingUpdated, { date: formatDate(entry.lastSeenAt) }));
			else if (entry.kind === 'transferJournal') {
				appendDetailedValue(infoCell, 'time-line', formatText(text.transferStarted, { date: formatDate(entry.transferStartedAt) }));
				appendDetailedValue(infoCell, 'time-line', formatText(text.transferCompleted, { date: formatDate(entry.transferCompletedAt) }));
			} else if (entry.kind === 'portableExchange') appendDetailedValue(infoCell, 'time-line', formatText(text.exchangeUpdated, { date: formatDate(entry.exchangeUpdatedAt) }));
			else appendDetailedValue(infoCell, 'time-line', formatText(text.recordType, { type: roleLabels[entry.role] || entry.role }));
			appendDetailedValue(infoCell, 'time-line', formatText(text.fileModified, { date: formatDate(entry.modifiedAt) }));
			appendDetailedValue(infoCell, 'time-line', formatText(text.size, { size: formatSize(entry.sizeBytes) }));
			row.appendChild(infoCell);
			const actionCell = document.createElement('td'); const actions = create('div', 'actions');
			if (entry.kind === 'script') addAction(actions, text.openScript, 'openSource', entry, !entry.sourceExists);
			else actions.classList.add('record-actions');
			addAction(actions, text.revealFile, 'revealConfiguration', entry, false);
			const deleteButton = create('button', 'danger delete-action', entry.kind === 'script' ? text.deleteConfiguration : text.cleanRecord); deleteButton.disabled = state.deleting; deleteButton.title = deleteButton.textContent;
			deleteButton.addEventListener('click', () => openDeleteConfirmation([entry.storagePath])); actions.appendChild(deleteButton);
			actionCell.appendChild(actions); row.appendChild(actionCell);
			return row;
		}
		function render() {
			const entries = visibleEntries();
			const displayedEntries = entries.slice(0, state.visibleLimit);
			const rows = byId('rows'); rows.replaceChildren();
			if (state.loading) {
				const row = document.createElement('tr'); const cell = create('td', 'empty', text.readingRecords); cell.colSpan = 6; row.appendChild(cell); rows.appendChild(row);
			} else if (entries.length === 0) {
				const row = document.createElement('tr'); const cell = create('td', 'empty', text.emptyRecords); cell.colSpan = 6; row.appendChild(cell); rows.appendChild(row);
			} else displayedEntries.forEach(entry => rows.appendChild(renderRow(entry)));
			byId('result-count').textContent = entries.length === state.entries.length
				? formatText(text.resultAll, { shown: formatNumber(displayedEntries.length), total: formatNumber(state.entries.length) })
				: formatText(text.resultFiltered, { shown: formatNumber(displayedEntries.length), matched: formatNumber(entries.length), total: formatNumber(state.entries.length) });
			byId('pagination').hidden = state.loading || displayedEntries.length >= entries.length;
			updateSelection(entries);
		}
		function updateMetrics() {
			const snapshots = state.entries.filter(entry => ['backup', 'conflict', 'superseded'].includes(entry.role)).length;
			const attention = state.entries.filter(entry => ['missing', 'invalid'].includes(entry.health)).length;
			byId('metric-files').textContent = formatNumber(state.entries.length);
			byId('metric-bookmarks').textContent = formatNumber(state.entries.filter(entry => entry.kind === 'script').reduce((sum, entry) => sum + entry.bookmarkSummary.total, 0));
			byId('metric-bound').textContent = formatNumber(state.entries.filter(entry => entry.health === 'bound').length);
			byId('metric-snapshots').textContent = formatNumber(snapshots);
			byId('metric-workspace-data').textContent = formatNumber(state.entries.filter(isCurrentWorkspaceData).length);
			byId('metric-attention').textContent = formatNumber(attention);
		}
		const resetAndRender = () => { state.visibleLimit = PAGE_SIZE; render(); };
		const dropdowns = [];
		function closeDropdown(dropdown, restoreFocus = false) {
			if (!dropdown) return;
			dropdown.root.classList.remove('open'); dropdown.menu.hidden = true;
			dropdown.trigger.setAttribute('aria-expanded', 'false'); dropdown.trigger.removeAttribute('aria-activedescendant');
			if (restoreFocus) dropdown.trigger.focus();
		}
		function setDropdownActive(dropdown, index) {
			dropdown.activeIndex = Math.max(0, Math.min(index, dropdown.options.length - 1));
			dropdown.options.forEach((option, optionIndex) => option.classList.toggle('active', optionIndex === dropdown.activeIndex));
			const active = dropdown.options[dropdown.activeIndex];
			dropdown.trigger.setAttribute('aria-activedescendant', active.id); active.scrollIntoView({ block: 'nearest' });
		}
		function openDropdown(dropdown) {
			for (const other of dropdowns) if (other !== dropdown) closeDropdown(other);
			dropdown.root.classList.add('open'); dropdown.menu.hidden = false; dropdown.trigger.setAttribute('aria-expanded', 'true');
			const selectedIndex = dropdown.options.findIndex(option => option.dataset.value === dropdown.root.dataset.value);
			setDropdownActive(dropdown, selectedIndex >= 0 ? selectedIndex : 0);
		}
		function selectDropdownOption(dropdown, option) {
			dropdown.root.dataset.value = option.dataset.value;
			dropdown.label.textContent = option.textContent;
			dropdown.options.forEach(candidate => candidate.setAttribute('aria-selected', String(candidate === option)));
			closeDropdown(dropdown, true); resetAndRender();
		}
		function setupDropdown(id) {
			const root = byId(id); const trigger = root.querySelector('.dropdown-trigger'); const menu = root.querySelector('.dropdown-menu');
			const dropdown = { root, trigger, menu, label: root.querySelector('.dropdown-label'), options: [...root.querySelectorAll('.dropdown-option')], activeIndex: 0 };
			dropdowns.push(dropdown);
			trigger.addEventListener('click', () => menu.hidden ? openDropdown(dropdown) : closeDropdown(dropdown));
			trigger.addEventListener('keydown', event => {
				if (menu.hidden && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); openDropdown(dropdown); return; }
				if (menu.hidden) return;
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setDropdownActive(dropdown, dropdown.activeIndex + (event.key === 'ArrowDown' ? 1 : -1)); }
				else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); setDropdownActive(dropdown, event.key === 'Home' ? 0 : dropdown.options.length - 1); }
				else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectDropdownOption(dropdown, dropdown.options[dropdown.activeIndex]); }
				else if (event.key === 'Escape') { event.preventDefault(); closeDropdown(dropdown, true); }
				else if (event.key === 'Tab') closeDropdown(dropdown);
			});
			dropdown.options.forEach((option, index) => {
				option.tabIndex = -1;
				option.addEventListener('mouseenter', () => setDropdownActive(dropdown, index));
				option.addEventListener('click', () => selectDropdownOption(dropdown, option));
			});
		}
		setupDropdown('filter'); setupDropdown('sort');
		document.addEventListener('pointerdown', event => {
			for (const dropdown of dropdowns) if (!dropdown.root.contains(event.target)) closeDropdown(dropdown);
		});
		byId('search').addEventListener('input', resetAndRender);
		byId('refresh').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
		byId('storage-root').addEventListener('click', () => vscode.postMessage({ command: 'openStorageRoot' }));
		byId('show-more').addEventListener('click', () => { state.visibleLimit += PAGE_SIZE; render(); });
		byId('delete-selected').addEventListener('click', () => openDeleteConfirmation([...state.selected]));
		byId('cancel-delete').addEventListener('click', () => closeDeleteConfirmation(true));
		byId('confirm-delete').addEventListener('click', confirmDelete);
		byId('delete-confirmation').addEventListener('pointerdown', event => { if (event.target === event.currentTarget) closeDeleteConfirmation(true); });
		byId('delete-confirmation').addEventListener('keydown', event => {
			if (event.key === 'Escape') { event.preventDefault(); closeDeleteConfirmation(true); return; }
			if (event.key !== 'Tab') return;
			const focusable = [...byId('delete-confirmation').querySelectorAll('button:not(:disabled)')];
			if (focusable.length === 0) return;
			const first = focusable[0]; const last = focusable[focusable.length - 1];
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
		});
		byId('select-all').addEventListener('change', event => {
			const entries = visibleEntries();
			for (const entry of entries) event.target.checked ? state.selected.add(entry.storagePath) : state.selected.delete(entry.storagePath);
			render();
		});
		window.addEventListener('message', event => {
			const message = event.data;
			if (!message || typeof message.type !== 'string') return;
			if (message.type === 'loading') { state.loading = true; render(); return; }
			if (message.type === 'operationStarted') { state.deleting = true; render(); return; }
			if (message.type === 'operationComplete') { state.deleting = false; render(); return; }
			if (message.type === 'loadError') {
				state.loading = false; state.deleting = false; state.entries = []; updateMetrics();
				byId('pagination').hidden = true;
				const rows = byId('rows'); rows.replaceChildren(); const row = document.createElement('tr'); const cell = create('td', 'error', formatText(text.loadFailed, { message: message.message })); cell.colSpan = 6; row.appendChild(cell); rows.appendChild(row); return;
			}
			if (message.type === 'state' && Array.isArray(message.entries)) {
				state.loading = false; state.deleting = false; state.entries = message.entries; state.visibleLimit = PAGE_SIZE;
				const storageRoot = byId('storage-root');
				storageRoot.textContent = formatText(text.storageFolder, { path: message.storageRoot });
				storageRoot.title = formatText(text.revealStorageFolder, { path: message.storageRoot });
				storageRoot.disabled = false;
				updateMetrics(); render();
			}
		});
		vscode.postMessage({ command: 'ready' });
	</script>
</body>
</html>`
	}
}
