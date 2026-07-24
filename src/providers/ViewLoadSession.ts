/**
 * 为每次视图加载分配递增身份和 AbortController，用来判断异步结果是否仍属于当前请求。
 * 开始新会话会取消旧会话，但取消本身不修改界面，最终发布由加载管线决定。
 */
export class ViewLoadSession {
	private currentGeneration = 0
	private activeLoadingGeneration: number | undefined
	private abortController = new AbortController()
	private abortGeneration = 0

	get generation(): number {
		return this.currentGeneration
	}

	get loadingGeneration(): number | undefined {
		return this.activeLoadingGeneration
	}

	begin(): number {
		this.abortController.abort()
		const generation = ++this.currentGeneration
		this.abortController = new AbortController()
		this.abortGeneration = generation
		return generation
	}

	signalFor(generation: number): AbortSignal | undefined {
		return generation === this.abortGeneration
			? this.abortController.signal
			: undefined
	}

	markLoading(generation: number): void {
		this.activeLoadingGeneration = generation
	}

	finishLoading(generation: number): void {
		if (this.activeLoadingGeneration === generation) this.activeLoadingGeneration = undefined
	}

	clearLoading(): void {
		this.activeLoadingGeneration = undefined
	}

	dispose(): void {
		this.abortController.abort()
		this.currentGeneration++
		this.abortGeneration = -1
		this.activeLoadingGeneration = undefined
	}
}
