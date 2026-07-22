import type * as vscode from 'vscode'

type RefreshTimer = ReturnType<typeof setTimeout>

interface BookmarkViewRefreshScheduling {
	setTimer(callback: () => void, delay: number): RefreshTimer
	clearTimer(timer: RefreshTimer): void
}

export interface BookmarkViewRefreshPort {
	currentStorageScope(): string | undefined
	currentScopeFilePath(): string | undefined
	setCurrentScopeFilePath(filePath: string): void
	workspaceRoot(): string | undefined
	nextRevealGeneration(): number
	beginViewLoad(): number
	currentViewLoadGeneration(): number
	loadingViewGeneration(): number | undefined
	clearLoading(): void
	markLoading(generation: number): void
	resetCodeMarkerScan(): void
	queueBookmarkPresenceContexts(): Promise<void>
	restoreConfigWatcher(generation: number): void
	restoreBackgroundEnhancements(generation: number): void
	scheduleActiveFileReveal(editor: vscode.TextEditor, viewGeneration: number, revealGeneration: number): void
	initView(scopePath: string | undefined, generation: number, storageScope: string): Promise<void>
	isCurrent(generation: number, storageScope: string): boolean
	treeVisible(): boolean
	reportRefreshFailure(error: unknown): void
}

const defaultScheduling: BookmarkViewRefreshScheduling = {
	setTimer: (callback, delay) => setTimeout(callback, delay),
	clearTimer: timer => clearTimeout(timer),
}

export class BookmarkViewRefreshCoordinator {
	private refreshTimer: RefreshTimer | undefined
	private resolveScheduledRefresh: (() => void) | undefined

	constructor(private readonly scheduling: BookmarkViewRefreshScheduling = defaultScheduling) {}

	private cancelScheduledRefresh(): void {
		if (this.refreshTimer) this.scheduling.clearTimer(this.refreshTimer)
		this.refreshTimer = undefined
		this.resolveScheduledRefresh?.()
		this.resolveScheduledRefresh = undefined
	}

	async refresh(
		editor: vscode.TextEditor | undefined,
		storageScope: string,
		forceReloadDisk: boolean,
		port: BookmarkViewRefreshPort,
	): Promise<void> {
		const revealGeneration = port.nextRevealGeneration()
		const editorPath = editor?.document.uri.scheme === 'file' ? editor.document.uri.fsPath : undefined
		const scopePath = editorPath
			?? (storageScope === port.currentStorageScope() ? port.currentScopeFilePath() : undefined)
			?? (storageScope.startsWith('workspace:') ? port.workspaceRoot() : undefined)

		if (!forceReloadDisk && port.currentStorageScope() === storageScope) {
			let cancelledLoad = false
			if (this.refreshTimer || port.loadingViewGeneration() !== undefined) {
				port.beginViewLoad()
				port.clearLoading()
				cancelledLoad = true
			}
			this.cancelScheduledRefresh()
			if (editorPath) port.setCurrentScopeFilePath(editorPath)
			await port.queueBookmarkPresenceContexts()
			if (cancelledLoad) {
				const generation = port.currentViewLoadGeneration()
				port.restoreConfigWatcher(generation)
				port.restoreBackgroundEnhancements(generation)
			}
			if (editor) {
				const generation = port.currentViewLoadGeneration()
				port.scheduleActiveFileReveal(editor, generation, revealGeneration)
			}
			return
		}

		const generation = port.beginViewLoad()
		port.markLoading(generation)
		port.resetCodeMarkerScan()
		this.cancelScheduledRefresh()
		await new Promise<void>(resolve => {
			this.resolveScheduledRefresh = resolve
			this.refreshTimer = this.scheduling.setTimer(() => {
				this.refreshTimer = undefined
				this.resolveScheduledRefresh = undefined
				void port.initView(scopePath, generation, storageScope).then(() => {
					if (!port.isCurrent(generation, storageScope)) return
					if (storageScope.startsWith('workspace:') && editor && port.treeVisible()) {
						port.scheduleActiveFileReveal(editor, generation, revealGeneration)
					}
				}).catch(error => port.reportRefreshFailure(error)).finally(resolve)
			}, 100)
		})
	}

	dispose(): void {
		this.cancelScheduledRefresh()
	}
}
