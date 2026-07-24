/**
 * 协调配置目录监听器的建立、替换和关闭，并把批量文件事件合并成有序刷新。
 * 监听根目录切换或请求过期时会丢弃旧回调，防止旧目录的迟到事件覆盖当前视图。
 */
import {
	classifyBookmarkConfigChanges,
	type BookmarkConfigChangeClassification,
} from './BookmarkConfigChangeClassifier'
import {
	ConfigWatcherLifecycle,
	type ConfigWatcherHandle,
} from './ConfigWatcherLifecycle'

type ConfigWatcherTimer = ReturnType<typeof setTimeout>

export type BookmarkConfigWatcherFailureKind =
	| 'delayed-processing'
	| 'processing'
	| 'classification'
	| 'setup'
	| 'watcher'

interface BookmarkConfigWatcherScheduling {
	setTimer(callback: () => void, delay: number): ConfigWatcherTimer
	clearTimer(timer: ConfigWatcherTimer): void
}

export interface BookmarkConfigWatcherPort {
	isDisposed(): boolean
	currentGeneration(): number
	currentScope(): string | undefined
	watchDirectories(): { scriptFolder: string | null, workspaceFolder: string | null }
	isSaving(): boolean
	collectExternalChanges(directory: string): Promise<readonly string[]>
	hasExternalChange(directory: string, filename: string): Promise<boolean>
	sameDirectory(left: string, right: string): boolean
	reloadExternalBookmarkFiles(fileNames: readonly string[]): Promise<void>
	reloadWorkspaceLayout(): Promise<void>
	rebasePendingSaves(): void
	isDirectory(directory: string): Promise<boolean>
	rememberDirectory(directory: string): Promise<void>
	watchDirectory(
		directory: string,
		onFileChange: (filename: string | null) => void,
		onError: (error: unknown) => void,
	): ConfigWatcherHandle
	reportFailure(kind: BookmarkConfigWatcherFailureKind, error: unknown, directory?: string): void
}

const defaultScheduling: BookmarkConfigWatcherScheduling = {
	setTimer: (callback, delay) => setTimeout(callback, delay),
	clearTimer: timer => clearTimeout(timer),
}

export class BookmarkConfigWatcherCoordinator {
	private readonly watcherLifecycle = new ConfigWatcherLifecycle()
	private debounceTimer: ConfigWatcherTimer | undefined
	private readonly retryTimers = new Set<ConfigWatcherTimer>()

	constructor(private readonly scheduling: BookmarkConfigWatcherScheduling = defaultScheduling) {}

	async setup(generation: number, port: BookmarkConfigWatcherPort): Promise<void> {
		const { scriptFolder, workspaceFolder } = port.watchDirectories()
		const watcherScope = port.currentScope()
		const isCurrent = (): boolean => !port.isDisposed()
			&& generation === port.currentGeneration()
			&& watcherScope === port.currentScope()
		if (!isCurrent()) return

		const pendingChanges = new Map<string, Set<string | null>>()
		const processChanges = async (): Promise<void> => {
			if (!isCurrent()) {
				pendingChanges.clear()
				return
			}
			if (port.isSaving()) {
				this.debounceTimer = this.scheduling.setTimer(() => {
					void processChanges().catch(error => port.reportFailure('delayed-processing', error))
				}, 100)
				return
			}

			const changes = [...pendingChanges.entries()]
			pendingChanges.clear()
			const classification = await classifyBookmarkConfigChanges(
				changes,
				scriptFolder,
				workspaceFolder,
				{
					collectExternalChanges: directory => port.collectExternalChanges(directory),
					hasExternalChange: (directory, filename) => port.hasExternalChange(directory, filename),
				},
				{
					sameDirectory: (left, right) => port.sameDirectory(left, right),
					reportFailure: (directory, error) => port.reportFailure('classification', error, directory),
				},
			)
			if (!isCurrent()) return
			await this.applyChanges(classification, port)
		}

		await this.watcherLifecycle.replace(
			[scriptFolder, workspaceFolder && workspaceFolder !== scriptFolder ? workspaceFolder : null],
			{
				isCurrent,
				isDirectory: directory => port.isDirectory(directory),
				rememberDirectory: directory => port.rememberDirectory(directory),
				watchDirectory: (directory, onFileChange, onError) =>
					port.watchDirectory(directory, onFileChange, onError),
				reportSetupFailure: error => port.reportFailure('setup', error),
			},
			(directory, filename) => {
				if (filename !== null && !filename.toLowerCase().endsWith('.json')) return
				const filenames = pendingChanges.get(directory) ?? new Set<string | null>()
				filenames.add(filename)
				pendingChanges.set(directory, filenames)
				if (this.debounceTimer) this.scheduling.clearTimer(this.debounceTimer)
				this.debounceTimer = this.scheduling.setTimer(() => {
					void processChanges().catch(error => port.reportFailure('processing', error))
				}, 500)
			},
			(directory, error) => {
				port.reportFailure('watcher', error, directory)
				if (port.isDisposed()) return
				const retryTimer = this.scheduling.setTimer(() => {
					this.retryTimers.delete(retryTimer)
					if (isCurrent()) void this.setup(generation, port)
				}, 1_000)
				this.retryTimers.add(retryTimer)
			},
		)
		if (this.debounceTimer) this.scheduling.clearTimer(this.debounceTimer)
	}

	closeWatchers(): void {
		this.watcherLifecycle.close()
	}

	dispose(): void {
		this.watcherLifecycle.close()
		if (this.debounceTimer) this.scheduling.clearTimer(this.debounceTimer)
		this.debounceTimer = undefined
		for (const timer of this.retryTimers) this.scheduling.clearTimer(timer)
		this.retryTimers.clear()
	}

	private async applyChanges(
		classification: BookmarkConfigChangeClassification,
		port: BookmarkConfigWatcherPort,
	): Promise<void> {
		if (classification.layoutChanged || classification.orderChanged) {
			await port.reloadWorkspaceLayout()
			return
		}
		if (classification.incrementalChanges.size === 0) return
		const fileNames = [...new Set(
			[...classification.incrementalChanges.values()].flatMap(names => [...names]),
		)]
		await port.reloadExternalBookmarkFiles(fileNames)
		port.rebasePendingSaves()
	}
}
