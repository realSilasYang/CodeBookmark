/**
 * 把待保存请求按工作区或单文件作用域分组，并计算每组应写入的文件集合。
 * 该纯函数不读写磁盘，保存协调器可以先检查计划，再按稳定顺序执行副作用。
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

/**
 * 把请求按作用域整理成可执行批次。这里只计算“哪些文件归哪次保存”，
 * 不读取仓库也不写盘，因此协调器可以在真正提交前检查完整计划。
 */
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
