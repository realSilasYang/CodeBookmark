/**
 * 模块说明：本文件负责集成测试专用公开接口，具体对象为 `IntegrationTestTypes`。
 *
 * 实现要点：把真实提供器操作包装为稳定测试 API，并只返回可断言的不可变快照。
 * 核心边界：仅向受控测试环境暴露稳定快照和操作入口，生产运行时不得依赖这些接口。
 * 主要入口：`IntegrationBookmarkSnapshotNode`、`IntegrationBookmarkSnapshot`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
export interface IntegrationBookmarkSnapshotNode {
	readonly id: string
	readonly label: string
	readonly path: string
	readonly isFile: boolean
	readonly scriptId?: string
	readonly line: number
	readonly children: readonly IntegrationBookmarkSnapshotNode[]
}

export interface IntegrationBookmarkSnapshot {
	readonly ready: boolean
	readonly storageScope?: string
	readonly roots: readonly IntegrationBookmarkSnapshotNode[]
}
