/**
 * 把短时间内重复到来的保存请求合并，按作用域串行写盘，并对失败请求执行有限重试。
 * 内存快照与定时器分离管理；强制刷新会等待队列清空，供导出、切换目录和停用扩展使用。
 */
import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import type { Bookmark } from '../models/Bookmark'
import { planPendingSaves } from './PendingSavePlan'
import { PendingSaveStore } from './PendingSaveStore'

type SaveTimer = ReturnType<typeof setTimeout>

interface BookmarkSaveScheduling {
	setTimer(callback: () => void, delay: number): SaveTimer
	clearTimer(timer: SaveTimer): void
}

export interface BookmarkSaveCoordinatorPort {
	ensureStorageRoot(): string | undefined
	canQueueFullSave(): boolean
	currentBookmarks(): readonly Bookmark[]
	activeFilePathInCurrentScope(): string | undefined
	currentScopeFilePath(): string | undefined
	setCurrentScopeFilePath(filePath: string): void
	absoluteBookmarkPath(bookmarkPath: string): string
	workspaceKeyForPath(filePath: string): string | undefined
	saveSnapshot(
		bookmarks: Bookmark[],
		filePath: string,
		storageRoot: string,
		dirtyPaths?: readonly string[],
	): Promise<boolean>
}

const defaultScheduling: BookmarkSaveScheduling = {
	setTimer: (callback, delay) => setTimeout(callback, delay),
	clearTimer: timer => clearTimeout(timer),
}

export class BookmarkSaveCoordinator {
	private readonly pendingSaves = new PendingSaveStore()
	private saveInProgress = false
	private saveTimer: SaveTimer | undefined
	private savePromise: Promise<void> | undefined
	private readonly maxSaveAttempts = 3
	private terminalSaveFailure = false
	private storageTransitioning = false
	private deferredStorageSave = false
	private importInProgress = false
	private deferredImportFullSave = false
	private readonly deferredImportSavePaths = new Set<string>()

	constructor(
		private readonly port: BookmarkSaveCoordinatorPort,
		private readonly scheduling: BookmarkSaveScheduling = defaultScheduling,
	) {}

	get isSaving(): boolean {
		return this.saveInProgress
	}

	rebasePendingSaves(bookmarks: Bookmark[]): void {
		if (this.pendingSaves.size > 0) this.pendingSaves.rebase(bookmarks)
	}

	private cancelSaveTimer(): void {
		if (this.saveTimer) this.scheduling.clearTimer(this.saveTimer)
		this.saveTimer = undefined
	}

	private scheduleSave(delay = 500): void {
		this.cancelSaveTimer()
		this.saveTimer = this.scheduling.setTimer(() => {
			this.saveTimer = undefined
			void this.flushSaveRequests()
		}, delay)
	}

	private async performSave(allowRetry: boolean): Promise<void> {
		if (this.pendingSaves.size === 0) return
		this.saveInProgress = true
		const requests = this.pendingSaves.takeSnapshot()
		const failedKeys = new Set<string>()
		try {
			const plan = planPendingSaves(requests, filePath => this.port.workspaceKeyForPath(filePath))
			for (const group of plan.workspaceGroups) {
				if (!await this.port.saveSnapshot(
					group.request.bookmarks,
					group.path,
					group.request.storageRoot,
					group.dirtyPaths,
				)) {
					for (const key of group.keys) failedKeys.add(key)
				}
			}
			for (const [filePath, request] of plan.standaloneRequests) {
				if (!await this.port.saveSnapshot(request.bookmarks, filePath, request.storageRoot)) {
					failedKeys.add(filePath)
				}
			}
		} finally {
			this.saveInProgress = false
		}

		const retryResult = allowRetry
			? this.pendingSaves.requeueFailed(requests, failedKeys, this.maxSaveAttempts)
			: { retried: false, exhausted: false }
		if (!allowRetry && failedKeys.size > 0) this.terminalSaveFailure = true
		if (retryResult.exhausted) {
			this.terminalSaveFailure = true
			void vscode.window.showErrorMessage(localize("providers.BookmarkSaveCoordinator.bookmarkSavingFailedRepeatedlySoAutomaticRetriesStoppedCheck"))
		}
	}

	private async flushSaveRequests(allowRetry = true): Promise<void> {
		if (this.savePromise) return this.savePromise
		const operation = this.performSave(allowRetry)
		this.savePromise = operation
		try {
			await operation
		} finally {
			this.savePromise = undefined
			if (this.pendingSaves.size > 0) {
				const attempts = Math.max(...Array.from(this.pendingSaves.values(), request => request.attempts))
				this.scheduleSave(Math.min(4000, 500 * 2 ** attempts))
			}
		}
	}

	private queueBookmarkSave(paths?: readonly string[]): void {
		if (this.importInProgress) {
			if (!paths || paths.length === 0) this.deferredImportFullSave = true
			else for (const filePath of paths) this.deferredImportSavePaths.add(filePath)
			return
		}
		if (this.storageTransitioning) {
			this.deferredStorageSave = true
			return
		}

		const storageRoot = this.port.ensureStorageRoot()
		if (!storageRoot) return
		const targetPaths = new Set<string>()
		const dirtyPaths = paths && paths.length > 0 ? Array.from(new Set(paths)) : undefined
		if (paths && paths.length > 0) {
			for (const filePath of paths) targetPaths.add(filePath)
		} else {
			const activeFilePath = this.port.activeFilePathInCurrentScope()
			if (activeFilePath) {
				this.port.setCurrentScopeFilePath(activeFilePath)
				targetPaths.add(activeFilePath)
			} else {
				const currentScopeFilePath = this.port.currentScopeFilePath()
				if (currentScopeFilePath) targetPaths.add(currentScopeFilePath)
				else {
					for (const bookmark of this.port.currentBookmarks()) {
						targetPaths.add(this.port.absoluteBookmarkPath(bookmark.path))
					}
				}
			}
		}

		for (const filePath of targetPaths) {
			this.pendingSaves.queue(
				[filePath],
				[...this.port.currentBookmarks()],
				storageRoot,
				dirtyPaths,
			)
		}
		if (targetPaths.size > 0) this.scheduleSave()
	}

	queuePaths(paths: readonly string[]): void {
		if (paths.length > 0) this.queueBookmarkSave(paths)
	}

	queueAll(force = false): void {
		if (!force && !this.port.canQueueFullSave()) return
		this.queueBookmarkSave()
	}

	async flushPendingSaves(requireSuccess = false): Promise<void> {
		this.terminalSaveFailure = false
		this.cancelSaveTimer()
		if (this.savePromise) await this.savePromise
		this.cancelSaveTimer()
		while (this.pendingSaves.size > 0) {
			await this.flushSaveRequests(false)
			this.cancelSaveTimer()
		}
		if (requireSuccess && this.terminalSaveFailure) {
			throw new Error(localize("providers.BookmarkSaveCoordinator.unableToSaveAllCurrentBookmarksBeforeTransferringThe"))
		}
	}

	async runImportTransaction<T>(operation: () => Promise<T>): Promise<T> {
		await this.flushPendingSaves(true)
		this.importInProgress = true
		try {
			return await operation()
		} finally {
			this.importInProgress = false
			const fullSave = this.deferredImportFullSave
			const paths = [...this.deferredImportSavePaths]
			this.deferredImportFullSave = false
			this.deferredImportSavePaths.clear()
			if (fullSave) this.queueBookmarkSave()
			else if (paths.length > 0) this.queueBookmarkSave(paths)
		}
	}

	beginStorageTransition(): void {
		this.storageTransitioning = true
		this.deferredStorageSave = false
		this.cancelSaveTimer()
	}

	finishStorageTransition(): boolean {
		this.storageTransitioning = false
		const shouldSave = this.deferredStorageSave
		this.deferredStorageSave = false
		return shouldSave
	}

	cancelStorageTransition(): void {
		this.storageTransitioning = false
		this.deferredStorageSave = false
	}

	dispose(): void {
		this.cancelSaveTimer()
	}
}
