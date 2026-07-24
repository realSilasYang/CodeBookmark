/**
 * 集中声明 globalState、workspaceState 和账号同步使用的稳定键名。
 * setKeysForSync 会替换完整列表，因此所有需要随 VS Code 账号迁移的键必须在同一处维护。
 */
export const ExtensionStateKeys = {
	recentIcons: 'codebookmark.recentIcons',
} as const

// VS Code 的 setKeysForSync 不是追加，而是用新数组替换整份同步清单。
// 所有需要随账号迁移的键集中列在这里，新增一项时才不会顺手取消其他键的同步。
export const SyncedGlobalStateKeys: readonly string[] = [
	ExtensionStateKeys.recentIcons,
]
