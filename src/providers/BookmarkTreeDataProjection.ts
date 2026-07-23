/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `BookmarkTreeDataProjection`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`BookmarkTreeDataProjectionPort`、`BookmarkTreeDataProjection`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import { bookmarkPathKey } from '../util/BookmarkPath'

export interface BookmarkTreeDataProjectionPort<Item, ResourceUri> {
	rootItems(): readonly Item[]
	findItem(item: Item): Item | undefined
	childrenOf(item: Item): readonly Item[]
	parentOf(item: Item): Item | undefined
	isFile(item: Item): boolean
	itemPath(item: Item): string
	resourceUri(item: Item): ResourceUri | undefined
	setResourceUri(item: Item, uri: ResourceUri): void
	createResourceUri(absolutePath: string): ResourceUri
	absoluteBookmarkPath(bookmarkPath: string): string
	relativeBookmarkPath(absolutePath: string): string
	isWorkspaceScope(): boolean
	currentScopeFilePath(): string | undefined
	workspaceOrder(): string[] | null
	setWorkspaceOrder(order: string[]): void
	persistWorkspaceOrder(order: readonly string[]): void
	sortItems(items: Item[]): Item[]
	refreshItem(item: Item): void
	resolveTreePopulation(): void
}

export class BookmarkTreeDataProjection<Item extends object, ResourceUri> {
	private readonly fileNodesByPath = new Map<string, Item>()

	clearFileNodeCache(): void {
		this.fileNodesByPath.clear()
	}

	rebuildFileNodeCache(
		items: readonly Item[],
		port: BookmarkTreeDataProjectionPort<Item, ResourceUri>,
	): void {
		this.fileNodesByPath.clear()
		for (const item of items) {
			const itemPath = port.itemPath(item)
			if (port.isFile(item) && itemPath) this.fileNodesByPath.set(bookmarkPathKey(itemPath), item)
		}
	}

	hasFileNode(bookmarkPath: string): boolean {
		return this.fileNodesByPath.has(bookmarkPathKey(bookmarkPath))
	}

	fileNode(bookmarkPath: string): Item | undefined {
		return this.fileNodesByPath.get(bookmarkPathKey(bookmarkPath))
	}

	parent(
		element: Item,
		port: BookmarkTreeDataProjectionPort<Item, ResourceUri>,
	): Item | undefined {
		const parent = port.parentOf(element)
		if (!port.isWorkspaceScope() && parent && port.isFile(parent)) return undefined
		return parent
	}

	standaloneRoots(port: BookmarkTreeDataProjectionPort<Item, ResourceUri>): Item[] {
		const fileNodes = port.rootItems().filter(item => port.isFile(item))
		const currentScopeFilePath = port.currentScopeFilePath()
		if (!currentScopeFilePath) return [...(fileNodes[0] ? port.childrenOf(fileNodes[0]) : [])]
		const currentPathKey = bookmarkPathKey(port.relativeBookmarkPath(currentScopeFilePath))
		const currentFile = fileNodes.find(item => bookmarkPathKey(port.itemPath(item)) === currentPathKey)
		return currentFile ? [...port.childrenOf(currentFile)] : []
	}

	children(
		element: Item | undefined,
		port: BookmarkTreeDataProjectionPort<Item, ResourceUri>,
	): Item[] {
		if (port.rootItems().length === 0) return []
		if (element) {
			const currentElement = port.findItem(element)
			return currentElement ? port.sortItems([...port.childrenOf(currentElement)]) : []
		}
		if (!port.isWorkspaceScope()) return port.sortItems(this.standaloneRoots(port))

		const pathsByKey = new Map<string, string>()
		const fileNodesByPath = new Map<string, Item>()
		this.fileNodesByPath.clear()
		for (const child of port.rootItems()) {
			const childPath = port.itemPath(child)
			if (!port.isFile(child) || !childPath) continue
			const key = bookmarkPathKey(childPath)
			pathsByKey.set(key, childPath)
			fileNodesByPath.set(key, child)
			this.fileNodesByPath.set(key, child)
		}

		const cachedOrder = port.workspaceOrder() ?? []
		const orderedPaths: string[] = []
		const orderedKeys = new Set<string>()
		for (const savedPath of cachedOrder) {
			const key = bookmarkPathKey(savedPath)
			const actualPath = pathsByKey.get(key)
			if (actualPath === undefined || orderedKeys.has(key)) continue
			orderedPaths.push(actualPath)
			orderedKeys.add(key)
		}
		for (const [key, actualPath] of pathsByKey) {
			if (orderedKeys.has(key)) continue
			orderedPaths.push(actualPath)
			orderedKeys.add(key)
		}

		const hasChanges = cachedOrder.length !== orderedPaths.length
			|| cachedOrder.some((savedPath, index) => savedPath !== orderedPaths[index])
		if (hasChanges) {
			port.setWorkspaceOrder(orderedPaths)
			port.persistWorkspaceOrder(orderedPaths)
		}

		const items = orderedPaths
			.map(itemPath => fileNodesByPath.get(bookmarkPathKey(itemPath)))
			.filter((item): item is Item => item !== undefined)
		for (const item of items) this.ensureResourceUri(item, port)
		return port.sortItems(items)
	}

	treeItem(
		element: Item,
		port: BookmarkTreeDataProjectionPort<Item, ResourceUri>,
	): Item {
		this.ensureResourceUri(element, port)
		port.refreshItem(element)
		if (port.findItem(element)) port.resolveTreePopulation()
		return element
	}

	private ensureResourceUri(
		item: Item,
		port: BookmarkTreeDataProjectionPort<Item, ResourceUri>,
	): void {
		const itemPath = port.itemPath(item)
		if (port.resourceUri(item) !== undefined || !itemPath || !port.isFile(item)) return
		port.setResourceUri(item, port.createResourceUri(port.absoluteBookmarkPath(itemPath)))
	}
}
