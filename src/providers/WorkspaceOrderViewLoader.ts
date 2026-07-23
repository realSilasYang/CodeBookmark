/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `WorkspaceOrderViewLoader`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`WorkspaceOrderSnapshot`、`readWorkspaceOrderForView`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as path from 'path'
import { bookmarkPathKey, canonicalBookmarkPath } from '../util/BookmarkPath'
import { decodeWorkspaceOrderPersistence } from '../models/WorkspaceOrder'

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
	let migrated = false
	if (orderFilePath) {
		try {
			const content = await port.readFile(orderFilePath)
			if (signal?.aborted) return { order: null, needsPersist: false }
			const decoded = decodeWorkspaceOrderPersistence(JSON.parse(content))
			migrated = decoded.migrated
			savedOrder = decoded.order.map(canonicalBookmarkPath)
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
		needsPersist: (changed || migrated) && orderFilePath !== undefined && !signal?.aborted,
	}
}
