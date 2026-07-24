/**
 * 把异步任务按进入顺序串行执行，并允许队列空闲后等待所有任务收尾。
 * 单个任务失败只拒绝该任务，不会让队列链永久中断或跳过后续任务。
 */
export class SerialTaskQueue {
	private tail: Promise<void> = Promise.resolve()

	run<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.tail.then(operation, operation)
		this.tail = result.then(() => undefined, () => undefined)
		return result
	}
}
