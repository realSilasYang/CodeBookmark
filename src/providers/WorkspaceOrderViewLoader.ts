import * as path from 'path'
import { bookmarkPathKey, canonicalBookmarkPath } from '../util/BookmarkPath'

export interface WorkspaceOrderSnapshot {
	order: string[] | null
	filePath?: string
	needsPersist: boolean
}

interface WorkspaceOrderViewLoaderPort {
	resolveBookmarkFolder(scopeFilePath?: string): string | undefined
	readFile(filePath: string): Promise<string>
	reportReadFailure(error: unknown): void
}

export async function readWorkspaceOrderForView(
	bookmarkPaths: readonly string[],
	storageScope: string,
	scopeFilePath: string | undefined,
	signal: AbortSignal | undefined,
	port: WorkspaceOrderViewLoaderPort,
): Promise<WorkspaceOrderSnapshot> {
	if (signal?.aborted || !storageScope.startsWith('workspace:')) {
		return { order: null, needsPersist: false }
	}

	const folder = port.resolveBookmarkFolder(scopeFilePath)
	const orderFilePath = folder ? path.join(folder, '_workspace_order.json') : undefined
	let savedOrder: string[] = []
	if (orderFilePath) {
		try {
			const content = await port.readFile(orderFilePath)
			if (signal?.aborted) return { order: null, needsPersist: false }
			const parsed: unknown = JSON.parse(content)
			savedOrder = Array.isArray(parsed)
				? parsed.filter((entry): entry is string => typeof entry === 'string').map(canonicalBookmarkPath)
				: []
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') port.reportReadFailure(error)
		}
	}

	const pathsByKey = new Map(bookmarkPaths
		.filter(bookmarkPath => bookmarkPath.length > 0)
		.map(bookmarkPath => [bookmarkPathKey(bookmarkPath), bookmarkPath]))
	const orderedPaths: string[] = []
	const orderedKeys = new Set<string>()
	for (const savedPath of savedOrder) {
		const key = bookmarkPathKey(savedPath)
		const actualPath = pathsByKey.get(key)
		if (actualPath !== undefined && !orderedKeys.has(key)) {
			orderedPaths.push(actualPath)
			orderedKeys.add(key)
		}
	}
	for (const [key, actualPath] of pathsByKey) {
		if (!orderedKeys.has(key)) orderedPaths.push(actualPath)
	}

	const changed = savedOrder.length !== orderedPaths.length
		|| savedOrder.some((savedPath, index) => savedPath !== orderedPaths[index])
	return {
		order: orderedPaths,
		filePath: orderFilePath,
		needsPersist: changed && orderFilePath !== undefined && !signal?.aborted,
	}
}
