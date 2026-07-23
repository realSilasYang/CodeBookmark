/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `ViewLoadPipeline`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`runViewLoadPipeline`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
interface ViewLoadPipelinePort<Prepared, Transition> {
	isCurrent(): boolean
	enqueue<T>(operation: () => Promise<T>): Promise<T | undefined>
	ensureStorageRoot(): Promise<boolean>
	prepare(): Promise<Prepared>
	empty(): Prepared
	commit(prepared: Prepared): Transition
	publish(transition: Transition, generation: number): Promise<void>
	reportFailure(error: Error): void
}

interface ViewLoadPipelineResult<Prepared, Transition> {
	cancelled: boolean
	storageReady: boolean
	prepared?: Prepared
	transition?: Transition
	loadFailure?: Error
}

export async function runViewLoadPipeline<Prepared, Transition>(
	generation: number,
	port: ViewLoadPipelinePort<Prepared, Transition>,
): Promise<ViewLoadPipelineResult<Prepared, Transition>> {
	let storageReady = false
	let prepared: Prepared | undefined
	let transition: Transition | undefined
	let loadFailure: Error | undefined
	try {
		const preparation = await port.enqueue(async () => {
			const ready = await port.ensureStorageRoot()
			if (!port.isCurrent()) return undefined
			const next = ready ? await port.prepare() : port.empty()
			return { ready, next }
		})
		if (!preparation) return { cancelled: true, storageReady: false }
		storageReady = preparation.ready
		prepared = preparation.next
		if (!port.isCurrent()) return { cancelled: true, storageReady, prepared }
		transition = port.commit(prepared)
		await port.publish(transition, generation)
	} catch (error) {
		loadFailure = error instanceof Error ? error : new Error(String(error))
		port.reportFailure(loadFailure)
	}
	if (!port.isCurrent()) return { cancelled: true, storageReady, prepared, transition, loadFailure }
	return { cancelled: false, storageReady, prepared, transition, loadFailure }
}
