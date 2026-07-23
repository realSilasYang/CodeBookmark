/**
 * 模块说明：本文件负责跨模块常量与稳定标识符，具体对象为 `ExtensionStateKeys`。
 *
 * 实现要点：集中维护跨运行时与生成脚本共享的稳定常量，避免字符串和顺序发生漂移。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`ExtensionStateKeys`、`SyncedGlobalStateKeys`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
export const ExtensionStateKeys = {
	recentIcons: 'codebookmark.recentIcons',
} as const

// setKeysForSync 每次调用都会替换完整同步列表，因此必须集中维护所有键，
// 避免新增同步状态时意外停止既有状态的账号同步。
export const SyncedGlobalStateKeys: readonly string[] = [
	ExtensionStateKeys.recentIcons,
]
