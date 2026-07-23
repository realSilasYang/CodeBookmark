/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `BookmarkIdleViewCoordinator`。
 *
 * 实现要点：协调多个端口、状态与异步阶段，明确事件顺序、取消点和最终提交时机。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`BookmarkIdleViewCoordinator`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
