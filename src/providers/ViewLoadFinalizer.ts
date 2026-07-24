/**
 * 收尾一次视图加载：处理成功、取消和失败状态，并保证加载上下文键最终恢复。
 * 只有当前会话可以发布错误或结束状态，旧会话的 finally 不会关闭新一轮加载提示。
 */
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
	persistWorkspaceOrder(prepared: Prepared, generation: number): Promise<void>
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
	} catch (error) {
		port.reportContextFailure(error)
	}

	port.refreshDecorations()
	if (prepared?.contentUpdated) port.saveAllBookmarks()
	if (prepared) await port.persistWorkspaceOrder(prepared, generation)
	try {
		await port.setLoadedContext()
	} catch (error) {
		port.reportContextFailure(error)
	}

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
