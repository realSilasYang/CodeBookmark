/**
 * 以纯函数比较当前视图与目标视图，决定需要更新哪些上下文键和加载状态。
 * 过渡计划本身不调用 VS Code API，发布器可以按固定顺序一次应用完整变化。
 */
type ViewTransitionPlan = 'contexts-only' | 'contexts-then-tree' | 'tree-then-contexts'

export interface ViewTransitionState {
	previousHasContent: boolean
	nextHasContent: boolean
}

export function planViewTransition(previousHasContent: boolean, nextHasContent: boolean): ViewTransitionPlan {
	if (!previousHasContent && !nextHasContent) return 'contexts-only'
	if (!previousHasContent && nextHasContent) return 'tree-then-contexts'
	return 'contexts-then-tree'
}
