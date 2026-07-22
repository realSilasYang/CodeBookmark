type TreeLifecycleTimer = ReturnType<typeof setTimeout>

interface BookmarkTreeViewLifecycleScheduling {
	setTimer(callback: () => void, delay: number): TreeLifecycleTimer
	clearTimer(timer: TreeLifecycleTimer): void
}

export interface BookmarkTreeViewLifecyclePort<TreeView, Editor, Node, BookmarkState> {
	isDisposed(): boolean
	currentTreeView(): TreeView | undefined
	setLoadingMessage(treeView: TreeView): void
	reportSlowInitialLoad(warningMs: number): void
	setSlowLoadingMessage(treeView: TreeView): void
	clearInitialLoadMessage(treeView: TreeView): void
	reportInitialLoadFailure(error: unknown): void
	setInitialLoadFailureMessage(treeView: TreeView): void
	isWorkspaceScope(): boolean
	currentViewLoadGeneration(): number
	treeVisible(): boolean
	bookmarkPathForEditor(editor: Editor): string
	hasFileNode(bookmarkPath: string): boolean
	fileNode(bookmarkPath: string): Node | undefined
	activeEditorMatches(editor: Editor): boolean
	treeViewAvailable(): boolean
	currentBookmarkState(): BookmarkState
	findBookmark(bookmark: Node): Node | undefined
	revealNode(node: Node): void
}

const defaultScheduling: BookmarkTreeViewLifecycleScheduling = {
	setTimer: (callback, delay) => setTimeout(callback, delay),
	clearTimer: timer => clearTimeout(timer),
}

export class BookmarkTreeViewLifecycle<TreeView, Editor, Node, BookmarkState> {
	private initialLoadWatchdog: TreeLifecycleTimer | undefined
	private initialLoadSettled = false
	private revealGeneration = 0
	private pendingPopulation: {
		generation: number
		resolve: () => void
		timeout: TreeLifecycleTimer
	} | undefined

	constructor(
		private readonly scheduling: BookmarkTreeViewLifecycleScheduling = defaultScheduling,
		private readonly initialLoadWarningMs = 8_000,
		private readonly populationTimeoutMs = 1_500,
		private readonly activeFileRevealDelayMs = 10,
		private readonly pinnedBookmarkRevealDelayMs = 50,
	) {}

	startInitialLoad(
		treeView: TreeView,
		port: BookmarkTreeViewLifecyclePort<TreeView, Editor, Node, BookmarkState>,
	): void {
		port.setLoadingMessage(treeView)
		this.initialLoadWatchdog = this.scheduling.setTimer(() => {
			if (port.isDisposed() || this.initialLoadSettled) return
			port.reportSlowInitialLoad(this.initialLoadWarningMs)
			if (port.currentTreeView() === treeView) port.setSlowLoadingMessage(treeView)
		}, this.initialLoadWarningMs)
	}

	finishInitialLoad(
		error: unknown,
		port: BookmarkTreeViewLifecyclePort<TreeView, Editor, Node, BookmarkState>,
	): void {
		if (this.initialLoadSettled) return
		this.initialLoadSettled = true
		if (this.initialLoadWatchdog) this.scheduling.clearTimer(this.initialLoadWatchdog)
		this.initialLoadWatchdog = undefined
		const treeView = port.currentTreeView()
		if (port.isDisposed() || !treeView) return
		if (error === undefined) {
			port.clearInitialLoadMessage(treeView)
			return
		}
		port.reportInitialLoadFailure(error)
		port.setInitialLoadFailureMessage(treeView)
	}

	waitForPopulation(generation: number): Promise<void> {
		this.resolvePopulation()
		return new Promise<void>(resolve => {
			const timeout = this.scheduling.setTimer(
				() => this.resolvePopulation(generation),
				this.populationTimeoutMs,
			)
			this.pendingPopulation = { generation, resolve, timeout }
		})
	}

	resolvePopulation(generation?: number): void {
		const pending = this.pendingPopulation
		if (!pending || (generation !== undefined && pending.generation !== generation)) return
		this.scheduling.clearTimer(pending.timeout)
		this.pendingPopulation = undefined
		pending.resolve()
	}

	nextRevealGeneration(): number {
		return ++this.revealGeneration
	}

	scheduleActiveFileReveal(
		editor: Editor,
		viewGeneration: number,
		revealGeneration: number,
		port: BookmarkTreeViewLifecyclePort<TreeView, Editor, Node, BookmarkState>,
	): void {
		if (!port.isWorkspaceScope()) return
		const bookmarkPath = port.bookmarkPathForEditor(editor)
		if (!port.hasFileNode(bookmarkPath) || !port.treeVisible()) return
		this.scheduling.setTimer(() => {
			if (port.isDisposed()
				|| viewGeneration !== port.currentViewLoadGeneration()
				|| revealGeneration !== this.revealGeneration
				|| !port.treeVisible()
				|| !port.activeEditorMatches(editor)) return
			const fileNode = port.fileNode(bookmarkPath)
			if (!fileNode) return
			try {
				port.revealNode(fileNode)
			} catch {}
		}, this.activeFileRevealDelayMs)
	}

	schedulePinnedBookmarkReveal(
		bookmark: Node,
		port: BookmarkTreeViewLifecyclePort<TreeView, Editor, Node, BookmarkState>,
	): void {
		if (!port.treeViewAvailable()) return
		const viewGeneration = port.currentViewLoadGeneration()
		const revealGeneration = this.revealGeneration
		const bookmarkState = port.currentBookmarkState()
		this.scheduling.setTimer(() => {
			if (port.isDisposed()
				|| viewGeneration !== port.currentViewLoadGeneration()
				|| revealGeneration !== this.revealGeneration
				|| bookmarkState !== port.currentBookmarkState()) return
			const currentBookmark = port.findBookmark(bookmark)
			if (!currentBookmark) return
			try {
				port.revealNode(currentBookmark)
			} catch {}
		}, this.pinnedBookmarkRevealDelayMs)
	}

	dispose(): void {
		this.resolvePopulation()
		this.revealGeneration++
		if (this.initialLoadWatchdog) this.scheduling.clearTimer(this.initialLoadWatchdog)
		this.initialLoadWatchdog = undefined
	}
}
