/**
 * 持有至多一个可释放资源，适合状态栏消息等“新值覆盖旧值”的短生命周期对象。
 * 替换时先释放旧资源，最终 dispose 可重复调用，不把清理责任泄漏给业务流程。
 */
interface DisposableResource {
	dispose(): void
}

export class ReplaceableDisposable<Resource extends DisposableResource> implements DisposableResource {
	private current: Resource | undefined

	replace(resource: Resource): void {
		this.current?.dispose()
		this.current = resource
	}

	dispose(): void {
		this.current?.dispose()
		this.current = undefined
	}
}
