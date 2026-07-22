interface FinalizablePreparedView {
	contentUpdated: boolean
}

interface ViewLoadFinalization<Prepared extends FinalizablePreparedView, Transition extends object> {
	generation: number
	preserveLoadedContext: boolean
	initializationStartedAt: number
	storageReady: boolean
	prepared?: Prepared
	transition?: Transition
	loadFailure?: Error
}

interface ViewLoadFinalizerPort<Prepared> {
	isCurrent(generation: number): boolean
	setLoadFailedContext(failed: boolean): Promise<void>
	setLoadedContext(): Promise<void>
	reportContextFailure(error: unknown): void
	refreshDecorations(): void
	saveAllBookmarks(): void
	persistWorkspaceOrder(prepared: Prepared, generation: number): void
	startConfigWatcher(generation: number): void
	startBackgroundEnhancements(generation: number): void
	closeConfigWatchers(): void
	finishLoading(generation: number): void
	measure(initializationStartedAt: number, failed: boolean): void
	finishInitialLoad(error?: Error): void
}

export async function finalizeViewLoad<Prepared extends FinalizablePreparedView, Transition extends object>(
	state: ViewLoadFinalization<Prepared, Transition>,
	port: ViewLoadFinalizerPort<Prepared>,
): Promise<void> {
	const {
		generation,
		preserveLoadedContext,
		initializationStartedAt,
		storageReady,
		prepared,
		transition,
		loadFailure,
	} = state
	if (!port.isCurrent(generation)) return

	try {
		await port.setLoadFailedContext(loadFailure !== undefined && !preserveLoadedContext)
		await port.setLoadedContext()
	} catch (error) {
		port.reportContextFailure(error)
	}

	port.refreshDecorations()
	if (prepared?.contentUpdated) port.saveAllBookmarks()
	if (prepared) port.persistWorkspaceOrder(prepared, generation)

	if (transition && storageReady) {
		port.startConfigWatcher(generation)
		port.startBackgroundEnhancements(generation)
	} else if (transition) {
		port.closeConfigWatchers()
	}

	port.finishLoading(generation)
	port.measure(initializationStartedAt, loadFailure !== undefined)

	if (loadFailure) {
		port.finishInitialLoad(loadFailure)
		throw loadFailure
	}
	port.finishInitialLoad()
}
