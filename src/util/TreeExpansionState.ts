/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `TreeExpansionState`。
 *
 * 实现要点：封装状态读取、迁移和更新不变量，避免多个调用方直接操作底层表示。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`isTreeExpandedToLevel`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
interface ExpansionStateNode {
	readonly level: number
	readonly collapsibleState?: number
	readonly subs: {
		readonly size: number
		readonly values: readonly ExpansionStateNode[]
	}
}

/**
 * 仅当展示目标层级所需的全部可展开分支都已打开时返回 true。
 * 更深分支无需展开；defaultExpandLevel 为 0 时例外，表示整棵树必须全部展开。
 */
export function isTreeExpandedToLevel(
	roots: Iterable<ExpansionStateNode>,
	defaultExpandLevel: number,
	expandedState: number,
): boolean {
	const targetLevel = Number.isFinite(defaultExpandLevel)
		? Math.max(0, Math.floor(defaultExpandLevel))
		: 0
	let hasRequiredBranch = false

	const visit = (nodes: Iterable<ExpansionStateNode>): boolean => {
		for (const node of nodes) {
			if (node.subs.size === 0) continue
			const required = targetLevel === 0 || node.level === 0 || node.level < targetLevel
			if (!required) continue
			hasRequiredBranch = true
			if (node.collapsibleState !== expandedState || !visit(node.subs.values)) return false
		}
		return true
	}

	return visit(roots) && hasRequiredBranch
}
