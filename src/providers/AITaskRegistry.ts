/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `AITaskRegistry`。
 *
 * 实现要点：登记、查找和去重运行期对象，确保等价键始终映射到同一状态。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`AITaskRegistry`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
/**
 * 按文件与存储作用域两个粒度跟踪正在执行的 AI 任务。
 *
 * 提供器负责工作流和用户可见行为；本类只维护任务身份与去重状态，
 * 使并发约束保持局部化，并可脱离 VS Code 独立测试。
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
