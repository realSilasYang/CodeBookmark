/**
 * 协调脚本配置与工作区布局的写入顺序，只有脚本配置全部保存成功后才提交视觉关系。
 * 新布局确认落盘后再删除旧顺序文件，避免迁移中断时同时失去新旧两份结构信息。
 */
import * as path from 'path'
import type { Bookmark } from '../models/Bookmark'
import type { BookmarkSet } from '../models/BookmarkSet'
import { captureWorkspaceLayout } from '../models/BookmarkOwnership'
import type { WorkspaceLayout } from '../models/WorkspaceLayout'
import type { PreparedBookmarkView } from './BookmarkViewPreparation'

interface WorkspaceLayoutPersistenceIO {
	writeJson(filePath: string, value: unknown): Promise<boolean>
	deleteFile(filePath: string): Promise<void>
}

async function persistPreparedWorkspaceLayout(
	filePath: string,
	layout: WorkspaceLayout,
	legacyOrderFilePath: string | undefined,
	io: WorkspaceLayoutPersistenceIO,
): Promise<boolean> {
	if (!await io.writeJson(filePath, layout)) return false
	if (legacyOrderFilePath) {
		try { await io.deleteFile(legacyOrderFilePath) } catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
		}
	}
	return true
}

async function persistCurrentWorkspaceLayout(
	bookmarks: BookmarkSet,
	currentLayout: WorkspaceLayout | null,
	pinnedContainer: Bookmark | undefined,
	storageFolder: string,
	io: WorkspaceLayoutPersistenceIO,
): Promise<WorkspaceLayout | undefined> {
	const layout = captureWorkspaceLayout(bookmarks, currentLayout?.hiddenFiles ?? [], pinnedContainer)
	if (!await io.writeJson(path.join(storageFolder, '_workspace_layout.json'), layout)) return undefined
	try { await io.deleteFile(path.join(storageFolder, '_workspace_order.json')) } catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
	}
	return layout
}

interface WorkspaceTopologyCommitPort {
	isWorkspaceScope(): boolean
	writeBlocked(): boolean
	storageFolder(): string | undefined
	bookmarks(): BookmarkSet
	currentLayout(): WorkspaceLayout | null
	pinnedContainer(): Bookmark | undefined
	saveAllBookmarks(): void
	flushPendingSaves(): Promise<void>
	writeJson(filePath: string, value: unknown): Promise<boolean>
	deleteFile(filePath: string): Promise<void>
	setLayout(layout: WorkspaceLayout): void
	reportBlocked(): void
	reportWriteFailure(): void
}

export async function commitWorkspaceTopology(port: WorkspaceTopologyCommitPort): Promise<void> {
	port.saveAllBookmarks()
	await port.flushPendingSaves()
	if (!port.isWorkspaceScope()) return
	if (port.writeBlocked()) {
		port.reportBlocked()
		return
	}
	const folder = port.storageFolder()
	if (!folder) return
	const layout = await persistCurrentWorkspaceLayout(
		port.bookmarks(),
		port.currentLayout(),
		port.pinnedContainer(),
		folder,
		{ writeJson: port.writeJson, deleteFile: port.deleteFile },
	)
	if (!layout) {
		port.reportWriteFailure()
		return
	}
	port.setLayout(layout)
}

interface WorkspaceExpansionCommitPort {
	isWorkspaceScope(): boolean
	writeBlocked(): boolean
	storageFolder(): string | undefined
	bookmarks(): BookmarkSet
	currentLayout(): WorkspaceLayout | null
	pinnedContainer(): Bookmark | undefined
	writeJson(filePath: string, value: unknown): Promise<boolean>
	setLayout(layout: WorkspaceLayout): void
	reportWriteFailure(): void
}

function layoutContent(layout: WorkspaceLayout): string {
	return JSON.stringify({
		entries: layout.entries,
		hiddenFiles: layout.hiddenFiles,
		pinnedContainer: layout.pinnedContainer,
		expansionStates: layout.expansionStates,
	})
}

export async function commitWorkspaceExpansionState(port: WorkspaceExpansionCommitPort): Promise<void> {
	if (!port.isWorkspaceScope() || port.writeBlocked()) return
	const current = port.currentLayout()
	const folder = port.storageFolder()
	if (!current || !folder) return
	const layout = captureWorkspaceLayout(port.bookmarks(), current.hiddenFiles, port.pinnedContainer())
	if (layoutContent(layout) === layoutContent(current)) return
	if (!await port.writeJson(path.join(folder, '_workspace_layout.json'), layout)) {
		port.reportWriteFailure()
		return
	}
	port.setLayout(layout)
}

interface GeneratedExpansionPersistenceQueue {
	run<T>(task: () => Promise<T>): Promise<T>
}

export async function persistGeneratedWorkspaceExpansion(
	expectedStorageScope: string,
	currentStorageScope: () => string | undefined,
	queue: GeneratedExpansionPersistenceQueue,
	flushPendingSaves: () => Promise<void>,
	port: WorkspaceExpansionCommitPort,
): Promise<void> {
	if (currentStorageScope() !== expectedStorageScope || !expectedStorageScope.startsWith('workspace:')) return
	await queue.run(async () => {
		if (currentStorageScope() !== expectedStorageScope) return
		await flushPendingSaves()
		if (currentStorageScope() !== expectedStorageScope) return
		await commitWorkspaceExpansionState(port)
	})
}

interface PreparedWorkspaceMetadataPersistencePort {
	isCurrent(storageScope: string, generation: number): boolean
	writeJson(filePath: string, value: unknown): Promise<boolean>
	deleteFile(filePath: string): Promise<void>
	reportOrderWriteFailure(): void
	reportLayoutWriteFailure(): void
	reportFailure(error: unknown): void
}

export async function persistPreparedWorkspaceMetadata(
	prepared: PreparedBookmarkView,
	generation: number,
	port: PreparedWorkspaceMetadataPersistencePort,
): Promise<void> {
	try {
		if (!port.isCurrent(prepared.storageScope, generation)) return
		if (prepared.workspaceLayoutNeedsPersist && !prepared.workspaceLayoutWriteBlocked
			&& prepared.workspaceLayoutFilePath && prepared.workspaceLayout) {
			if (!await persistPreparedWorkspaceLayout(
				prepared.workspaceLayoutFilePath,
				prepared.workspaceLayout,
				prepared.legacyOrderFilePath,
				port,
			)) port.reportLayoutWriteFailure()
			return
		}
		if (!prepared.workspaceLayout && prepared.workspaceOrderNeedsPersist
			&& prepared.workspaceOrderFilePath && prepared.workspaceOrder
			&& !await port.writeJson(prepared.workspaceOrderFilePath, prepared.workspaceOrder)) {
			port.reportOrderWriteFailure()
		}
	} catch (error) {
		port.reportFailure(error)
	}
}
