/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `ConfigWatcherLifecycle`。
 *
 * 实现要点：集中管理监听器、定时器与资源的创建、复用和释放，防止跨视图泄漏。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`ConfigWatcherHandle`、`ConfigWatcherLifecycle`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
