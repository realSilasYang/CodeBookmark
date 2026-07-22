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
