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
