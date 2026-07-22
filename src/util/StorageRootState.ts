import * as path from 'path'

function pathKey(value: string): string {
	return path.resolve(value)
}

class StorageRootState {
	private activeRoot: string | undefined
	private generationValue = 0

	get root(): string | undefined {
		return this.activeRoot
	}

	get generation(): number {
		return this.generationValue
	}

	activate(root: string): void {
		const resolved = path.resolve(root)
		if (this.activeRoot && pathKey(this.activeRoot) === pathKey(resolved)) return
		this.activeRoot = resolved
		this.generationValue++
	}

	clear(): void {
		if (!this.activeRoot) return
		this.activeRoot = undefined
		this.generationValue++
	}
}

export const storageRootState = new StorageRootState()
