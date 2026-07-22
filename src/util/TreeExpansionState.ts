interface ExpansionStateNode {
	readonly level: number
	readonly collapsibleState?: number
	readonly subs: {
		readonly size: number
		readonly values: readonly ExpansionStateNode[]
	}
}

/**
 * Returns true only when every expandable branch required to expose the
 * configured level is open. Deeper branches do not need to be open unless
 * defaultExpandLevel is 0, which means expand the entire tree.
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
