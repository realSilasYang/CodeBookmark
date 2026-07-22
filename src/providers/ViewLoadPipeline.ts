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
