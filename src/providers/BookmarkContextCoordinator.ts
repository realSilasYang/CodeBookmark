/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `BookmarkContextCoordinator`。
 *
 * 实现要点：协调多个端口、状态与异步阶段，明确事件顺序、取消点和最终提交时机。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`BookmarkContextFailureKind`、`BookmarkContextPort`、`BookmarkContextCoordinator`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as path from 'path'
import { Commands } from '../util/constants/Commands'
import type { AIFolderBookmarkPresence } from './AIFolderPresenceCache'

type BookmarkContextTimer = ReturnType<typeof setTimeout>

export type BookmarkContextFailureKind =
	| 'active-editor'
	| 'active-tab'
	| 'presence'
	| 'previous-ai-folder'
	| 'ai-folder-state'
	| 'ai-folder-update'

interface BookmarkContextScheduling {
	setTimer(callback: () => void, delay: number): BookmarkContextTimer
	clearTimer(timer: BookmarkContextTimer): void
}

export interface BookmarkContextPort<Uri> {
	setContext(key: string, value: unknown): unknown
	activeEditorFileUri(): Uri | undefined
	activeTabFileUri(): Uri | undefined
	workspaceFolderDirectory(): string | undefined
	isCurrentScope(uri: Uri): boolean
	filePath(uri: Uri): string
	currentBookmarkCount(): number
	hasBookmarksForUri(uri: Uri): boolean
	folderBookmarkPresence(directory: string): Promise<AIFolderBookmarkPresence>
	reportFailure(kind: BookmarkContextFailureKind, error: unknown): void
}

const defaultScheduling: BookmarkContextScheduling = {
	setTimer: (callback, delay) => setTimeout(callback, delay),
	clearTimer: timer => clearTimeout(timer),
}

export class BookmarkContextCoordinator<Uri> {
	private readonly contextValues = new Map<string, unknown>()
	private delayedEditorTimer: BookmarkContextTimer | undefined
	private contextUpdatePromise: Promise<void> | undefined
	private contextUpdateGeneration = 0
	private aiFolderUpdatePromise: Promise<void> = Promise.resolve()
	private aiFolderContextUri: string | undefined

	constructor(
		private readonly scheduling: BookmarkContextScheduling = defaultScheduling,
		private readonly editorDebounceMs = 100,
	) {}

	contextValue(key: string): unknown {
		return this.contextValues.get(key)
	}

	async setContextValue(key: string, value: unknown, port: BookmarkContextPort<Uri>): Promise<void> {
		if (Object.is(this.contextValues.get(key), value)) return
		this.contextValues.set(key, value)
		try {
			await Promise.resolve(port.setContext(key, value))
		} catch (error) {
			if (Object.is(this.contextValues.get(key), value)) this.contextValues.delete(key)
			throw error
		}
	}

	invalidateAIFolderContext(): void {
		this.aiFolderContextUri = undefined
	}

	private cancelDelayedEditorUpdate(): void {
		if (this.delayedEditorTimer) this.scheduling.clearTimer(this.delayedEditorTimer)
		this.delayedEditorTimer = undefined
	}

	handleActiveEditorChanged(
		editorFileUri: Uri | undefined,
		editorPresent: boolean,
		port: BookmarkContextPort<Uri>,
	): void {
		this.cancelDelayedEditorUpdate()
		if (editorFileUri) {
			void this.queuePresenceContexts(port)
				.catch(error => port.reportFailure('active-editor', error))
			return
		}
		if (!editorPresent && port.activeTabFileUri()) {
			void this.queuePresenceContexts(port)
				.catch(error => port.reportFailure('active-editor', error))
			return
		}
		if (port.workspaceFolderDirectory()) {
			void this.queuePresenceContexts(port)
				.catch(error => port.reportFailure('active-editor', error))
			return
		}
		this.delayedEditorTimer = this.scheduling.setTimer(() => {
			this.delayedEditorTimer = undefined
			if (port.activeEditorFileUri()) return
			void this.queuePresenceContextsNow(port)
				.catch(error => port.reportFailure('active-editor', error))
		}, this.editorDebounceMs)
	}

	handleTabsChanged(port: BookmarkContextPort<Uri>): void {
		this.cancelDelayedEditorUpdate()
		void this.queuePresenceContexts(port)
			.catch(error => port.reportFailure('active-tab', error))
	}

	queuePresenceContexts(port: BookmarkContextPort<Uri>): Promise<void> {
		const hasFileEditor = port.activeEditorFileUri() !== undefined
		const hasFileTab = port.activeTabFileUri() !== undefined
		const hasWorkspaceFolder = port.workspaceFolderDirectory() !== undefined
		if (!hasFileEditor && !hasFileTab && !hasWorkspaceFolder) {
			if (!this.delayedEditorTimer) {
				this.delayedEditorTimer = this.scheduling.setTimer(() => {
					this.delayedEditorTimer = undefined
					void this.queuePresenceContextsNow(port)
						.catch(error => port.reportFailure('active-editor', error))
				}, this.editorDebounceMs)
			}
			return Promise.resolve()
		}
		if (!hasFileEditor) return this.queuePresenceContextsNow(port)
		this.cancelDelayedEditorUpdate()
		return this.queuePresenceContextsNow(port)
	}

	private queuePresenceContextsNow(port: BookmarkContextPort<Uri>): Promise<void> {
		this.contextUpdateGeneration++
		if (!this.contextUpdatePromise) {
			const update = this.flushPresenceContexts(port)
			this.contextUpdatePromise = update
			void update.finally(() => {
				if (this.contextUpdatePromise === update) this.contextUpdatePromise = undefined
			})
		}
		return this.contextUpdatePromise
	}

	private async flushPresenceContexts(port: BookmarkContextPort<Uri>): Promise<void> {
		while (true) {
			const generation = this.contextUpdateGeneration
			try {
				await this.updatePresenceContexts(port)
			} catch (error) {
				port.reportFailure('presence', error)
			}
			if (generation === this.contextUpdateGeneration) return
		}
	}

	private async updatePresenceContexts(port: BookmarkContextPort<Uri>): Promise<void> {
		const activeFileUri = port.activeEditorFileUri() ?? port.activeTabFileUri()
		const activeFileAvailable = activeFileUri !== undefined
		const scopedFileUri = activeFileUri && port.isCurrentScope(activeFileUri)
			? activeFileUri
			: undefined
		const folderDirectory = scopedFileUri
			? path.dirname(port.filePath(scopedFileUri))
			: activeFileUri === undefined
				? port.workspaceFolderDirectory()
				: undefined
		const aiAnalysisAvailable = activeFileAvailable || folderDirectory !== undefined
		const activeFileHasBookmark = scopedFileUri ? port.hasBookmarksForUri(scopedFileUri) : false
		const folderContextUri = folderDirectory ? path.resolve(folderDirectory) : undefined
		const contextUpdates = [
			this.setContextValue(Commands.varHasBookmark, port.currentBookmarkCount() > 0, port),
			this.setContextValue(Commands.varActiveFileAvailable, activeFileAvailable, port),
			this.setContextValue(Commands.varActiveFileHasBookmark, activeFileHasBookmark, port),
			this.setContextValue(Commands.varAIAnalysisAvailable, aiAnalysisAvailable, port),
		]
		if (folderContextUri !== this.aiFolderContextUri) {
			this.aiFolderContextUri = folderContextUri
			contextUpdates.push(this.setContextValue(Commands.varCurrentFolderHasUnbookmarkedScript, false, port))
			contextUpdates.push(this.setContextValue(Commands.varCurrentFolderHasBookmarkedScript, false, port))
		}
		await Promise.all(contextUpdates)
		this.queueAIFolderPresenceContext(folderDirectory, port)
	}

	private queueAIFolderPresenceContext(directory: string | undefined, port: BookmarkContextPort<Uri>): void {
		const expectedUri = directory ? path.resolve(directory) : undefined
		const update = this.aiFolderUpdatePromise
			.catch(error => port.reportFailure('previous-ai-folder', error))
			.then(async () => {
				let presence: AIFolderBookmarkPresence = {
					hasBookmarkedScript: false,
					hasUnbookmarkedScript: false,
				}
				if (directory) {
					try {
						presence = await port.folderBookmarkPresence(directory)
					} catch (error) {
						presence = { hasBookmarkedScript: true, hasUnbookmarkedScript: true }
						port.reportFailure('ai-folder-state', error)
					}
				}

				const activeFileUri = port.activeEditorFileUri() ?? port.activeTabFileUri()
				const currentDirectory = activeFileUri && port.isCurrentScope(activeFileUri)
					? path.dirname(port.filePath(activeFileUri))
					: activeFileUri === undefined
						? port.workspaceFolderDirectory()
						: undefined
				const currentUri = currentDirectory ? path.resolve(currentDirectory) : undefined
				if (currentUri !== expectedUri) return
				await Promise.all([
					this.setContextValue(
						Commands.varCurrentFolderHasUnbookmarkedScript,
						presence.hasUnbookmarkedScript,
						port,
					),
					this.setContextValue(
						Commands.varCurrentFolderHasBookmarkedScript,
						presence.hasBookmarkedScript,
						port,
					),
				])
			})
		this.aiFolderUpdatePromise = update
		void update.catch(error => port.reportFailure('ai-folder-update', error))
	}

	dispose(): void {
		this.cancelDelayedEditorUpdate()
	}
}
