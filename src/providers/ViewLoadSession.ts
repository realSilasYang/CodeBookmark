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
