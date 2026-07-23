/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `CodeMarkerLanguageReloadRunner`。
 *
 * 实现要点：执行一次边界清晰的工作流，通过端口注入副作用以便独立验证每条分支。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`reloadCodeMarkerLanguageProfiles`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
interface CodeMarkerLanguageReloadPort {
	reloadLanguageProfiles(): Promise<void>
	isCurrent(): boolean
	setupFileWatchers(): void
	resetWorkspaceScanScope(): void
	synchronizeOpenDocuments(): Promise<void>
	scheduleWorkspaceScan(): void
}

export async function reloadCodeMarkerLanguageProfiles(port: CodeMarkerLanguageReloadPort): Promise<void> {
	await port.reloadLanguageProfiles()
	if (!port.isCurrent()) return
	port.setupFileWatchers()
	port.resetWorkspaceScanScope()
	await port.synchronizeOpenDocuments()
	port.scheduleWorkspaceScan()
}
