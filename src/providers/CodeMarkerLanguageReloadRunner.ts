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
