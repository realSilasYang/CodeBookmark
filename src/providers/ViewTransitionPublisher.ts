import { planViewTransition, type ViewTransitionState } from '../util/ViewTransition'

interface ViewTransitionPublisherPort {
	isCurrent(generation: number): boolean
	treeVisible: boolean
	waitForTreePopulation(generation: number): Promise<void>
	fireTreeChanged(): void
	queueBookmarkPresenceContexts(): Promise<void>
	setUndoScope(): void
}

export async function publishViewTransition(
	transition: ViewTransitionState,
	generation: number,
	port: ViewTransitionPublisherPort,
	treeRenderSettleMs: number,
): Promise<void> {
	const plan = planViewTransition(transition.previousHasContent, transition.nextHasContent)
	if (plan === 'tree-then-contexts') {
		if (!port.isCurrent(generation)) return
		const treePopulated = port.treeVisible
			? port.waitForTreePopulation(generation)
			: undefined
		port.fireTreeChanged()
		if (treePopulated) {
			await treePopulated
			if (!port.isCurrent(generation)) return
			await new Promise<void>(resolve => setTimeout(resolve, treeRenderSettleMs))
			if (!port.isCurrent(generation)) return
		}
		await port.queueBookmarkPresenceContexts()
		port.setUndoScope()
		return
	}
	await port.queueBookmarkPresenceContexts()
	if (plan === 'contexts-then-tree' && port.isCurrent(generation)) port.fireTreeChanged()
	if (port.isCurrent(generation)) port.setUndoScope()
}
