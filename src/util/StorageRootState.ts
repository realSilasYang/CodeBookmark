/**
 * 保存当前激活的存储根目录及其变化版本，供异步工作流判断作用域是否已经切换。
 * 更新根目录会递增版本，即使路径后来切回原值，旧请求也不能误认为仍然有效。
 */
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
