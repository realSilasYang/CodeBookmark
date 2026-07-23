/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `BackgroundEnhancementRunner`。
 *
 * 实现要点：执行一次边界清晰的工作流，通过端口注入副作用以便独立验证每条分支。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`runBackgroundEnhancements`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
interface BackgroundEnhancementPort {
	isCurrent(scope: string | undefined, generation: number): boolean
	setupCodeMarkerFileWatchers(): void
	synchronizeOpenCodeMarkerDocuments(): Promise<void>
	scheduleWorkspaceCodeMarkerScan(): void
	reportFailure(error: unknown): void
	measure(startedAt: number, scope: string | undefined): void
}

export async function runBackgroundEnhancements(
	languageProfilesReady: Promise<void>,
	scope: string | undefined,
	generation: number,
	startedAt: number,
	port: BackgroundEnhancementPort,
): Promise<void> {
	try {
		await languageProfilesReady
		if (!port.isCurrent(scope, generation)) return
		port.setupCodeMarkerFileWatchers()
		await port.synchronizeOpenCodeMarkerDocuments()
		if (!port.isCurrent(scope, generation)) return
		port.scheduleWorkspaceCodeMarkerScan()
	} catch (error) {
		port.reportFailure(error)
	} finally {
		port.measure(startedAt, scope)
	}
}
