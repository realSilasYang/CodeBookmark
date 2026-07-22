/**
 * Tracks active AI work at file and storage-scope granularity.
 *
 * The provider owns the workflow and user-facing behavior; this class owns
 * only task identity and de-duplication state so those concerns stay local
 * and independently testable.
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
