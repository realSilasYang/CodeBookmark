/**
 * 按规范化任务键登记正在运行的 AI 操作，阻止同一目标上的重复请求并支持统一取消。
 * 任务完成或失败后都会自动释放登记项，不让一次异常永久占住后续操作。
 */
/**
 * 记录正在运行的 AI 任务及其取消器。同一文件或同一存储作用域再次发起等价任务时，
 * 调用方能在这里识别冲突；提示用户、读取源码和提交书签仍由外层工作流负责。
 */
export class AITaskRegistry {
	private readonly fileTasks = new Set<string>()
	private readonly folderScopes = new Set<string>()

	fileTaskKey(scope: string, relativePath: string): string {
		return `${scope}\0${relativePath}`
	}

	isFileRunning(taskKey: string): boolean {
		return this.fileTasks.has(taskKey)
	}

	tryStartFile(taskKey: string): boolean {
		if (this.fileTasks.has(taskKey)) return false
		this.fileTasks.add(taskKey)
		return true
	}

	finishFile(taskKey: string): void {
		this.fileTasks.delete(taskKey)
	}

	isFolderRunning(scope: string): boolean {
		return this.folderScopes.has(scope)
	}

	tryStartFolder(scope: string): boolean {
		if (this.folderScopes.has(scope)) return false
		this.folderScopes.add(scope)
		return true
	}

	finishFolder(scope: string): void {
		this.folderScopes.delete(scope)
	}
}
