/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `ViewLoadSession`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`ViewLoadSession`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
export class ViewLoadSession {
	private currentGeneration = 0
	private activeLoadingGeneration: number | undefined
	private abortController = new AbortController()
	private abortGeneration = 0

	get generation(): number {
		return this.currentGeneration
	}

	get loadingGeneration(): number | undefined {
		return this.activeLoadingGeneration
	}

	begin(): number {
		this.abortController.abort()
		const generation = ++this.currentGeneration
		this.abortController = new AbortController()
		this.abortGeneration = generation
		return generation
	}

	signalFor(generation: number): AbortSignal | undefined {
		return generation === this.abortGeneration
			? this.abortController.signal
			: undefined
	}

	markLoading(generation: number): void {
		this.activeLoadingGeneration = generation
	}

	finishLoading(generation: number): void {
		if (this.activeLoadingGeneration === generation) this.activeLoadingGeneration = undefined
	}

	clearLoading(): void {
		this.activeLoadingGeneration = undefined
	}

	dispose(): void {
		this.abortController.abort()
		this.currentGeneration++
		this.abortGeneration = -1
		this.activeLoadingGeneration = undefined
	}
}
