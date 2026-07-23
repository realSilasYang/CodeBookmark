/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `PendingSavePlan`。
 *
 * 实现要点：把当前状态转换为无副作用执行计划，实际 I/O 由调用方按计划提交。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`planPendingSaves`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import type { PendingSaveRequest } from './PendingSaveStore'

interface PendingSaveGroup {
	path: string
	request: PendingSaveRequest
	keys: string[]
	dirtyPaths?: string[]
}

interface PendingSavePlan {
	workspaceGroups: PendingSaveGroup[]
	standaloneRequests: Array<[string, PendingSaveRequest]>
}

/** 在不依赖 VS Code 或仓库实现的前提下，对待保存请求进行分组。 */
export function planPendingSaves(
	requests: ReadonlyMap<string, PendingSaveRequest>,
	workspaceKeyFor: (filePath: string) => string | undefined,
): PendingSavePlan {
	const workspaceGroups = new Map<string, PendingSaveGroup>()
	const standaloneRequests: Array<[string, PendingSaveRequest]> = []
	for (const [filePath, request] of requests) {
		const workspaceKey = workspaceKeyFor(filePath)
		if (workspaceKey === undefined) {
			standaloneRequests.push([filePath, request])
			continue
		}
		const key = `${request.storageRoot}\0${workspaceKey}`
		const group = workspaceGroups.get(key)
		if (!group) {
			workspaceGroups.set(key, {
				path: filePath,
				request,
				keys: [filePath],
				dirtyPaths: request.dirtyPaths ? [...request.dirtyPaths] : undefined,
			})
			continue
		}
		group.keys.push(filePath)
		if (group.dirtyPaths !== undefined && request.dirtyPaths !== undefined) {
			group.dirtyPaths = Array.from(new Set([...group.dirtyPaths, ...request.dirtyPaths]))
		} else {
			group.dirtyPaths = undefined
		}
		if (request.sequence > group.request.sequence) {
			group.path = filePath
			group.request = request
		}
	}
	return {
		workspaceGroups: [...workspaceGroups.values()],
		standaloneRequests,
	}
}
