/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `StorageRootState`。
 *
 * 实现要点：封装状态读取、迁移和更新不变量，避免多个调用方直接操作底层表示。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`storageRootState`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
