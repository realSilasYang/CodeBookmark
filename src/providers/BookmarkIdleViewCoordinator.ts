interface BookmarkIdleViewPort {
	hasActiveFileEditor(): boolean
	hasOpenFileTab(): boolean
	workspaceRoot(): string | undefined
	workspaceScope(workspaceRoot: string): string
	currentStorageScope(): string | undefined
	currentScopeFilePath(): string | undefined
	currentBookmarkCount(): number
	refresh(storageScope: string, forceReloadDisk: boolean): Promise<void>
	queuePresenceContexts(): Promise<void>
}

export class BookmarkIdleViewCoordinator {
	async handle(port: BookmarkIdleViewPort): Promise<void> {
		if (port.hasActiveFileEditor()) return

		const workspaceRoot = port.workspaceRoot()
		if (workspaceRoot) {
			await port.refresh(port.workspaceScope(workspaceRoot), false)
			return
		}

		if (port.hasOpenFileTab()) return
		if (port.currentStorageScope() === 'global'
			&& port.currentScopeFilePath() === undefined
			&& port.currentBookmarkCount() === 0) {
			await port.queuePresenceContexts()
			return
		}

		await port.refresh('global', true)
	}
}
