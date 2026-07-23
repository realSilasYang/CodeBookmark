/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `SerialTaskQueue`。
 *
 * 实现要点：集中实现 `SerialTaskQueue` 的无界面规则和边界处理，供多个上层流程复用。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`SerialTaskQueue`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
export class SerialTaskQueue {
	private tail: Promise<void> = Promise.resolve()

	run<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.tail.then(operation, operation)
		this.tail = result.then(() => undefined, () => undefined)
		return result
	}
}
