/**
 * 在未打开文件夹的单文件模式中，根据活动编辑器决定是否显示或隐藏书签树。
 * 欢迎页和非文件编辑器不会保留上一份脚本的树状态，防止空视图展示陈旧书签。
 */
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
