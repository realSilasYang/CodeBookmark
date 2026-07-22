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

/** Group requests without depending on VS Code or the repository. */
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
