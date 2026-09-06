/**
 * 处理配置文件事件触发的磁盘重载。Windows 原子替换可能先报告 rename，再让目标文件重新可见。
 * 已有书签读成空树时短暂重试，真实删除仍会在重试结束后保留为空。
 */
interface ExternalBookmarkReloadPort {
	currentStorageScope(): string | undefined
	currentBookmarkCount(): number
	invalidateRepositoryIndex(): void
	refresh(storageScope: string): Promise<void>
}

export async function reloadExternalBookmarks(
	fileNames: readonly string[],
	port: ExternalBookmarkReloadPort,
): Promise<void> {
	if (fileNames.length === 0) return
	const expectedScope = port.currentStorageScope()
	if (!expectedScope) return
	const hadBookmarks = port.currentBookmarkCount() > 0
	for (let attempt = 0; attempt < (hadBookmarks ? 4 : 1); attempt++) {
		if (port.currentStorageScope() !== expectedScope) return
		port.invalidateRepositoryIndex()
		await port.refresh(expectedScope)
		if (!hadBookmarks || port.currentBookmarkCount() > 0 || port.currentStorageScope() !== expectedScope) return
		if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt))
	}
}
