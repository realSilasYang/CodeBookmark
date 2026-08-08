/**
 * 在磁盘重载前等待本地书签和工作区元数据稳定，并用变更代次发现等待期间的新修改。
 * 最终重载在同一调用栈内启动，后续修改便能通过视图加载代次取消它。
 */
interface BookmarkViewMutationBarrierPort {
	waitForMetadataWrites(): Promise<void>
	flushPendingBookmarks(): Promise<void>
}

export class BookmarkViewMutationBarrier {
	private mutationRevision = 0

	markMutation(): void {
		this.mutationRevision++
	}

	async runAfterSettled<T>(
		port: BookmarkViewMutationBarrierPort,
		operation: () => Promise<T>,
	): Promise<T> {
		while (true) {
			const revision = this.mutationRevision
			await port.waitForMetadataWrites()
			await port.flushPendingBookmarks()
			if (revision !== this.mutationRevision) continue
			return operation()
		}
	}
}
