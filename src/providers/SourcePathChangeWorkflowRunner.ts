import path = require('path')
import type { BookmarkSet } from '../models/BookmarkSet'
import type { ScriptRelocationChange } from '../repository/BookmarkRepository'
import {
	isSameOrDescendantAbsolutePath,
	renamedAbsolutePath,
} from '../util/AbsolutePath'
import {
	bookmarkPathKey,
	isSameOrDescendantBookmarkPath,
	renamedBookmarkPath,
} from '../util/BookmarkPath'

export interface SourcePathChangeWorkflowPort {
	isDisposed(): boolean
	bookmarks(): BookmarkSet
	currentStorageScope(): string | undefined
	setCurrentStorageScope(scope: string): void
	currentScopeFilePath(): string | undefined
	setCurrentScopeFilePath(filePath: string): void
	workspaceOrder(): string[] | null
	setWorkspaceOrder(order: string[]): void
	absoluteToRelative(absolutePath: string): string
	absoluteBookmarkPath(bookmarkPath: string): string
	storageScopeForAbsolutePath(absolutePath: string): string
	cancelPendingPathWork(absolutePath: string): void
	relocateUndoPath(
		oldScope: string,
		newScope: string,
		oldBookmarkPath: string,
		newBookmarkPath: string,
		oldAbsolutePath: string,
		newAbsolutePath: string,
	): void
	saveBookmarks(filePaths: string[]): void
	refreshDecoration(): void
	refresh(storageScope: string): Promise<void>
	reloadActiveTab(forceReloadDisk: boolean): Promise<void>
	invalidatePathIndex(): void
	clearFileNodeCache(): void
	fireTreeChanged(): void
	sourceFilesChanged(): void
}

function relocateWorkspaceOrderCache(
	oldScope: string,
	newScope: string,
	oldAbsolutePath: string,
	newAbsolutePath: string,
	port: SourcePathChangeWorkflowPort,
): void {
	let workspaceOrder = port.workspaceOrder()
	if (!workspaceOrder) return
	const oldBookmarkPath = port.absoluteToRelative(oldAbsolutePath)
	const newBookmarkPath = port.absoluteToRelative(newAbsolutePath)
	if (oldScope === port.currentStorageScope() && newScope === oldScope) {
		port.setWorkspaceOrder(workspaceOrder.map(entry =>
			isSameOrDescendantBookmarkPath(entry, oldBookmarkPath)
				? renamedBookmarkPath(entry, oldBookmarkPath, newBookmarkPath)
				: entry))
		return
	}
	let changed = false
	if (oldScope === port.currentStorageScope()) {
		workspaceOrder = workspaceOrder.filter(entry =>
			!isSameOrDescendantBookmarkPath(entry, oldBookmarkPath))
		changed = true
	}
	if (newScope === port.currentStorageScope()
		&& !workspaceOrder.some(entry => bookmarkPathKey(entry) === bookmarkPathKey(newBookmarkPath))) {
		workspaceOrder.push(newBookmarkPath)
		changed = true
	}
	if (changed) port.setWorkspaceOrder(workspaceOrder)
}

function relocatePathState(
	oldAbsolutePath: string,
	newAbsolutePath: string,
	port: SourcePathChangeWorkflowPort,
): { oldScope: string, newScope: string, oldBookmarkPath: string, newBookmarkPath: string } {
	port.cancelPendingPathWork(oldAbsolutePath)
	const oldScope = port.storageScopeForAbsolutePath(oldAbsolutePath)
	const newScope = port.storageScopeForAbsolutePath(newAbsolutePath)
	relocateWorkspaceOrderCache(oldScope, newScope, oldAbsolutePath, newAbsolutePath, port)
	const oldBookmarkPath = port.absoluteToRelative(oldAbsolutePath)
	const newBookmarkPath = port.absoluteToRelative(newAbsolutePath)
	port.relocateUndoPath(
		oldScope,
		newScope,
		oldBookmarkPath,
		newBookmarkPath,
		oldAbsolutePath,
		newAbsolutePath,
	)
	return { oldScope, newScope, oldBookmarkPath, newBookmarkPath }
}

export async function applyRepositoryRelocations(
	changes: readonly ScriptRelocationChange[],
	port: SourcePathChangeWorkflowPort,
): Promise<void> {
	if (changes.length === 0 || port.isDisposed()) return
	let reloadScope: string | undefined
	let changed = false
	for (const change of changes) {
		const oldAbsolutePath = path.resolve(change.oldAbsolutePath)
		const newAbsolutePath = path.resolve(change.newAbsolutePath)
		const { oldScope, newScope } = relocatePathState(oldAbsolutePath, newAbsolutePath, port)
		if (oldScope === port.currentStorageScope() && newScope !== oldScope) {
			const currentScopeFilePath = port.currentScopeFilePath()
			if (currentScopeFilePath && isSameOrDescendantAbsolutePath(currentScopeFilePath, oldAbsolutePath)) {
				port.setCurrentScopeFilePath(renamedAbsolutePath(currentScopeFilePath, oldAbsolutePath, newAbsolutePath))
				reloadScope = newScope
			} else if (!reloadScope) {
				reloadScope = port.currentStorageScope()
			}
			continue
		}
		if (newScope === port.currentStorageScope() && oldScope !== newScope) {
			reloadScope ??= port.currentStorageScope()
			continue
		}
		if (oldScope !== port.currentStorageScope() || newScope !== port.currentStorageScope()) continue

		const bookmarks = port.bookmarks()
		const matching = bookmarks.values.filter(bookmark => bookmark.isFile
			&& isSameOrDescendantAbsolutePath(port.absoluteBookmarkPath(bookmark.path), oldAbsolutePath))
		for (const fileNode of matching) {
			const currentAbsolutePath = port.absoluteBookmarkPath(fileNode.path)
			const nextAbsolutePath = renamedAbsolutePath(currentAbsolutePath, oldAbsolutePath, newAbsolutePath)
			const nextStoredPath = path.isAbsolute(fileNode.path)
				? nextAbsolutePath
				: port.absoluteToRelative(nextAbsolutePath)
			bookmarks.renamePath(fileNode.path, nextStoredPath)
			changed = true
		}
	}
	if (reloadScope) {
		await port.refresh(reloadScope)
		return
	}
	if (!changed) return
	port.bookmarks().mergeDuplicateFileNodes()
	port.invalidatePathIndex()
	port.clearFileNodeCache()
	port.refreshDecoration()
	port.fireTreeChanged()
	port.sourceFilesChanged()
}

export async function runRenamedSourcePath(
	oldAbsolutePath: string,
	newAbsolutePath: string,
	port: SourcePathChangeWorkflowPort,
): Promise<void> {
	const { oldScope, newScope, oldBookmarkPath, newBookmarkPath } = relocatePathState(
		oldAbsolutePath,
		newAbsolutePath,
		port,
	)
	const currentStorageScope = port.currentStorageScope()
	const currentScopeFilePath = port.currentScopeFilePath()
	const standaloneScopeAffected = currentStorageScope?.startsWith('file:')
		&& currentScopeFilePath !== undefined
		&& isSameOrDescendantAbsolutePath(currentScopeFilePath, oldAbsolutePath)
	if (standaloneScopeAffected && currentScopeFilePath) {
		const nextRepresentative = renamedAbsolutePath(currentScopeFilePath, oldAbsolutePath, newAbsolutePath)
		const nextScope = port.storageScopeForAbsolutePath(nextRepresentative)
		if (nextScope.startsWith('file:')) {
			const bookmarks = port.bookmarks()
			const movedScriptIds = new Set(bookmarks.values
				.filter(bookmark => bookmark.scriptId && isSameOrDescendantBookmarkPath(bookmark.path, oldBookmarkPath))
				.map(bookmark => bookmark.scriptId as string))
			if (bookmarks.containsPath(oldBookmarkPath)) {
				bookmarks.renamePath(oldBookmarkPath, newBookmarkPath)
				bookmarks.mergeDuplicateFileNodes(movedScriptIds)
			}
			port.setCurrentScopeFilePath(nextRepresentative)
			port.setCurrentStorageScope(nextScope)
			port.saveBookmarks([nextRepresentative])
			port.refreshDecoration()
			return
		}
		port.setCurrentScopeFilePath(nextRepresentative)
		await port.refresh(nextScope)
		return
	}
	const activeRepresentativeMoved = currentScopeFilePath !== undefined
		&& isSameOrDescendantAbsolutePath(currentScopeFilePath, oldAbsolutePath)
	if (oldScope === currentStorageScope && newScope !== oldScope && activeRepresentativeMoved && currentScopeFilePath) {
		const nextRepresentative = renamedAbsolutePath(currentScopeFilePath, oldAbsolutePath, newAbsolutePath)
		port.setCurrentScopeFilePath(nextRepresentative)
		await port.refresh(port.storageScopeForAbsolutePath(nextRepresentative))
		return
	}
	if (oldScope !== currentStorageScope) {
		if (newScope === currentStorageScope) await port.reloadActiveTab(true)
		return
	}
	const bookmarks = port.bookmarks()
	if (newScope !== oldScope) {
		if (!bookmarks.containsPath(oldBookmarkPath)) return
		bookmarks.deleteWithPath(oldBookmarkPath)
		port.refreshDecoration()
		return
	}
	if (!bookmarks.containsPath(oldBookmarkPath)) return
	const movedScriptIds = new Set(bookmarks.values
		.filter(bookmark => bookmark.scriptId && isSameOrDescendantBookmarkPath(bookmark.path, oldBookmarkPath))
		.map(bookmark => bookmark.scriptId as string))
	bookmarks.renamePath(oldBookmarkPath, newBookmarkPath)
	bookmarks.mergeDuplicateFileNodes(movedScriptIds)
	port.saveBookmarks([newAbsolutePath])
	port.refreshDecoration()
}

export function runDeletedSourcePath(
	deletedAbsolutePath: string,
	port: SourcePathChangeWorkflowPort,
): void {
	port.cancelPendingPathWork(deletedAbsolutePath)
	const currentStorageScope = port.currentStorageScope()
	const currentScopeFilePath = port.currentScopeFilePath()
	const currentStandaloneFileDeleted = currentStorageScope?.startsWith('file:')
		&& currentScopeFilePath !== undefined
		&& isSameOrDescendantAbsolutePath(currentScopeFilePath, deletedAbsolutePath)
	if (!currentStandaloneFileDeleted
		&& port.storageScopeForAbsolutePath(deletedAbsolutePath) !== currentStorageScope) return
	const deletedBookmarkPath = port.absoluteToRelative(deletedAbsolutePath)
	const bookmarks = port.bookmarks()
	if (!bookmarks.containsPath(deletedBookmarkPath)) return
	if (bookmarks.deleteWithPath(deletedBookmarkPath)) port.refreshDecoration()
}
