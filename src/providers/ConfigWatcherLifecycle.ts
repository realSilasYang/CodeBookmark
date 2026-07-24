/**
 * 安全替换配置目录的文件系统监听器，跟踪当前句柄并统一处理关闭异常。
 * 新监听器建立失败时不会提前丢弃仍可用的旧监听器，减少目录切换期间的观察空窗。
 */
export interface ConfigWatcherHandle {
	close(): void
}

interface ConfigWatcherLifecyclePort {
	isCurrent(): boolean
	isDirectory(directory: string): Promise<boolean>
	rememberDirectory(directory: string): Promise<void>
	watchDirectory(
		directory: string,
		onFileChange: (filename: string | null) => void,
		onError: (error: unknown) => void,
	): ConfigWatcherHandle
	reportSetupFailure(error: unknown): void
}

export class ConfigWatcherLifecycle {
	private watchers: ConfigWatcherHandle[] = []

	async replace(
		directories: readonly (string | null | undefined)[],
		port: ConfigWatcherLifecyclePort,
		onFileChange: (directory: string, filename: string | null) => void,
		onError: (directory: string, error: unknown) => void,
	): Promise<void> {
		const prepared: ConfigWatcherHandle[] = []
		try {
			for (const directory of directories) {
				if (!directory || !await port.isDirectory(directory)) continue
				await port.rememberDirectory(directory)
				prepared.push(port.watchDirectory(
					directory,
					filename => onFileChange(directory, filename),
					error => onError(directory, error),
				))
			}
			if (!port.isCurrent()) {
				prepared.forEach(watcher => watcher.close())
				return
			}
			this.close()
			this.watchers = prepared
		} catch (error) {
			prepared.forEach(watcher => watcher.close())
			port.reportSetupFailure(error)
		}
	}

	close(): void {
		this.watchers.forEach(watcher => watcher.close())
		this.watchers = []
	}
}
