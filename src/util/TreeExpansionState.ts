/**
 * 判断目标层级要求展开的所有分支是否已经打开，用于决定工具栏应显示“展开”还是“收起”。
 * 目标层级以下的分支无需检查；层级为零时表示要求整棵树完全展开。
 */
interface ExpansionStateNode {
	readonly treeDepth: number
	readonly collapsibleState?: number
	readonly subs: {
		readonly size: number
		readonly values: readonly ExpansionStateNode[]
	}
}

/**
 * 判断为了看见目标层级而必须打开的分支是否都已展开。目标以下的深层分支无需计入；
 * defaultExpandLevel 为 0 是“全部展开”模式，此时整棵树的可展开节点都要检查。
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
			const required = targetLevel === 0 || node.treeDepth < targetLevel
			if (!required) continue
			hasRequiredBranch = true
			if (node.collapsibleState !== expandedState || !visit(node.subs.values)) return false
		}
		return true
	}

	return visit(roots) && hasRequiredBranch
}
