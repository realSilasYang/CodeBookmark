import { isSameOrDescendantAbsolutePath, normalizedAbsolutePath } from '../util/AbsolutePath'

type CodeMarkerSyncTimer = ReturnType<typeof setTimeout>

interface CodeMarkerSyncScheduling {
	setTimer(callback: () => void, delay: number): CodeMarkerSyncTimer
	clearTimer(timer: CodeMarkerSyncTimer): void
}

interface CodeMarkerSyncDisposable {
	dispose(): void
}

export interface CodeMarkerSyncLifecyclePort<Uri, Disposable extends CodeMarkerSyncDisposable> {
	isFileUri(uri: Uri): boolean
	isExcluded(uri: Uri): boolean
	profilesInitialized(): boolean
	supportsFile(filePath: string): boolean
	filePath(uri: Uri): string
	currentViewGeneration(): number
	isCurrentScope(uri: Uri): boolean
	removeMarkers(uri: Uri): boolean
	persistRemovedMarkers(uri: Uri): void
	synchronizeUris(uris: readonly Uri[]): Promise<void>
	reportFileSyncFailure(uri: Uri, error: unknown): void
	canWatchFiles(): boolean
	discoveryGlobs(): string[]
	watchFilePattern(
		glob: string,
		onCreate: (uri: Uri) => void,
		onChange: (uri: Uri) => void,
		onDelete: (uri: Uri) => void,
	): Disposable[]
	reportWatcherFailure(glob: string, error: unknown): void
	loadingViewGeneration(): number | undefined
	currentStorageScope(): string | undefined
	runWorkspaceScan(scope: string, generation: number): Promise<void>
	reportWorkspaceScanFailure(error: unknown): void
}

const defaultScheduling: CodeMarkerSyncScheduling = {
	setTimer: (callback, delay) => setTimeout(callback, delay),
	clearTimer: timer => clearTimeout(timer),
}

export class CodeMarkerSyncLifecycle<Uri, Disposable extends CodeMarkerSyncDisposable> {
	private readonly fileTimers = new Map<string, CodeMarkerSyncTimer>()
	private watcherDisposables: Disposable[] = []
	private watcherSignature = ''
	private workspaceScanTimer: CodeMarkerSyncTimer | undefined
	private workspaceScanGeneration = 0
	private lastWorkspaceScanScope: string | undefined

	constructor(private readonly scheduling: CodeMarkerSyncScheduling = defaultScheduling) {}

	scheduleFileSync(
		uri: Uri,
		deleted: boolean,
		port: CodeMarkerSyncLifecyclePort<Uri, Disposable>,
	): void {
		if (!port.isFileUri(uri) || port.isExcluded(uri)) return
		const filePath = port.filePath(uri)
		if (!deleted && port.profilesInitialized() && !port.supportsFile(filePath)) return
		const key = normalizedAbsolutePath(filePath)
		const viewGeneration = port.currentViewGeneration()
		const previous = this.fileTimers.get(key)
		if (previous) this.scheduling.clearTimer(previous)
		const timer = this.scheduling.setTimer(() => {
			this.fileTimers.delete(key)
			void (async () => {
				if (viewGeneration !== port.currentViewGeneration()) return
				if (!port.isCurrentScope(uri)) return
				if (deleted) {
					if (port.removeMarkers(uri)) port.persistRemovedMarkers(uri)
					return
				}
				await port.synchronizeUris([uri])
			})().catch(error => port.reportFileSyncFailure(uri, error))
		}, 250)
		this.fileTimers.set(key, timer)
	}

	cancelPath(absolutePath: string): void {
		for (const [key, timer] of this.fileTimers) {
			if (!isSameOrDescendantAbsolutePath(key, absolutePath)) continue
			this.scheduling.clearTimer(timer)
			this.fileTimers.delete(key)
		}
	}

	setupFileWatchers(port: CodeMarkerSyncLifecyclePort<Uri, Disposable>): void {
		if (!port.canWatchFiles()) return
		const globs = port.discoveryGlobs()
		const signature = globs.join('\0')
		if (signature === this.watcherSignature && this.watcherDisposables.length > 0) return
		this.disposeFileWatchers()
		this.watcherSignature = signature
		for (const glob of globs) {
			try {
				this.watcherDisposables.push(...port.watchFilePattern(
					glob,
					uri => this.scheduleFileSync(uri, false, port),
					uri => this.scheduleFileSync(uri, false, port),
					uri => this.scheduleFileSync(uri, true, port),
				))
			} catch (error) {
				port.reportWatcherFailure(glob, error)
			}
		}
	}

	private disposeFileWatchers(): void {
		for (const disposable of this.watcherDisposables) disposable.dispose()
		this.watcherDisposables = []
		this.watcherSignature = ''
	}

	scheduleWorkspaceScan(port: CodeMarkerSyncLifecyclePort<Uri, Disposable>): void {
		if (this.workspaceScanTimer) this.scheduling.clearTimer(this.workspaceScanTimer)
		this.workspaceScanTimer = undefined
		if (port.loadingViewGeneration() !== undefined) return
		const scope = port.currentStorageScope()
		if (!scope?.startsWith('workspace:') || scope === this.lastWorkspaceScanScope) return
		const generation = ++this.workspaceScanGeneration
		this.workspaceScanTimer = this.scheduling.setTimer(() => {
			this.workspaceScanTimer = undefined
			void port.runWorkspaceScan(scope, generation)
				.catch(error => port.reportWorkspaceScanFailure(error))
		}, 250)
	}

	resetWorkspaceScan(): void {
		this.workspaceScanGeneration++
		this.lastWorkspaceScanScope = undefined
		if (this.workspaceScanTimer) this.scheduling.clearTimer(this.workspaceScanTimer)
		this.workspaceScanTimer = undefined
	}

	invalidateWorkspaceScanScope(): void {
		this.lastWorkspaceScanScope = undefined
	}

	get currentWorkspaceScanGeneration(): number {
		return this.workspaceScanGeneration
	}

	markWorkspaceScanCompleted(scope: string): void {
		this.lastWorkspaceScanScope = scope
	}

	dispose(): void {
		this.disposeFileWatchers()
		if (this.workspaceScanTimer) this.scheduling.clearTimer(this.workspaceScanTimer)
		this.workspaceScanTimer = undefined
		this.workspaceScanGeneration++
		for (const timer of this.fileTimers.values()) this.scheduling.clearTimer(timer)
		this.fileTimers.clear()
	}
}
