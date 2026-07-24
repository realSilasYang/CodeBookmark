/**
 * 定义 Extension Host 集成测试可读取的书签树快照结构。
 * 类型只包含路径、标签、身份和层级等可观察字段，不把内部服务或 VS Code 实例暴露给测试。
 */
export interface IntegrationBookmarkSnapshotNode {
	readonly id: string
	readonly label: string
	readonly path: string
	readonly isFile: boolean
	readonly scriptId?: string
	readonly ownerScriptId?: string
	readonly parentId?: string
	readonly treeDepth: number
	readonly line: number
	readonly children: readonly IntegrationBookmarkSnapshotNode[]
}

export interface IntegrationBookmarkSnapshot {
	readonly ready: boolean
	readonly storageScope?: string
	readonly roots: readonly IntegrationBookmarkSnapshotNode[]
}
