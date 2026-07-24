/**
 * 在语言扩展安装、卸载或启停后重新加载语法高亮与注释规则。
 * 规则变化后重新扫描当前范围，使自动标记只跟随此刻真正受 VS Code 识别的语言。
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
