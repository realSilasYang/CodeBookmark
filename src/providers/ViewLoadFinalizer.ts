/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `ViewLoadFinalizer`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`finalizeViewLoad`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
