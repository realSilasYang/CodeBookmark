/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `ViewTransitionPublisher`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`publishViewTransition`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
