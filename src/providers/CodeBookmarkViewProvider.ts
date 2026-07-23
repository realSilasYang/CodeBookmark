/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `CodeBookmarkViewProvider`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`CodeBookmarksViewProvider`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import { Commands } from '../util/constants/Commands'
import { fileUtils } from '../util/FileUtils'
import { logger } from '../util/Logger'

import { IconPickerWebview } from '../util/quick_pick_icon/IconPickerWebview'
import { fileChangeFingerprints } from '../util/FileChangeFingerprint'
import { Bookmark, bookmarkLabelText } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'
import { workspaceOrderPersistence } from '../models/WorkspaceOrder'
import type {
	IntegrationBookmarkSnapshot,
	IntegrationBookmarkSnapshotNode,
} from '../testing/IntegrationTestTypes'
import { bookmarkRepository, type ScriptRelocationChange } from '../repository/BookmarkRepository'
import fs = require('fs')
import * as path from 'path'
import { ContextBookmark, isBookmarkItemContext } from '../util/ContextValue'
import { ExtensionConfig } from '../config/ExtensionConfig'
import { undoManager, type CapturedUndoState } from './UndoManager'
import { storageRootState } from '../util/StorageRootState'
import { transferStorageRoot } from '../repository/StorageRootTransfer'
import { bookmarkPathKey } from '../util/BookmarkPath'
import { performanceMonitor } from '../util/PerformanceMonitor'
import type { UndoAction } from '../util/UndoActions'
import type { ViewTransitionState } from '../util/ViewTransition'
import { publishViewTransition } from './ViewTransitionPublisher'
import { runViewLoadPipeline } from './ViewLoadPipeline'
import { runBackgroundEnhancements } from './BackgroundEnhancementRunner'
import { SerialTaskQueue } from '../util/SerialTaskQueue'
import {
	normalizedAbsolutePath,
} from '../util/AbsolutePath'
import { ViewLoadSession } from './ViewLoadSession'
import { finalizeViewLoad } from './ViewLoadFinalizer'
import { ensureStorageRootActive } from './StorageRootActivator'
import {
	prepareBookmarkView as runBookmarkViewPreparation,
	type PreparedBookmarkView,
	type WorkspaceOrderSnapshot,
} from './BookmarkViewPreparation'
import { commitBookmarkView } from './BookmarkViewCommitter'
import { readWorkspaceOrderForView as loadWorkspaceOrderForView } from './WorkspaceOrderViewLoader'
import { reloadExternalBookmarkFiles as runExternalBookmarkReload } from './ExternalBookmarkReloadRunner'
import { AITaskRegistry } from './AITaskRegistry'
import { AIWorkflowGuard } from './AIWorkflowGuard'
import {
	runGenerateBookmarksForFile,
	runOptimizeBookmarksForFile,
	type AIGenerationMode,
	type AISingleFileWorkflowPort,
} from './AISingleFileWorkflowRunner'
import type { AIFolderWorkflowPort } from './AIFolderWorkflowRunner'
import { BookmarkIdleViewCoordinator } from './BookmarkIdleViewCoordinator'
import { BookmarkConfigurationManagementController } from './BookmarkConfigurationManagementController'
import { AIWorkflowController } from './AIWorkflowController'
import {
	runOptimizeSelectedBookmarks,
	type AISelectedBookmarksWorkflowPort,
} from './AISelectedBookmarksWorkflowRunner'
import {
	runForceAddBookmark,
	runForceDeleteBookmark,
	runToggleBookmark,
	type ManualBookmarkWorkflowPort,
} from './ManualBookmarkWorkflowRunner'
import {
	runChangeBookmarkIcons,
	runRenameBookmark,
	runRestoreDefaultBookmarkIcons,
	runTogglePinnedBookmark,
	runUpdateBookmarkPosition,
	runUpdateBookmarkPositionAndRename,
	type BookmarkEditingWorkflowPort,
} from './BookmarkEditingWorkflowRunner'
import {
	hasInvalidBookmarks,
	runClearInvalidBookmarks,
	runDeleteBookmarks,
	type BookmarkDeletionWorkflowPort,
} from './BookmarkDeletionWorkflowRunner'
import {
	BOOKMARK_TREE_MIME_TYPE,
	publishExpandCollapseContext,
	runBookmarkTreeDrag,
	runBookmarkTreeDrop,
	runExpandFolderTreeView,
	runSearchBookmarksInActiveFile,
	runSelectBookmarkSortMode,
	runToggleExpandCollapse,
	sortBookmarkTreeItems,
	type BookmarkTreeInteractionPort,
} from './BookmarkTreeInteractionRunner'
import {
	BookmarkSaveCoordinator,
	type BookmarkSaveCoordinatorPort,
} from './BookmarkSaveCoordinator'
import {
	runImportBookmarkConfiguration,
	type BookmarkImportWorkflowPort,
} from './BookmarkImportWorkflowRunner'
import {
	BookmarkViewRefreshCoordinator,
	type BookmarkViewRefreshPort,
} from './BookmarkViewRefreshCoordinator'
import {
	BookmarkStoragePathWorkflowRunner,
	type BookmarkStoragePathWorkflowPort,
} from './BookmarkStoragePathWorkflowRunner'
import {
	applyRepositoryRelocations as applySourceRepositoryRelocations,
	runDeletedSourcePath,
	runRenamedSourcePath,
	type SourcePathChangeWorkflowPort,
} from './SourcePathChangeWorkflowRunner'
import {
	runBookmarkHistoryOperation,
	type BookmarkHistoryWorkflowPort,
} from './BookmarkHistoryWorkflowRunner'
import {
	BookmarkContextCoordinator,
	type BookmarkContextFailureKind,
	type BookmarkContextPort,
} from './BookmarkContextCoordinator'
import {
	InlineBookmarkDecorationCoordinator,
	type InlineBookmarkDecorationPort,
} from './InlineBookmarkDecorationCoordinator'
import {
	BookmarkTreeDataProjection,
	type BookmarkTreeDataProjectionPort,
} from './BookmarkTreeDataProjection'
import {
	BookmarkTreeViewLifecycle,
	type BookmarkTreeViewLifecyclePort,
} from './BookmarkTreeViewLifecycle'
import {
	BookmarkConfigWatcherCoordinator,
	type BookmarkConfigWatcherFailureKind,
	type BookmarkConfigWatcherPort,
} from './BookmarkConfigWatcherCoordinator'
import {
	BookmarkDocumentChangeCoordinator,
	type BookmarkDocumentChangePort,
} from './BookmarkDocumentChangeCoordinator'
import { CodeMarkerWorkflowController } from './CodeMarkerWorkflowController'

const LAST_STORAGE_ROOT_KEY = 'codebookmark.lastStorageRoot'

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

const TREE_RENDER_SETTLE_MS = 16

export class CodeBookmarksViewProvider implements vscode.TreeDataProvider<Bookmark>, vscode.TreeDragAndDropController<Bookmark>, vscode.Disposable {
	private _onDidChangeTreeData: vscode.EventEmitter<Bookmark | undefined | null | void> = new vscode.EventEmitter<Bookmark | undefined | null | void>()
	readonly onDidChangeTreeData: vscode.Event<Bookmark | undefined | null | void> = this._onDidChangeTreeData.event

	readonly dropMimeTypes = [BOOKMARK_TREE_MIME_TYPE]
	readonly dragMimeTypes = [BOOKMARK_TREE_MIME_TYPE]

	public codeBookmarks = new BookmarkSet()
	private workspaceOrderCache: string[] | null = null;
	private readonly bookmarkTreeDataProjection = new BookmarkTreeDataProjection<Bookmark, vscode.Uri>()
	private readonly bookmarkTreeViewLifecycle =
		new BookmarkTreeViewLifecycle<vscode.TreeView<Bookmark>, vscode.TextEditor, Bookmark, BookmarkSet>()
	private _pathIndex: Map<string, Bookmark[]> | null = null;

	public invalidatePathIndex() {
		this._pathIndex = null;
	}

	private currentScopeUri(): vscode.Uri | undefined {
		return this.currentScopeFilePath ? vscode.Uri.file(this.currentScopeFilePath) : undefined
	}

	private absoluteBookmarkPath(bookmarkPath: string): string {
		return fileUtils.relativeToAbsolute(bookmarkPath, this.currentScopeUri())
	}

	private readonly bookmarkTreeDataProjectionPortAdapter: BookmarkTreeDataProjectionPort<Bookmark, vscode.Uri> = {
		rootItems: () => this.codeBookmarks.values,
		findItem: item => this.codeBookmarks.findBookmark(item),
		childrenOf: item => item.subs.values,
		parentOf: item => item.parent,
		isFile: item => item.isFile,
		itemPath: item => item.path,
		resourceUri: item => item.resourceUri,
		setResourceUri: (item, uri) => { item.resourceUri = uri },
		createResourceUri: absolutePath => vscode.Uri.file(absolutePath),
		absoluteBookmarkPath: bookmarkPath => this.absoluteBookmarkPath(bookmarkPath),
		relativeBookmarkPath: absolutePath => fileUtils.absoluteToRelative(absolutePath),
		isWorkspaceScope: () => this.currentStorageScope?.startsWith('workspace:') === true,
		currentScopeFilePath: () => this.currentScopeFilePath,
		workspaceOrder: () => this.workspaceOrderCache,
		setWorkspaceOrder: order => { this.workspaceOrderCache = order },
		persistWorkspaceOrder: order => {
			const folder = fileUtils.getGlobalBookmarkFolder(true, this.currentScopeUri())
			if (!folder) return
			const orderFile = path.join(folder, '_workspace_order.json')
			void fileUtils.writeJsonFileAsync(orderFile, workspaceOrderPersistence(order)).then(success => {
				if (!success) logger.showWarningMessage(localize(
					'无法保存工作区文件排序，请检查书签存储路径权限。',
					'Unable to save the workspace file order. Check bookmark storage-folder permissions.',
				))
			})
		},
		sortItems: items => sortBookmarkTreeItems(items),
		refreshItem: item => item.refreshDisplayProps(),
		resolveTreePopulation: () => this.resolvePendingTreePopulation(this.viewLoadGeneration),
	}

	private bookmarkTreeDataProjectionPort(): BookmarkTreeDataProjectionPort<Bookmark, vscode.Uri> {
		return this.bookmarkTreeDataProjectionPortAdapter
	}

	private readonly bookmarkTreeViewLifecyclePortAdapter: BookmarkTreeViewLifecyclePort<
		vscode.TreeView<Bookmark>,
		vscode.TextEditor,
		Bookmark,
		BookmarkSet
	> = {
		isDisposed: () => this.disposed,
		currentTreeView: () => this.treeView,
		setLoadingMessage: treeView => { treeView.message = localize('正在加载书签…', 'Loading bookmarks…') },
		reportSlowInitialLoad: warningMs =>
			logger.error(localize(
				`书签初始化已超过 ${warningMs / 1000} 秒；扩展已正常启动，数据仍在后台加载。`,
				`Bookmark initialization has taken more than ${warningMs / 1000} seconds. The extension started normally and data is still loading in the background.`,
			)),
		setSlowLoadingMessage: treeView => { treeView.message = localize('书签加载时间较长，仍在后台继续…', 'Bookmarks are taking longer to load and will continue in the background…') },
		clearInitialLoadMessage: treeView => { treeView.message = undefined },
		reportInitialLoadFailure: error => logger.error(localize(
			`初始化书签视图失败: ${errorMessage(error)}`,
			`Failed to initialize the bookmark view: ${errorMessage(error)}`,
		)),
		setInitialLoadFailureMessage: treeView => {
			treeView.message = localize(
				'书签初始化失败，请查看“CodeBookmark”输出。',
				'Bookmark initialization failed. See the "CodeBookmark" output for details.',
			)
		},
		isWorkspaceScope: () => this.currentStorageScope?.startsWith('workspace:') === true,
		currentViewLoadGeneration: () => this.viewLoadGeneration,
		treeVisible: () => this.treeView?.visible === true,
		bookmarkPathForEditor: editor => fileUtils.absoluteToRelative(editor.document.uri.fsPath),
		hasFileNode: bookmarkPath => this.bookmarkTreeDataProjection.hasFileNode(bookmarkPath),
		fileNode: bookmarkPath => this.bookmarkTreeDataProjection.fileNode(bookmarkPath),
		activeEditorMatches: editor => {
			const activeUri = vscode.window.activeTextEditor?.document.uri
			return activeUri?.scheme === 'file'
				&& normalizedAbsolutePath(activeUri.fsPath) === normalizedAbsolutePath(editor.document.uri.fsPath)
		},
		treeViewAvailable: () => this.treeView !== undefined,
		currentBookmarkState: () => this.codeBookmarks,
		findBookmark: bookmark => this.codeBookmarks.findBookmark(bookmark),
		revealNode: node => {
			void this.treeView?.reveal(node, { expand: true, select: false, focus: false })
		},
	}

	private bookmarkTreeViewLifecyclePort(): BookmarkTreeViewLifecyclePort<
		vscode.TreeView<Bookmark>,
		vscode.TextEditor,
		Bookmark,
		BookmarkSet
	> {
		return this.bookmarkTreeViewLifecyclePortAdapter
	}

	public getBookmarksByPath(pathStr: string): Bookmark[] {
		if (this._pathIndex === null) {
			this._pathIndex = new Map();
			const buildIndex = (bms: BookmarkSet) => {
				for (const b of bms.values) {
					if (b.path && !b.isFile) {
						const key = bookmarkPathKey(b.path)
						let arr = this._pathIndex!.get(key);
						if (!arr) {
							arr = [];
							this._pathIndex!.set(key, arr);
						}
						arr.push(b);
					}
					if (b.subs.size > 0) {
						buildIndex(b.subs);
					}
				}
			};
			buildIndex(this.codeBookmarks);
		}
		return this._pathIndex.get(bookmarkPathKey(pathStr)) || [];
	}

	private context: vscode.ExtensionContext
	private readonly configurationManagementController: BookmarkConfigurationManagementController
	private readonly bookmarkContextCoordinator = new BookmarkContextCoordinator<vscode.Uri>()
	private readonly inlineBookmarkDecorationCoordinator =
		new InlineBookmarkDecorationCoordinator<vscode.TextEditor, Bookmark, vscode.DecorationOptions>()
	private readonly inlineBookmarkDecorationPortAdapter: InlineBookmarkDecorationPort<
		vscode.TextEditor,
		Bookmark,
		vscode.DecorationOptions
	> = {
		isEligible: editor =>
			editor.document.uri.scheme === 'file' && this.uriMatchesCurrentScope(editor.document.uri),
		labelsEnabled: () => ExtensionConfig.inlineLabel,
		documentKey: editor => editor.document.uri.toString(),
		documentVersion: editor => editor.document.version,
		cursorLine: editor => editor.selection.active.line,
		candidatesForEditor: editor =>
			this.getBookmarksByPath(fileUtils.absoluteToRelative(editor.document.uri.fsPath)),
		candidateLine: bookmark => bookmark.start.line,
		candidateLabel: bookmark => bookmark.label,
		isInvalidCandidate: bookmark => bookmark.contextValue === ContextBookmark.BookmarkInvalid,
		createDecoration: (editor, line, label) => {
			const lineEnd = editor.document.lineAt(line).range.end
			return {
				range: new vscode.Range(lineEnd.line, lineEnd.character, lineEnd.line, lineEnd.character),
				renderOptions: {
					after: { contentText: `  • ${label}` },
				},
			}
		},
		setDecorations: (editor, decorations) =>
			editor.setDecorations(this._inlineLabelDecorationType, decorations),
	}
	private readonly aiWorkflowController = new AIWorkflowController({
		bookmarkRoots: () => this.codeBookmarks.values,
		bookmarksForPath: bookmarkPath => this.getBookmarksByPath(bookmarkPath),
		ensureEditorScope: editor => this.ensureEditorScope(editor),
		workspaceFolderRootForCurrentScope: () => this.workspaceFolderRootForCurrentScope(),
		storageScopeForUri: uri => this.storageScopeForUri(uri),
		refreshScope: storageScope => this.refresh(undefined, storageScope),
		folderWorkflowPort: () => this.aiFolderWorkflowPort(),
	})

	private setContextValue(key: string, value: unknown): Promise<void> {
		return this.bookmarkContextCoordinator.setContextValue(key, value, this.bookmarkContextPort())
	}

	private activeTabFileUri(): vscode.Uri | undefined {
		const input = vscode.window.tabGroups?.activeTabGroup?.activeTab?.input
		if (input instanceof vscode.TabInputText) {
			return input.uri.scheme === 'file' ? input.uri : undefined
		}
		if (input instanceof vscode.TabInputTextDiff) {
			if (input.modified.scheme === 'file') return input.modified
			return input.original.scheme === 'file' ? input.original : undefined
		}
		return undefined
	}

	private hasOpenFileTab(): boolean {
		return (vscode.window.tabGroups?.all ?? []).some(group => group.tabs.some(tab => {
			const input = tab.input
			if (input instanceof vscode.TabInputText) return input.uri.scheme === 'file'
			if (input instanceof vscode.TabInputTextDiff) {
				return input.original.scheme === 'file' || input.modified.scheme === 'file'
			}
			return false
		}))
	}

	private workspaceFolderRootForCurrentScope(): string | undefined {
		const folders = (vscode.workspace.workspaceFolders ?? [])
			.filter(folder => folder.uri.scheme === 'file')
		if (folders.length === 0) return undefined
		if (this.currentStorageScope?.startsWith('workspace:')) {
			const currentFolder = folders.find(folder =>
				`workspace:${normalizedAbsolutePath(folder.uri.fsPath)}` === this.currentStorageScope)
			if (currentFolder) return currentFolder.uri.fsPath
		}
		return folders[0].uri.fsPath
	}

	private readonly bookmarkContextPortAdapter: BookmarkContextPort<vscode.Uri> = {
		setContext: (key, value) => vscode.commands.executeCommand('setContext', key, value),
		activeEditorFileUri: () => {
			const uri = vscode.window.activeTextEditor?.document.uri
			return uri?.scheme === 'file' ? uri : undefined
		},
		activeTabFileUri: () => this.activeTabFileUri(),
		workspaceFolderDirectory: () => this.workspaceFolderRootForCurrentScope(),
		isCurrentScope: uri => this.uriMatchesCurrentScope(uri),
		filePath: uri => uri.fsPath,
		currentBookmarkCount: () => this.codeBookmarks.size,
		hasBookmarksForUri: uri =>
			this.getBookmarksByPath(fileUtils.absoluteToRelative(uri.fsPath)).length > 0,
		folderBookmarkPresence: directory => this.aiWorkflowController.folderBookmarkPresence(directory),
		reportFailure: (kind, error) => this.reportBookmarkContextFailure(kind, error),
	}

	private bookmarkContextPort(): BookmarkContextPort<vscode.Uri> {
		return this.bookmarkContextPortAdapter
	}

	private reportBookmarkContextFailure(kind: BookmarkContextFailureKind, error: unknown): void {
		const messages: Record<BookmarkContextFailureKind, string> = {
			'active-editor': localize('更新活动编辑器命令状态失败', 'Failed to update active-editor command state'),
			'active-tab': localize('更新活动标签页上下文失败', 'Failed to update active-tab context'),
			'presence': localize('更新书签显示上下文失败', 'Failed to update bookmark display context'),
			'previous-ai-folder': localize('上一次 AI 菜单上下文更新失败', 'Failed to update the previous AI menu context'),
			'ai-folder-state': localize('更新 AI 文件夹菜单状态失败', 'Failed to update AI folder menu state'),
			'ai-folder-update': localize('更新 AI 菜单上下文失败', 'Failed to update AI menu context'),
		}
		logger.error(`${messages[kind]}: ${errorMessage(error)}`)
	}

	private inlineBookmarkDecorationPort(): InlineBookmarkDecorationPort<
		vscode.TextEditor,
		Bookmark,
		vscode.DecorationOptions
	> {
		return this.inlineBookmarkDecorationPortAdapter
	}

	private readonly aiTaskRegistry = new AITaskRegistry()
	private readonly aiWorkflowGuard = new AIWorkflowGuard({
		currentStorageScope: () => this.currentStorageScope,
		bookmarksForPath: pathRel => this.getBookmarksByPath(pathRel),
	})
	private reconciliationAttemptedPaths = new Set<string>()
	private readonly codeMarkerWorkflow = new CodeMarkerWorkflowController({
		bookmarks: () => this.codeBookmarks,
		currentScopeUri: () => this.currentScopeUri(),
		currentStorageScope: () => this.currentStorageScope,
		currentViewGeneration: () => this.viewLoadGeneration,
		loadingViewGeneration: () => this.loadingViewGeneration,
		isCurrentScope: uri => this.uriMatchesCurrentScope(uri),
		isDisposed: () => this.disposed,
		absoluteBookmarkPath: bookmarkPath => this.absoluteBookmarkPath(bookmarkPath),
		storageScopeForUri: uri => this.storageScopeForUri(uri),
		invalidatePathIndex: () => this.invalidatePathIndex(),
		saveBookmarks: absolutePaths => this.saveBookmarksToFile(absolutePaths),
		refreshDecorations: () => this.refreshDecoration(),
	})
	private readonly bookmarkDocumentChangeCoordinator =
		new BookmarkDocumentChangeCoordinator<vscode.TextDocument, vscode.Uri, BookmarkSet>()
	private readonly viewLoads = new ViewLoadSession()
	private readonly viewRefreshCoordinator = new BookmarkViewRefreshCoordinator()
	private readonly viewPreparationQueue = new SerialTaskQueue()
	private get viewLoadGeneration(): number {
		return this.viewLoads.generation
	}

	private get loadingViewGeneration(): number | undefined {
		return this.viewLoads.loadingGeneration
	}

	public onSourceFilesChanged(): void {
		this.aiWorkflowController.invalidateSourceFiles()
		this.bookmarkContextCoordinator.invalidateAIFolderContext()
		this.reconciliationAttemptedPaths.clear()
		this.codeMarkerWorkflow.sourceFilesChanged()
		void this.queueBookmarkPresenceContexts()
	}

	private cancelPendingPathWork(absolutePath: string): void {
		const bookmarkPath = fileUtils.absoluteToRelative(absolutePath)
		this.bookmarkDocumentChangeCoordinator.cancelBookmarkPath(bookmarkPath)
		this.codeMarkerWorkflow.cancelPath(absolutePath)
	}

	private sourcePathChangeWorkflowPort(): SourcePathChangeWorkflowPort {
		return {
			isDisposed: () => this.disposed,
			bookmarks: () => this.codeBookmarks,
			currentStorageScope: () => this.currentStorageScope,
			setCurrentStorageScope: scope => { this.currentStorageScope = scope },
			currentScopeFilePath: () => this.currentScopeFilePath,
			setCurrentScopeFilePath: filePath => { this.currentScopeFilePath = filePath },
			workspaceOrder: () => this.workspaceOrderCache,
			setWorkspaceOrder: order => { this.workspaceOrderCache = order },
			absoluteToRelative: absolutePath => fileUtils.absoluteToRelative(absolutePath),
			absoluteBookmarkPath: bookmarkPath => this.absoluteBookmarkPath(bookmarkPath),
			storageScopeForAbsolutePath: absolutePath => this.storageScopeForUri(vscode.Uri.file(absolutePath)),
			cancelPendingPathWork: absolutePath => this.cancelPendingPathWork(absolutePath),
			relocateUndoPath: (oldScope, newScope, oldBookmarkPath, newBookmarkPath, oldAbsolutePath, newAbsolutePath) =>
				undoManager.relocatePath(
					oldScope,
					newScope,
					oldBookmarkPath,
					newBookmarkPath,
					oldAbsolutePath,
					newAbsolutePath,
				),
			saveBookmarks: filePaths => this.saveBookmarksToFile(filePaths),
			refreshDecoration: () => this.refreshDecoration(),
			refresh: storageScope => this.refresh(undefined, storageScope, true),
			reloadActiveTab: forceReloadDisk => this.reloadActiveTab(forceReloadDisk),
			invalidatePathIndex: () => this.invalidatePathIndex(),
			clearFileNodeCache: () => this.bookmarkTreeDataProjection.clearFileNodeCache(),
			fireTreeChanged: () => this._onDidChangeTreeData.fire(),
			sourceFilesChanged: () => this.onSourceFilesChanged(),
		}
	}

	/**
	 * 把仓库层重绑定结果同步到内存树。文件系统提供器可能把移动报告成“删除＋创建”，
	 * 因而仓库会在未经过 onRenameDirectory 的情况下更新持久脚本绑定。
	 * 此处保留桥接可防止后续内存保存把旧路径重新写回磁盘。
	 */
	async applyRepositoryRelocations(changes: readonly ScriptRelocationChange[]): Promise<void> {
		return applySourceRepositoryRelocations(changes, this.sourcePathChangeWorkflowPort())
	}

	public async syncCodeMarkersInDocument(document: vscode.TextDocument): Promise<boolean> {
		return this.codeMarkerWorkflow.syncDocument(document)
	}

	public async syncCodeMarkersForUris(uris: readonly vscode.Uri[]): Promise<void> {
		await this.codeMarkerWorkflow.syncUris(uris)
	}

	public scheduleCodeMarkerFileSync(uri: vscode.Uri, deleted = false): void {
		this.codeMarkerWorkflow.scheduleFileSync(uri, deleted)
	}

	private setupCodeMarkerFileWatchers(): void {
		this.codeMarkerWorkflow.setupFileWatchers()
	}

	private async reloadCodeMarkerLanguageProfiles(): Promise<void> {
		await this.codeMarkerWorkflow.reloadLanguageProfiles()
	}

	private async synchronizeOpenCodeMarkerDocuments(): Promise<void> {
		await this.codeMarkerWorkflow.synchronizeOpenDocuments()
	}

	private documentLines(document: vscode.TextDocument): string[] {
		return Array.from({ length: document.lineCount }, (_, line) => document.lineAt(line).text)
	}

	private synchronizeCodeMarkerSnapshot(uri: vscode.Uri, lines: readonly string[], languageId?: string) {
		return this.codeMarkerWorkflow.synchronizeMarkerSnapshot(uri, lines, languageId)
	}

	private persistCodeMarkerChanges(changedPaths: readonly string[]): void {
		this.codeMarkerWorkflow.persistMarkerChanges(changedPaths)
	}

	private scheduleWorkspaceCodeMarkerScan(): void {
		this.codeMarkerWorkflow.scheduleWorkspaceScan()
	}

	public constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.configurationManagementController = new BookmarkConfigurationManagementController(context, {
			storageRoot: () => storageRootState.root,
			flushPendingSaves: requireSuccess => this.flushPendingSaves(requireSuccess),
			beginStorageTransition: () => this.saveCoordinator.beginStorageTransition(),
			finishStorageTransition: () => this.saveCoordinator.finishStorageTransition(),
			cancelStorageTransition: () => this.saveCoordinator.cancelStorageTransition(),
			saveAllBookmarks: () => this.saveAllBookmarksToFile(),
			reloadActiveTab: forceReloadDisk => this.reloadActiveTab(forceReloadDisk),
		})
		const extensionChangeListener = vscode.extensions.onDidChange(() => {
			void this.reloadCodeMarkerLanguageProfiles()
				.catch(error => logger.error(localize(`刷新语言注释配置失败: ${errorMessage(error)}`, `Failed to refresh language comment configurations: ${errorMessage(error)}`)))
		})

		// 创建行尾幽灵文本装饰类型，用于显示当前行的书签标签。
		this._inlineLabelDecorationType = vscode.window.createTextEditorDecorationType({
			after: {
				color: new vscode.ThemeColor('editorCodeLens.foreground'),
				fontStyle: 'italic',
				textDecoration: 'none; opacity: 0.85; margin-left: 2ch; font-size: 90%; font-family: "LXGW WenKai", "霞鹜文楷", sans-serif;'
			}
		});
		context.subscriptions.push(this._inlineLabelDecorationType, extensionChangeListener)
		context.subscriptions.push(this)
	}

	public treeView?: vscode.TreeView<Bookmark>;

	// 复用单个行内幽灵文本装饰实例，避免每次光标移动都创建主题资源。
	private _inlineLabelDecorationType: vscode.TextEditorDecorationType;

	init(treeView: vscode.TreeView<Bookmark>): void {
		this.treeView = treeView;
		const selectionListener = treeView.onDidChangeSelection((event) => {
			const hasSelection = event.selection && event.selection.length > 0 && event.selection.some(e => isBookmarkItemContext(e.contextValue));
			void this.setContextValue('codebookmark.hasSelection', hasSelection)
				.catch(error => logger.error(localize(`更新书签选择上下文失败: ${errorMessage(error)}`, `Failed to update bookmark selection context: ${errorMessage(error)}`)));
		});

		// 监听光标与活动编辑器变化，及时刷新行内幽灵文本及当前文件上下文。
		const cursorListener = vscode.window.onDidChangeTextEditorSelection(e => {
			this.updateInlineDecoration(e.textEditor);
		});
		const editorListener = vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				this.updateInlineDecoration(editor);
			}
			const editorFileUri = editor?.document.uri.scheme === 'file'
				? editor.document.uri
				: undefined
			this.bookmarkContextCoordinator.handleActiveEditorChanged(
				editorFileUri,
				editor !== undefined,
				this.bookmarkContextPort(),
			)
			void this.synchronizeIdleView()
				.catch(error => logger.error(localize(
					`同步无活动脚本时的书签视图失败: ${errorMessage(error)}`,
					`Failed to synchronize the bookmark view when no script is active: ${errorMessage(error)}`,
				)))
		});
		const tabListener = vscode.window.tabGroups.onDidChangeTabs(() => {
			this.bookmarkContextCoordinator.handleTabsChanged(this.bookmarkContextPort())
			void this.synchronizeIdleView()
				.catch(error => logger.error(localize(
					`同步脚本标签页变化后的书签视图失败: ${errorMessage(error)}`,
					`Failed to synchronize the bookmark view after script tabs changed: ${errorMessage(error)}`,
				)))
		})
		this.context.subscriptions.push(selectionListener, cursorListener, editorListener, tabListener)

		// 此时 TreeDataProvider 已注册完成。磁盘访问有意与扩展激活解耦，
		// 避免慢速或网络存储根目录导致 VS Code 激活超时，或让 getChildren() 长期未决。
		this.bookmarkTreeViewLifecycle.startInitialLoad(treeView, this.bookmarkTreeViewLifecyclePort())

		void this.initViewEditor()
			.then(() => {
				if (this.bookmarkContextCoordinator.contextValue(Commands.varBookmarkLoaded) === true) {
					this.finishInitialLoad()
				}
			})
			.catch(error => this.finishInitialLoad(error))
	}

	private finishInitialLoad(error?: unknown): void {
		this.bookmarkTreeViewLifecycle.finishInitialLoad(error, this.bookmarkTreeViewLifecyclePort())
	}

	getParent(element: Bookmark): Bookmark | undefined {
		return this.bookmarkTreeDataProjection.parent(element, this.bookmarkTreeDataProjectionPort())
	}

	private standaloneRootBookmarks(): Bookmark[] {
		return this.bookmarkTreeDataProjection.standaloneRoots(this.bookmarkTreeDataProjectionPort())
	}

	getChildren(element?: Bookmark): Bookmark[] {
		try {
			return this._getChildrenInternal(element);
		} catch (error: unknown) {
			const details = error instanceof Error ? error.stack ?? error.message : String(error)
			logger.error(localize(`获取书签树子节点失败: ${details}`, `Error in getChildren: ${details}`));
			return [];
		}
	}

	private _getChildrenInternal(element?: Bookmark): Bookmark[] {
		return this.bookmarkTreeDataProjection.children(element, this.bookmarkTreeDataProjectionPort())
	}

	getTreeItem(element: Bookmark): vscode.TreeItem {
		return this.bookmarkTreeDataProjection.treeItem(element, this.bookmarkTreeDataProjectionPort())
	}

	// 拖放只负责把 VS Code 数据传输对象交给纯工作流，实际层级规则由下层统一验证。
	handleDrag(source: Bookmark[], treeDataTransfer: vscode.DataTransfer): void {
		runBookmarkTreeDrag(source, treeDataTransfer)
	}

	async handleDrop(target: Bookmark | undefined, treeDataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
		return runBookmarkTreeDrop(target, treeDataTransfer, this.bookmarkTreeInteractionPort())
	}
	private readonly configWatcherCoordinator = new BookmarkConfigWatcherCoordinator<WorkspaceOrderSnapshot>()
	private readonly idleViewCoordinator = new BookmarkIdleViewCoordinator()
	private disposed = false

	private synchronizeIdleView(): Promise<void> {
		return this.idleViewCoordinator.handle({
			hasActiveFileEditor: () => vscode.window.activeTextEditor?.document.uri.scheme === 'file',
			hasOpenFileTab: () => this.hasOpenFileTab(),
			workspaceRoot: () => this.workspaceFolderRootForCurrentScope(),
			workspaceScope: workspaceRoot => this.storageScopeForUri(vscode.Uri.file(workspaceRoot)),
			currentStorageScope: () => this.currentStorageScope,
			currentScopeFilePath: () => this.currentScopeFilePath,
			currentBookmarkCount: () => this.codeBookmarks.size,
			refresh: (storageScope, forceReloadDisk) =>
				this.refresh(undefined, storageScope, forceReloadDisk),
			queuePresenceContexts: () => this.queueBookmarkPresenceContexts(),
		})
	}

	private async reloadExternalBookmarkFiles(fileNames: readonly string[]): Promise<void> {
		const scope = this.currentStorageScope
		const generation = this.viewLoadGeneration
		const signal = this.viewLoadSignal(generation)
		await runExternalBookmarkReload(fileNames, scope, this.currentScopeFilePath, generation, signal, {
			enqueue: (candidateGeneration, operation) => this.enqueueViewPreparation(candidateGeneration, operation),
			readBookmarks: (activePaths, filenames, candidateSignal) => bookmarkRepository.readBookmarksFromFile(
				[...activePaths],
				[...filenames],
				candidateSignal,
			),
			isCurrent: (candidateScope, candidateGeneration) => !this.disposed
				&& candidateScope === this.currentStorageScope
				&& candidateGeneration === this.viewLoadGeneration,
			currentBookmarks: () => this.codeBookmarks,
			clearExternalBookmarkCaches: () => {
				this.bookmarkTreeDataProjection.clearFileNodeCache()
				this.invalidatePathIndex()
			},
			publishTransition: (transition, candidateGeneration) => this.publishCommittedViewTransition(transition, candidateGeneration),
			refreshDecorations: () => this.refreshDecoration(false, false),
		})
	}

	private rebasePendingSavesToCurrentTree(): void {
		this.saveCoordinator.rebasePendingSaves([...this.codeBookmarks.values])
	}

	private setupConfigWatcher(generation = this.viewLoadGeneration): Promise<void> {
		return this.configWatcherCoordinator.setup(generation, this.configWatcherCoordinatorPort())
	}

	private configWatcherCoordinatorPort(): BookmarkConfigWatcherPort<WorkspaceOrderSnapshot> {
		return {
			isDisposed: () => this.disposed,
			currentGeneration: () => this.viewLoadGeneration,
			currentScope: () => this.currentStorageScope,
			watchDirectories: () => {
				const scriptFolder = fileUtils.getScriptStoreFolder()
				const scopeUri = this.currentScopeUri()
				const workspaceFolder = fileUtils.isWorkspaceMode(scopeUri)
					? fileUtils.getGlobalBookmarkFolder(true, scopeUri)
					: null
				return { scriptFolder, workspaceFolder }
			},
			isSaving: () => this.saveCoordinator.isSaving,
			collectExternalChanges: directory => fileChangeFingerprints.collectExternalChanges(directory),
			hasExternalChange: (directory, filename) =>
				fileChangeFingerprints.hasExternalChange(directory, filename),
			sameDirectory: (left, right) => normalizedAbsolutePath(left) === normalizedAbsolutePath(right),
			readWorkspaceOrder: (scope, generation) => this.readWorkspaceOrderForView(
				this.codeBookmarks,
				scope,
				this.currentScopeFilePath,
				this.viewLoadSignal(generation),
			),
			applyWorkspaceOrder: (snapshot, scope, generation) => {
				this.workspaceOrderCache = snapshot.order
				this._onDidChangeTreeData.fire()
				this.persistWorkspaceOrderSnapshot(snapshot, scope, generation)
			},
			reloadExternalBookmarkFiles: fileNames => this.reloadExternalBookmarkFiles(fileNames),
			rebasePendingSaves: () => this.rebasePendingSavesToCurrentTree(),
			isDirectory: async directory => {
				try { return (await fs.promises.stat(directory)).isDirectory() } catch { return false }
			},
			rememberDirectory: directory => fileChangeFingerprints.rememberDirectory(directory),
			watchDirectory: (directory, onFileChange, onError) => {
				const watcher = fs.watch(directory, (_eventType, rawFilename) => {
					onFileChange(rawFilename === null ? null : rawFilename.toString())
				})
				watcher.on('error', onError)
				return watcher
			},
			reportFailure: (kind, error, directory) =>
				this.reportConfigWatcherFailure(kind, error, directory),
		}
	}

	private reportConfigWatcherFailure(
		kind: BookmarkConfigWatcherFailureKind,
		error: unknown,
		directory?: string,
	): void {
			switch (kind) {
			case 'delayed-processing':
				logger.error(localize(`延迟处理书签配置变更失败: ${errorMessage(error)}`, `Delayed bookmark configuration change processing failed: ${errorMessage(error)}`))
				return
			case 'processing':
				logger.error(localize(`处理书签配置变更失败: ${errorMessage(error)}`, `Bookmark configuration change processing failed: ${errorMessage(error)}`))
				return
			case 'classification':
				logger.error(localize(
					`比对书签配置变更失败（${directory}）: ${errorMessage(error)}`,
					`Failed to classify bookmark configuration changes (${directory}): ${errorMessage(error)}`,
				))
				return
			case 'setup':
				logger.error(localize('设置书签配置监听器失败: ', 'Failed to set up the bookmark configuration watcher: ') + error)
				return
			case 'watcher':
				logger.error(localize(
					`书签配置监听器失败（${directory}）: ${errorMessage(error)}`,
					`Bookmark configuration watcher failed (${directory}): ${errorMessage(error)}`,
				))
		}
	}

	private async initializeBackgroundEnhancements(
		languageProfilesReady: Promise<void>,
		scope: string | undefined,
		viewGeneration: number,
	): Promise<void> {
		const startedAt = performanceMonitor.start()
		await runBackgroundEnhancements(languageProfilesReady, scope, viewGeneration, startedAt, {
			isCurrent: (candidateScope, candidateGeneration) => !this.disposed
				&& candidateScope !== undefined
				&& this.currentStorageScope === candidateScope
				&& this.viewLoadGeneration === candidateGeneration,
			setupCodeMarkerFileWatchers: () => this.setupCodeMarkerFileWatchers(),
			synchronizeOpenCodeMarkerDocuments: () => this.synchronizeOpenCodeMarkerDocuments(),
			scheduleWorkspaceCodeMarkerScan: () => this.scheduleWorkspaceCodeMarkerScan(),
			reportFailure: error => logger.error(localize(
				`后台书签增强初始化失败: ${errorMessage(error)}`,
				`Background bookmark enhancement initialization failed: ${errorMessage(error)}`,
			)),
			measure: (started, candidateScope) => performanceMonitor.measure('bookmark-view-background-enhancement', started, {
				scope: candidateScope ?? 'none',
				bookmarks: this.codeBookmarks.size,
			}),
		})
	}

	private enqueueViewPreparation<T>(generation: number, operation: () => Promise<T>): Promise<T | undefined> {
		return this.viewPreparationQueue.run(async () => {
			if (generation !== this.viewLoadGeneration || this.disposed) return undefined
			return operation()
		})
	}

	private beginViewLoad(): number {
		this.bookmarkTreeViewLifecycle.resolvePopulation()
		return this.viewLoads.begin()
	}

	private viewLoadSignal(generation: number): AbortSignal | undefined {
		return this.viewLoads.signalFor(generation)
	}

	async initViewEditor(
		scopePathOverride?: string,
		preserveLoadedContext = false,
		generation = this.beginViewLoad(),
		expectedScope?: string,
	): Promise<void> {
		const initializationStartedAt = performanceMonitor.start()
		const languageProfilesReady = this.codeMarkerWorkflow.initializeLanguageProfiles()
		if (generation !== this.viewLoadGeneration || this.disposed) return
		this.viewLoads.markLoading(generation)
		try {
			if (!preserveLoadedContext) await this.setContextValue(Commands.varBookmarkLoaded, false)
			await this.setContextValue(Commands.varBookmarkLoadFailed, false)
		} catch (error) {
			logger.error(localize(`设置书签加载状态失败: ${errorMessage(error)}`, `Failed to set bookmark loading state: ${errorMessage(error)}`))
		}
		const signal = this.viewLoadSignal(generation)
		const pipeline = await runViewLoadPipeline(generation, {
			isCurrent: () => generation === this.viewLoadGeneration && !this.disposed,
			enqueue: operation => this.enqueueViewPreparation(generation, operation),
			ensureStorageRoot: () => this.ensureActiveStorageRoot(),
			prepare: () => this.prepareBookmarkView(scopePathOverride, expectedScope, signal),
			empty: () => this.emptyPreparedBookmarkView(scopePathOverride, expectedScope),
			commit: next => this.commitPreparedBookmarkView(next),
			publish: (next, candidateGeneration) => this.publishCommittedViewTransition(next, candidateGeneration),
			reportFailure: error => logger.error(localize(`加载书签数据失败: ${errorMessage(error)}`, `Failed to load bookmark data: ${errorMessage(error)}`)),
		})
		if (pipeline.cancelled) return
		await finalizeViewLoad({
			generation,
			preserveLoadedContext,
			initializationStartedAt,
			storageReady: pipeline.storageReady,
			prepared: pipeline.prepared,
			transition: pipeline.transition,
			loadFailure: pipeline.loadFailure,
		}, {
			isCurrent: candidateGeneration => candidateGeneration === this.viewLoadGeneration && !this.disposed,
			setLoadFailedContext: failed => this.setContextValue(Commands.varBookmarkLoadFailed, failed),
			setLoadedContext: () => this.setContextValue(Commands.varBookmarkLoaded, true),
			reportContextFailure: error => logger.error(localize(`结束书签加载状态失败: ${errorMessage(error)}`, `Failed to finalize bookmark loading state: ${errorMessage(error)}`)),
			refreshDecorations: () => this.refreshDecoration(false, false),
			saveAllBookmarks: () => this.saveAllBookmarksToFile(),
			persistWorkspaceOrder: (prepared, candidateGeneration) => this.persistWorkspaceOrderSnapshot({
				order: prepared.workspaceOrder,
				filePath: prepared.workspaceOrderFilePath,
				needsPersist: prepared.workspaceOrderNeedsPersist,
			}, prepared.storageScope, candidateGeneration),
			startConfigWatcher: candidateGeneration => {
				void this.setupConfigWatcher(candidateGeneration)
					.catch(error => logger.error(localize(`设置书签配置监听器失败: ${errorMessage(error)}`, `Failed to set up the bookmark configuration watcher: ${errorMessage(error)}`)))
			},
			// 磁盘书签数据是启动主路径；语言配置与自动标记对账可在书签树可交互后后台执行。
			startBackgroundEnhancements: candidateGeneration => {
				void this.initializeBackgroundEnhancements(
					languageProfilesReady,
					this.currentStorageScope,
					candidateGeneration,
				)
			},
			closeConfigWatchers: () => this.configWatcherCoordinator.closeWatchers(),
			finishLoading: candidateGeneration => this.viewLoads.finishLoading(candidateGeneration),
			measure: (startedAt, failed) => performanceMonitor.measure('bookmark-view-initialization', startedAt, {
				bookmarks: this.codeBookmarks.size,
				heapMiB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
				failed,
			}),
			finishInitialLoad: error => this.finishInitialLoad(error),
		})
	}

	private async ensureActiveStorageRoot(): Promise<boolean> {
		return ensureStorageRootActive({
			rememberedRoot: () => this.context.globalState.get<string>(LAST_STORAGE_ROOT_KEY),
			ensureConfigured: () => ExtensionConfig.ensureGlobalStoragePathConfigured(),
			configuredRoot: () => ExtensionConfig.resolveStoragePath(),
			activeRoot: () => storageRootState.root,
			rootExists: root => fs.existsSync(root),
			sameRoot: (left, right) => normalizedAbsolutePath(left) === normalizedAbsolutePath(right),
			transferRoot: async (source, target) => { await transferStorageRoot(source, target) },
			activateRoot: root => storageRootState.activate(root),
			rememberRoot: async root => { await this.context.globalState.update(LAST_STORAGE_ROOT_KEY, root) },
			warnRememberedFallback: () => logger.showWarningMessage(localize(
				'当前书签存储路径无效，已继续使用上次验证成功的目录。',
				'The current bookmark storage path is invalid. Continuing with the last successfully verified folder.',
			)),
			reportTransferFailure: error => logger.error(localize(`启动时转移书签存储目录失败: ${errorMessage(error)}`, `Failed to transfer the bookmark storage folder during startup: ${errorMessage(error)}`)),
			showTransferFailure: error => {
				void vscode.window.showErrorMessage(localize(
					`目标书签存储目录尚未启用，已继续使用来源目录：${errorMessage(error)}`,
					`The target bookmark storage folder was not activated. Continuing with the source folder: ${errorMessage(error)}`,
				))
			},
			reportPostTransferFailure: error => logger.error(localize(`书签存储目录已转移，但记录新目录失败: ${errorMessage(error)}`, `The bookmark storage folder was transferred, but recording the new folder failed: ${errorMessage(error)}`)),
			showPostTransferFailure: error => {
				void vscode.window.showErrorMessage(localize(
					`书签存储目录已转移且原目录已清理，但记录新目录失败；当前继续使用新目录：${errorMessage(error)}`,
					`The bookmark storage folder was transferred and the old folder was cleaned, but recording the new folder failed. Continuing with the new folder: ${errorMessage(error)}`,
				))
			},
		})
	}

	refreshDecoration(fireTree = true, updatePresence = true) {
		this.inlineBookmarkDecorationCoordinator.invalidate()
		this.invalidatePathIndex()
		if (updatePresence) void this.queueBookmarkPresenceContexts()
		this.refreshExpandCollapseContext()
		undoManager.setActiveScope(this.currentStorageScope)
		void this.setContextValue('bookmarks.var.bookmark.hasInvalid', hasInvalidBookmarks(this.codeBookmarks))
			.catch(error => logger.error(localize(`更新书签命令上下文失败: ${errorMessage(error)}`, `Failed to update bookmark command context: ${errorMessage(error)}`)))
		
		if (fireTree) this._onDidChangeTreeData.fire()

		// 树数据变化后同步刷新当前编辑器的行内幽灵文本。
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			this.updateInlineDecoration(editor);
		}
	}

	private queueBookmarkPresenceContexts(): Promise<void> {
		return this.bookmarkContextCoordinator.queuePresenceContexts(this.bookmarkContextPort())
	}

	public updateInlineDecoration(editor: vscode.TextEditor) {
		this.inlineBookmarkDecorationCoordinator.update(editor, this.inlineBookmarkDecorationPort())
	}

	private findBookmarkById(id: string, bookmarks: readonly Bookmark[] = this.codeBookmarks.values): Bookmark | undefined {
		for (const bookmark of bookmarks) {
			if (bookmark.id === id) return bookmark
			const nested = this.findBookmarkById(id, bookmark.subs.values)
			if (nested) return nested
		}
		return undefined
	}

	private bookmarkContainsCodeMarker(bookmark: Bookmark): boolean {
		return bookmark.isCodeMarker || bookmark.subs.values.some(child => this.bookmarkContainsCodeMarker(child))
	}

	private warnProtectedCodeMarkers(count: number): void {
		vscode.window.showWarningMessage(
			count === 1
				? localize('TODO/FIXME/BUG 书签由源码标记自动管理，不可删除。', 'TODO/FIXME/BUG bookmarks are managed automatically from source markers and cannot be deleted.')
				: localize(
					`选中的 ${count} 个 TODO/FIXME/BUG 书签由源码标记自动管理，不可删除。`,
					`The ${count} selected TODO/FIXME/BUG bookmarks are managed automatically from source markers and cannot be deleted.`,
				),
		)
	}

	private deleteBookmarksData(id: string): boolean {
		const bookmark = this.findBookmarkById(id)
		if (!bookmark || this.bookmarkContainsCodeMarker(bookmark)) return false
		this.codeBookmarks.deleteBookmark(id)
		return true
	}

	private undoWorkspaceOrder(): string[] | null {
		if (!this.currentStorageScope?.startsWith('workspace:')) return null
		return [...(this.workspaceOrderCache ?? this.codeBookmarks.values
			.filter(bookmark => bookmark.isFile)
			.map(bookmark => bookmark.path))]
	}

	private saveUndoState(action: UndoAction): void {
		undoManager.saveState(this.codeBookmarks, action, this.currentStorageScope, this.undoWorkspaceOrder())
	}

	private captureUndoState(workspaceOrder = this.undoWorkspaceOrder()): CapturedUndoState {
		return undoManager.captureState(this.codeBookmarks, this.currentStorageScope, workspaceOrder)
	}

	private commitUndoState(captured: CapturedUndoState, action: UndoAction): boolean {
		return undoManager.commitState(captured, this.codeBookmarks, action, this.undoWorkspaceOrder())
	}

	private aiSingleFileWorkflowPort(): AISingleFileWorkflowPort {
		return {
			absoluteToRelative: filePath => fileUtils.absoluteToRelative(filePath),
			storageScopeForUri: uri => this.storageScopeForUri(uri),
			taskRegistry: this.aiTaskRegistry,
			workflowGuard: this.aiWorkflowGuard,
			bookmarksForPath: pathRel => this.getBookmarksByPath(pathRel),
			documentLines: document => this.documentLines(document),
			deleteBookmark: id => this.deleteBookmarksData(id),
			addBookmark: bookmark => { this.codeBookmarks.addNewBookmark(bookmark) },
			saveUndoState: action => this.saveUndoState(action),
			saveBookmarks: filePaths => this.saveBookmarksToFile(filePaths),
			refreshDecoration: () => this.refreshDecoration(),
			findBookmark: bookmark => this.codeBookmarks.findBookmark(bookmark),
			assignAIIcons: () => ExtensionConfig.aiAssignIcons,
		}
	}

	private aiFolderWorkflowPort(): AIFolderWorkflowPort {
		return {
			...this.aiSingleFileWorkflowPort(),
			currentStorageScope: () => this.currentStorageScope,
		}
	}

	private aiSelectedBookmarksWorkflowPort(): AISelectedBookmarksWorkflowPort {
		return {
			...this.aiFolderWorkflowPort(),
			absoluteBookmarkPath: bookmarkPath => this.absoluteBookmarkPath(bookmarkPath),
			resolveTargets: (bookmark, selectedBookmarks) => this.resolveTargets(bookmark, selectedBookmarks),
		}
	}

	private manualBookmarkWorkflowPort(
		showInputBox: (options: vscode.InputBoxOptions) => Thenable<string | undefined> = options => vscode.window.showInputBox(options),
	): ManualBookmarkWorkflowPort {
		return {
			showInputBox,
			absoluteToRelative: filePath => fileUtils.absoluteToRelative(filePath),
			updateBookmarkContextAnchors: (bookmark, document) => fileUtils.updateBookmarkContextAnchors(bookmark, document),
			bookmarksForPath: pathRel => this.getBookmarksByPath(pathRel),
			findBookmarkById: id => this.findBookmarkById(id),
			bookmarkContainsCodeMarker: bookmark => this.bookmarkContainsCodeMarker(bookmark),
			warnProtectedCodeMarkers: count => this.warnProtectedCodeMarkers(count),
			deleteBookmark: id => this.deleteBookmarksData(id),
			addBookmark: bookmark => this.codeBookmarks.addNewBookmark(bookmark),
			saveUndoState: action => this.saveUndoState(action),
			saveBookmarks: filePaths => this.saveBookmarksToFile(filePaths),
			refreshDecoration: () => this.refreshDecoration(),
			expandPinnedContainer: bookmark => { void this.expandFolderTreeView(bookmark) },
		}
	}

	private bookmarkEditingWorkflowPort(): BookmarkEditingWorkflowPort {
		return {
			resolveTargets: (bookmark, selectedBookmarks) => this.resolveTargets(bookmark, selectedBookmarks),
			findBookmark: bookmark => this.codeBookmarks.findBookmark(bookmark),
			temporaryFolder: () => fileUtils.getGlobalBookmarkFolder(),
			registerDisposables: (...disposables) => { this.context.subscriptions.push(...disposables) },
			absoluteBookmarkPath: bookmarkPath => this.absoluteBookmarkPath(bookmarkPath),
			canUpdateBookmarkInEditor: (bookmark, editor) => this.canUpdateBookmarkInEditor(bookmark, editor),
			updateBookmarkContextAnchors: (bookmark, document) => fileUtils.updateBookmarkContextAnchors(bookmark, document),
			showIconPicker: (initialIcon, defaultIcon, onDidSelectIcon) => {
				IconPickerWebview.createOrShow(
					this.context,
					'batch_change_icon',
					initialIcon,
					defaultIcon,
					iconName => onDidSelectIcon(iconName),
				)
			},
			pinBookmark: bookmark => this.codeBookmarks.pinBookmark(bookmark),
			publishTreeChange: bookmark => this._onDidChangeTreeData.fire(bookmark),
			revealPinnedBookmarkLater: bookmark => this.revealPinnedBookmarkLater(bookmark),
			saveUndoState: action => this.saveUndoState(action),
			saveBookmarks: filePaths => this.saveBookmarksToFile(filePaths),
			refreshDecoration: () => this.refreshDecoration(),
		}
	}

	private bookmarkDeletionWorkflowPort(): BookmarkDeletionWorkflowPort {
		return {
			bookmarks: () => this.codeBookmarks,
			resolveTargets: (bookmark, selectedBookmarks) => this.resolveTargets(bookmark, selectedBookmarks),
			findBookmark: bookmark => this.codeBookmarks.findBookmark(bookmark),
			bookmarkContainsCodeMarker: bookmark => this.bookmarkContainsCodeMarker(bookmark),
			warnProtectedCodeMarkers: count => this.warnProtectedCodeMarkers(count),
			deleteBookmark: id => this.deleteBookmarksData(id),
			absoluteBookmarkPath: bookmarkPath => this.absoluteBookmarkPath(bookmarkPath),
			saveUndoState: action => this.saveUndoState(action),
			saveBookmarks: filePaths => this.saveBookmarksToFile(filePaths),
			refreshDecoration: () => this.refreshDecoration(),
		}
	}

	private bookmarkTreeInteractionPort(): BookmarkTreeInteractionPort {
		return {
			bookmarks: () => this.codeBookmarks,
			workspaceOrder: () => this.workspaceOrderCache,
			persistWorkspaceOrder: async order => {
				const folder = fileUtils.getGlobalBookmarkFolder(true, this.currentScopeUri())
				if (!folder) return
				this.workspaceOrderCache = order
				const orderFile = path.join(folder, '_workspace_order.json')
				if (!await fileUtils.writeJsonFileAsync(orderFile, workspaceOrderPersistence(order))) {
					logger.showWarningMessage(localize(
						'无法保存工作区文件排序，请检查书签存储路径权限。',
						'Unable to save the workspace file order. Check bookmark storage-folder permissions.',
					))
				}
			},
			absoluteBookmarkPath: bookmarkPath => this.absoluteBookmarkPath(bookmarkPath),
			absoluteToRelative: filePath => fileUtils.absoluteToRelative(filePath),
			bookmarksForPath: bookmarkPath => this.getBookmarksByPath(bookmarkPath),
			captureUndoState: workspaceOrder => this.captureUndoState(workspaceOrder),
			commitUndoState: (captured, action) => this.commitUndoState(captured, action),
			saveBookmarks: filePaths => this.saveBookmarksToFile(filePaths),
			refreshDecoration: () => this.refreshDecoration(),
			fireTreeChanged: () => this._onDidChangeTreeData.fire(),
			expansionRoots: () => this.currentStorageScope?.startsWith('workspace:')
				? this.codeBookmarks.values
				: this.standaloneRootBookmarks(),
			getChildren: bookmark => this.getChildren(bookmark),
			defaultExpandLevel: () => ExtensionConfig.defaultExpandLevel,
			treeViewAvailable: () => this.treeView !== undefined,
			revealTreeItem: (bookmark, options) => this.treeView?.reveal(bookmark, options),
			setExpandCollapseContext: expanded => this.setContextValue(Commands.varIsExpanded, expanded),
		}
	}

	async forceAddBookmark(
		editor: vscode.TextEditor,
		showInputBox?: (options: vscode.InputBoxOptions) => Thenable<string | undefined>,
	): Promise<void> {
		return runForceAddBookmark(editor, this.manualBookmarkWorkflowPort(showInputBox))
	}

	public integrationTestSnapshot(): IntegrationBookmarkSnapshot {
		const serialize = (bookmark: Bookmark): IntegrationBookmarkSnapshotNode => ({
			id: bookmark.id,
			label: bookmarkLabelText(bookmark.label),
			path: bookmark.path,
			isFile: bookmark.isFile,
			scriptId: bookmark.scriptId,
			line: bookmark.start.line,
			children: bookmark.subs.values.map(serialize),
		})
		return {
			ready: this.bookmarkContextCoordinator.contextValue(Commands.varBookmarkLoaded) === true,
			storageScope: this.currentStorageScope,
			roots: this.codeBookmarks.values.map(serialize),
		}
	}
	async generateBookmarksWithAI(editor: vscode.TextEditor, mode: AIGenerationMode): Promise<void> {
		return runGenerateBookmarksForFile(editor, mode, this.aiSingleFileWorkflowPort())
	}

	async optimizeBookmarksWithAI(editor: vscode.TextEditor): Promise<void> {
		return runOptimizeBookmarksForFile(editor, this.aiSingleFileWorkflowPort())
	}

	async generateBookmarksForFolderWithAI(mode: AIGenerationMode): Promise<void> {
		return this.aiWorkflowController.generateFolder(mode)
	}

	async optimizeBookmarksForFolderWithAI(): Promise<void> {
		return this.aiWorkflowController.optimizeFolder()
	}

	private resolveTargets(bm?: Bookmark, selectedBookmarks?: Bookmark[]): Bookmark[] {
		if (selectedBookmarks && selectedBookmarks.length > 1) return [...selectedBookmarks]

		const selection = this.treeView?.selection ?? []
		if (selection.length > 1) {
			if (!bm || selection.some(item => item.id === bm.id)) return [...selection]
			return [bm]
		}

		const target = bm ?? selection[0]
		return target ? [target] : []
	}

	public async optimizeSelectedBookmarksWithAI(
		bookmark?: Bookmark,
		selectedBookmarks?: Bookmark[],
	): Promise<void> {
		return runOptimizeSelectedBookmarks(
			bookmark,
			selectedBookmarks,
			this.aiSelectedBookmarksWorkflowPort(),
		)
	}

	public refreshExpandCollapseContext(): void {
		publishExpandCollapseContext(this.bookmarkTreeInteractionPort())
	}

	async toggleExpandCollapse() {
		return runToggleExpandCollapse(this.bookmarkTreeInteractionPort())
	}

	async expandFolderTreeView(bookmark: Bookmark) {
		return runExpandFolderTreeView(bookmark, this.bookmarkTreeInteractionPort())
	}

	private readonly bookmarkDocumentChangePortAdapter: BookmarkDocumentChangePort<
		vscode.TextDocument,
		vscode.Uri,
		BookmarkSet
	> = {
		isFileDocument: document => document.uri.scheme === 'file',
		documentUri: document => document.uri,
		isCurrentScope: uri => this.uriMatchesCurrentScope(uri),
		filePath: uri => uri.fsPath,
		relativeBookmarkPath: absolutePath => fileUtils.absoluteToRelative(absolutePath),
		currentViewGeneration: () => this.viewLoadGeneration,
		currentBookmarkState: () => this.codeBookmarks,
		bookmarkCount: bookmarkPath => this.getBookmarksByPath(bookmarkPath).length,
		relocateBookmarks: (bookmarkState, bookmarkPath, uri) =>
			fileUtils.readContentBookmarkInFile(bookmarkState, true, bookmarkPath, uri),
		documentLines: document => this.documentLines(document),
		documentLanguage: document => document.languageId,
		synchronizeCodeMarkers: (uri, lines, languageId) =>
			this.synchronizeCodeMarkerSnapshot(uri, lines, languageId),
		persistCodeMarkerChanges: absolutePaths => this.persistCodeMarkerChanges(absolutePaths),
		saveBookmarks: absolutePaths => this.saveBookmarksToFile(absolutePaths),
		refreshDecorations: () => this.refreshDecoration(),
		reportFailure: error => logger.error(localize(`书签位置跟踪失败: ${errorMessage(error)}`, `Bookmark position tracking failed: ${errorMessage(error)}`)),
	}

	private bookmarkDocumentChangePort(): BookmarkDocumentChangePort<
		vscode.TextDocument,
		vscode.Uri,
		BookmarkSet
	> {
		return this.bookmarkDocumentChangePortAdapter
	}

	changeContentFile(event: vscode.TextDocumentChangeEvent) {
		this.bookmarkDocumentChangeCoordinator.handleChange(
			event.document,
			event.contentChanges.length > 0,
			this.bookmarkDocumentChangePort(),
		)
	}

	async forceDeleteBookmark(editor: vscode.TextEditor): Promise<void> {
		return runForceDeleteBookmark(editor, this.manualBookmarkWorkflowPort())
	}

	async toggleBookmark(editor: vscode.TextEditor): Promise<void> {
		return runToggleBookmark(editor, this.manualBookmarkWorkflowPort())
	}
	// **************** 文件级操作
	private currentScopeFilePath: string | undefined;
	private readonly saveCoordinator = new BookmarkSaveCoordinator(this.bookmarkSaveCoordinatorPort())
	private readonly storagePathWorkflow = new BookmarkStoragePathWorkflowRunner()

	private bookmarkSaveCoordinatorPort(): BookmarkSaveCoordinatorPort {
		return {
			ensureStorageRoot: () => {
				if (!storageRootState.root) {
					if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return undefined
					storageRootState.activate(ExtensionConfig.resolveStoragePath())
				}
				return storageRootState.root
			},
			currentBookmarks: () => this.codeBookmarks.values,
			activeFilePathInCurrentScope: () => {
				const editor = vscode.window.activeTextEditor
				return editor?.document.uri.scheme === 'file' && this.uriMatchesCurrentScope(editor.document.uri)
					? editor.document.uri.fsPath
					: undefined
			},
			currentScopeFilePath: () => this.currentScopeFilePath,
			setCurrentScopeFilePath: filePath => { this.currentScopeFilePath = filePath },
			absoluteBookmarkPath: bookmarkPath => this.absoluteBookmarkPath(bookmarkPath),
			workspaceKeyForPath: filePath => {
				const uri = vscode.Uri.file(filePath)
				if (!fileUtils.isWorkspaceMode(uri)) return undefined
				return normalizedAbsolutePath(fileUtils.workspaceRoot(uri))
			},
			saveSnapshot: async (bookmarks, filePath, storageRoot, dirtyPaths) => {
				const snapshot = new BookmarkSet()
				snapshot.values = bookmarks
				return bookmarkRepository.saveBookmarksToFile(snapshot, [filePath], storageRoot, dirtyPaths)
			},
		}
	}

	private bookmarkImportWorkflowPort(): BookmarkImportWorkflowPort {
		return {
			ensureEditorScope: editor => this.ensureEditorScope(editor),
			absoluteToRelative: filePath => fileUtils.absoluteToRelative(filePath),
			bookmarksForPath: bookmarkPath => this.getBookmarksByPath(bookmarkPath),
			storageScopeForUri: uri => this.storageScopeForUri(uri),
			runImportTransaction: operation => this.runImportTransaction(operation),
			captureUndoState: () => this.captureUndoState(),
			commitImportUndo: captured => { undoManager.commitCapturedState(captured, 'importBookmarks') },
			importFolder: (configFolderPath, workspaceRootPath) =>
				bookmarkRepository.importBookmarkConfigurationsFromFolder(configFolderPath, workspaceRootPath),
			importFile: (configPath, targetAbsolutePath) =>
				bookmarkRepository.importBookmarkConfiguration(configPath, targetAbsolutePath),
			refresh: (editor, expectedScope) => this.refresh(editor, expectedScope, true),
		}
	}

	private bookmarkStoragePathWorkflowPort(): BookmarkStoragePathWorkflowPort {
		return {
			activeRoot: () => storageRootState.root,
			ensureConfigured: () => ExtensionConfig.ensureGlobalStoragePathConfigured(),
			configuredRoot: () => ExtensionConfig.resolveStoragePath(),
			sameRoot: (left, right) => normalizedAbsolutePath(left) === normalizedAbsolutePath(right),
			activateRoot: root => storageRootState.activate(root),
			rememberRoot: async root => { await this.context.globalState.update(LAST_STORAGE_ROOT_KEY, root) },
			reloadActiveTab: forceReloadDisk => this.reloadActiveTab(forceReloadDisk),
			queueFullSave: () => this.saveAllBookmarksToFile(),
			beginStorageTransition: () => this.saveCoordinator.beginStorageTransition(),
			finishStorageTransition: () => this.saveCoordinator.finishStorageTransition(),
			cancelStorageTransition: () => this.saveCoordinator.cancelStorageTransition(),
			flushPendingSaves: requireSuccess => this.flushPendingSaves(requireSuccess),
			transferRoot: (sourceRoot, targetRoot) => transferStorageRoot(sourceRoot, targetRoot),
			setupConfigWatcher: () => this.setupConfigWatcher(),
			reportPreviousFailure: error => logger.error(localize(`上一次书签存储目录转移失败: ${errorMessage(error)}`, `The previous bookmark storage-folder transfer failed: ${errorMessage(error)}`)),
			bookmarks: () => this.codeBookmarks,
		}
	}

	saveBookmarksToFile(paths: readonly string[]): void {
		if (paths.length === 0) return
		this.saveCoordinator.queuePaths(paths)
	}

	private saveAllBookmarksToFile(): void {
		this.saveCoordinator.queueAll()
	}

	public saveBookmarkNodeState(bookmark: Bookmark): void {
		this.saveBookmarksToFile([this.absoluteBookmarkPath(bookmark.path)])
	}

	public async flushPendingSaves(requireSuccess = false): Promise<void> {
		return this.saveCoordinator.flushPendingSaves(requireSuccess)
	}

	private async runImportTransaction<T>(operation: () => Promise<T>): Promise<T> {
		return this.saveCoordinator.runImportTransaction(operation)
	}

	private resolveBookmarkViewTarget(
		scopePathOverride?: string,
		expectedScope?: string,
	): { storageScope: string, scopeFilePath?: string } {
		const activeEditor = vscode.window.activeTextEditor?.document.uri.scheme === 'file'
			? vscode.window.activeTextEditor
			: undefined
		let scopeFilePath = scopePathOverride ?? activeEditor?.document.uri.fsPath
		const storageScope = expectedScope ?? (scopeFilePath
			? this.storageScopeForUri(vscode.Uri.file(scopeFilePath))
			: this.storageScope(activeEditor))
		if (!scopeFilePath && storageScope === this.currentStorageScope) scopeFilePath = this.currentScopeFilePath
		if (!scopeFilePath && storageScope.startsWith('workspace:')) scopeFilePath = fileUtils.workspaceRoot() || undefined
		return { storageScope, scopeFilePath }
	}

	private emptyPreparedBookmarkView(scopePathOverride?: string, expectedScope?: string): PreparedBookmarkView {
		const target = this.resolveBookmarkViewTarget(scopePathOverride, expectedScope)
		return {
			bookmarks: new BookmarkSet(),
			storageScope: target.storageScope,
			scopeFilePath: target.scopeFilePath,
			workspaceOrder: target.storageScope.startsWith('workspace:') ? [] : null,
			workspaceOrderNeedsPersist: false,
			contentUpdated: false,
		}
	}

	private async readWorkspaceOrderForView(
		bookmarks: BookmarkSet,
		storageScope: string,
		scopeFilePath?: string,
		signal?: AbortSignal,
	): Promise<WorkspaceOrderSnapshot> {
		return loadWorkspaceOrderForView(
			bookmarks.values
				.filter(bookmark => bookmark.isFile && bookmark.path)
				.map(bookmark => bookmark.path),
			storageScope,
			scopeFilePath,
			signal,
			{
				resolveBookmarkFolder: candidateScopeFilePath => {
					const scopeUri = candidateScopeFilePath ? vscode.Uri.file(candidateScopeFilePath) : undefined
					return fileUtils.getGlobalBookmarkFolder(true, scopeUri) ?? undefined
				},
				readFile: filePath => fs.promises.readFile(filePath, 'utf8'),
				reportReadFailure: error => logger.error(localize(`读取工作区书签排序失败: ${errorMessage(error)}`, `Failed to read the workspace bookmark order: ${errorMessage(error)}`)),
			},
		)
	}

	private persistWorkspaceOrderSnapshot(
		snapshot: WorkspaceOrderSnapshot,
		storageScope: string,
		generation: number,
	): void {
		if (!snapshot.needsPersist || !snapshot.filePath || !snapshot.order) return
		void Promise.resolve().then(async () => {
			if (this.disposed || generation !== this.viewLoadGeneration || storageScope !== this.currentStorageScope) return
			if (!await fileUtils.writeJsonFileAsync(snapshot.filePath!, snapshot.order!)) {
				logger.showWarningMessage(localize(
					'无法保存工作区文件排序，请检查书签存储路径权限。',
					'Unable to save the workspace file order. Check bookmark storage-folder permissions.',
				))
			}
		}).catch(error => logger.error(localize(`保存工作区书签排序失败: ${errorMessage(error)}`, `Failed to save the workspace bookmark order: ${errorMessage(error)}`)))
	}

	private async prepareBookmarkView(
		scopePathOverride?: string,
		expectedScope?: string,
		signal?: AbortSignal,
	): Promise<PreparedBookmarkView> {
		const target = this.resolveBookmarkViewTarget(scopePathOverride, expectedScope)
		return runBookmarkViewPreparation(target, {
			currentStorageScope: this.currentStorageScope,
			currentBookmarks: this.codeBookmarks.values,
			readBookmarks: (activePaths, candidateSignal) => bookmarkRepository.readBookmarksFromFile(
				[...activePaths],
				undefined,
				candidateSignal,
			),
			readContentBookmarks: (bookmarks, scopeFilePath, candidateSignal) => fileUtils.readContentBookmarkInFile(
				bookmarks,
				true,
				undefined,
				scopeFilePath ? vscode.Uri.file(scopeFilePath) : undefined,
				undefined,
				candidateSignal,
			),
			readWorkspaceOrder: (bookmarks, candidateTarget, candidateSignal) => this.readWorkspaceOrderForView(
				bookmarks,
				candidateTarget.storageScope,
				candidateTarget.scopeFilePath,
				candidateSignal,
			),
		}, signal)
	}

	private commitPreparedBookmarkView(prepared: PreparedBookmarkView): ViewTransitionState {
		return commitBookmarkView(prepared, {
			currentStorageScope: () => this.currentStorageScope,
			currentBookmarkCount: () => this.codeBookmarks.size,
			handleStorageScopeChange: () => {
				this.codeMarkerWorkflow.resetWorkspaceScan()
			},
			setCurrentStorageScope: storageScope => { this.currentStorageScope = storageScope },
			setCurrentScopeFilePath: scopeFilePath => { this.currentScopeFilePath = scopeFilePath },
			setWorkspaceOrder: order => { this.workspaceOrderCache = order },
			setBookmarks: bookmarks => { this.codeBookmarks = bookmarks },
			rebuildFileNodeCache: bookmarks => {
				this.bookmarkTreeDataProjection.rebuildFileNodeCache(
					bookmarks,
					this.bookmarkTreeDataProjectionPort(),
				)
			},
			invalidatePathIndex: () => this.invalidatePathIndex(),
		})
	}

	private async publishCommittedViewTransition(
		transition: ViewTransitionState,
		generation: number,
	): Promise<void> {
		await publishViewTransition(transition, generation, {
			isCurrent: candidateGeneration => candidateGeneration === this.viewLoadGeneration && !this.disposed,
			treeVisible: this.treeView?.visible === true,
			waitForTreePopulation: candidateGeneration => this.waitForTreePopulation(candidateGeneration),
			fireTreeChanged: () => this._onDidChangeTreeData.fire(),
			queueBookmarkPresenceContexts: () => this.queueBookmarkPresenceContexts(),
			setUndoScope: () => undoManager.setActiveScope(this.currentStorageScope),
		}, TREE_RENDER_SETTLE_MS)
	}

	private waitForTreePopulation(generation: number): Promise<void> {
		return this.bookmarkTreeViewLifecycle.waitForPopulation(generation)
	}

	private resolvePendingTreePopulation(generation?: number): void {
		this.bookmarkTreeViewLifecycle.resolvePopulation(generation)
	}

	async importBookmarkConfiguration(): Promise<void> {
		return runImportBookmarkConfiguration(this.bookmarkImportWorkflowPort())
	}

	openBookmarkConfigurationManager(): void {
		this.configurationManagementController.open()
	}

	async onSearchInFile() {
		return runSearchBookmarksInActiveFile(this.bookmarkTreeInteractionPort())
	}

	async onSort() {
		return runSelectBookmarkSortMode(this.bookmarkTreeInteractionPort())
	}

	private currentStorageScope: string | undefined;

	private storageScopeForUri(uri?: vscode.Uri): string {
		const workspaceRoot = fileUtils.workspaceRoot(uri)
		if (workspaceRoot) {
			return `workspace:${normalizedAbsolutePath(workspaceRoot)}`
		}
		if (uri?.scheme === 'file') {
			return `file:${normalizedAbsolutePath(uri.fsPath)}`
		}
		return 'global'
	}

	private storageScope(editor?: vscode.TextEditor): string {
		const candidateEditor = editor ?? vscode.window.activeTextEditor
		if (candidateEditor?.document.uri.scheme !== 'file' && this.currentStorageScope) return this.currentStorageScope
		const uri = candidateEditor?.document.uri.scheme === 'file' ? candidateEditor.document.uri : undefined
		return this.storageScopeForUri(uri)
	}

	private uriMatchesCurrentScope(uri: vscode.Uri): boolean {
		return this.currentStorageScope !== undefined && this.storageScopeForUri(uri) === this.currentStorageScope
	}

	private bookmarkViewRefreshPort(): BookmarkViewRefreshPort {
		return {
			currentStorageScope: () => this.currentStorageScope,
			currentScopeFilePath: () => this.currentScopeFilePath,
			setCurrentScopeFilePath: filePath => { this.currentScopeFilePath = filePath },
			workspaceRoot: () => fileUtils.workspaceRoot() || undefined,
			nextRevealGeneration: () => this.bookmarkTreeViewLifecycle.nextRevealGeneration(),
			beginViewLoad: () => this.beginViewLoad(),
			currentViewLoadGeneration: () => this.viewLoadGeneration,
			loadingViewGeneration: () => this.loadingViewGeneration,
			clearLoading: () => this.viewLoads.clearLoading(),
			markLoading: generation => this.viewLoads.markLoading(generation),
			resetCodeMarkerScan: () => this.codeMarkerWorkflow.resetWorkspaceScan(),
			queueBookmarkPresenceContexts: () => this.queueBookmarkPresenceContexts(),
			restoreConfigWatcher: generation => {
				void this.setupConfigWatcher(generation)
					.catch(error => logger.error(localize(`恢复书签配置监听器失败: ${errorMessage(error)}`, `Failed to restore the bookmark configuration watcher: ${errorMessage(error)}`)))
			},
			restoreBackgroundEnhancements: generation => {
				void this.initializeBackgroundEnhancements(
					this.codeMarkerWorkflow.initializeLanguageProfiles(),
					this.currentStorageScope,
					generation,
				)
			},
			scheduleActiveFileReveal: (editor, viewGeneration, revealGeneration) =>
				this.scheduleActiveFileReveal(editor, viewGeneration, revealGeneration),
			initView: (scopePath, generation, storageScope) =>
				this.initViewEditor(scopePath, true, generation, storageScope),
			isCurrent: (generation, storageScope) =>
				generation === this.viewLoadGeneration && this.currentStorageScope === storageScope,
			treeVisible: () => this.treeView?.visible === true,
			reportRefreshFailure: error => logger.error(localize(`刷新书签视图失败: ${errorMessage(error)}`, `Failed to refresh the bookmark view: ${errorMessage(error)}`)),
		}
	}

	private scheduleActiveFileReveal(
		editor: vscode.TextEditor,
		viewGeneration: number,
		revealGeneration: number,
	): void {
		this.bookmarkTreeViewLifecycle.scheduleActiveFileReveal(
			editor,
			viewGeneration,
			revealGeneration,
			this.bookmarkTreeViewLifecyclePort(),
		)
	}

	public async ensureEditorScope(editor: vscode.TextEditor): Promise<void> {
		if (editor.document.uri.scheme !== 'file') return
		const scope = this.storageScopeForUri(editor.document.uri)
		await this.refresh(editor, scope)
	}

	reloadActiveTab(forceReloadDisk: boolean = false): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		let shouldReconcile = false
		if (!forceReloadDisk && editor?.document.uri.scheme === 'file' && this.uriMatchesCurrentScope(editor.document.uri)) {
			const activePath = fileUtils.absoluteToRelative(editor.document.uri.fsPath)
			const activeKey = `${this.currentStorageScope}\0${activePath}`
			if (!this.reconciliationAttemptedPaths.has(activeKey) && this.getBookmarksByPath(activePath).length === 0) {
				shouldReconcile = this.codeBookmarks.values.some(fileNode => fileNode.isFile
					&& !fs.existsSync(fileUtils.relativeToAbsolute(fileNode.path, editor.document.uri)))
				if (shouldReconcile) this.reconciliationAttemptedPaths.add(activeKey)
			}
		}
		return this.refresh(editor, this.storageScope(editor), forceReloadDisk || shouldReconcile);
	}

	onStoragePathChanged(): Promise<void> {
		return this.storagePathWorkflow.run(this.bookmarkStoragePathWorkflowPort())
	}

	async onWorkspaceFoldersChanged(): Promise<void> {
		const editor = vscode.window.activeTextEditor?.document.uri.scheme === 'file'
			? vscode.window.activeTextEditor
			: undefined
		const nextScope = editor
			? this.storageScopeForUri(editor.document.uri)
			: this.storageScopeForUri()
		await this.refresh(editor, nextScope, true)
	}

	onDisplayConfigurationChanged(): void {
		this.refreshDecoration()
		for (const editor of vscode.window.visibleTextEditors) this.updateInlineDecoration(editor)
	}

	public async refresh(editor?: vscode.TextEditor, storageScope = this.storageScope(editor), forceReloadDisk: boolean = false) {
		return this.viewRefreshCoordinator.refresh(
			editor,
			storageScope,
			forceReloadDisk,
			this.bookmarkViewRefreshPort(),
		)
	}

	// 处理树节点行内操作按钮触发的重命名命令。
	async onRenameBookmark(bm?: Bookmark, selectedBookmarks?: Bookmark[]) {
		return runRenameBookmark(bm, selectedBookmarks, this.bookmarkEditingWorkflowPort())
	}

	async editBookmark_editLabel(bm?: Bookmark, selectedBookmarks?: Bookmark[]) {
		await this.onRenameBookmark(bm, selectedBookmarks);
	}

	async editBookmark_updatePosOnly(bm: Bookmark) {
		return runUpdateBookmarkPosition(bm, this.bookmarkEditingWorkflowPort())
	}

	async editBookmark_updatePosAndRename(bm: Bookmark) {
		return runUpdateBookmarkPositionAndRename(bm, this.bookmarkEditingWorkflowPort())
	}

	async editBookmark_changeIcon(bm?: Bookmark, selectedBookmarks?: Bookmark[]) {
		return runChangeBookmarkIcons(bm, selectedBookmarks, this.bookmarkEditingWorkflowPort())
	}

	async editBookmark_restoreDefaultIcon(bm?: Bookmark, selectedBookmarks?: Bookmark[]) {
		return runRestoreDefaultBookmarkIcons(bm, selectedBookmarks, this.bookmarkEditingWorkflowPort())
	}

	private canUpdateBookmarkInEditor(bookmark: Bookmark, editor: vscode.TextEditor): boolean {
		if (editor.document.uri.scheme !== 'file') return false
		if (!this.uriMatchesCurrentScope(editor.document.uri)) return false
		const currentPath = fileUtils.absoluteToRelative(editor.document.uri.fsPath).replace(/\\/g, '/')
		const bookmarkPath = bookmark.path.replace(/\\/g, '/')
		return bookmarkPathKey(currentPath) === bookmarkPathKey(bookmarkPath)
	}

	private revealPinnedBookmarkLater(bookmark: Bookmark): void {
		this.bookmarkTreeViewLifecycle.schedulePinnedBookmarkReveal(
			bookmark,
			this.bookmarkTreeViewLifecyclePort(),
		)
	}

	public clearInvalidBookmarks(): void {
		return runClearInvalidBookmarks(this.bookmarkDeletionWorkflowPort())
	}

	async onDeleteBookmark(bm?: Bookmark, selectedBookmarks?: Bookmark[]): Promise<void> {
		return runDeleteBookmarks(bm, selectedBookmarks, this.bookmarkDeletionWorkflowPort())
	}

	onClickPinView(bookmark: Bookmark) {
		runTogglePinnedBookmark(bookmark, this.bookmarkEditingWorkflowPort())
	}

	async onRenameDirectory(oldPath: string, newPath: string): Promise<void> {
		return runRenamedSourcePath(oldPath, newPath, this.sourcePathChangeWorkflowPort())
	}

	onDeleteDirectory(deletePath: string): void {
		return runDeletedSourcePath(deletePath, this.sourcePathChangeWorkflowPort())
	}

	private bookmarkHistoryWorkflowPort(): BookmarkHistoryWorkflowPort {
		return {
			applyHistory: operation => operation === 'undo'
				? undoManager.undo(this.codeBookmarks, this.currentStorageScope, this.undoWorkspaceOrder())
				: undoManager.redo(this.codeBookmarks, this.currentStorageScope, this.undoWorkspaceOrder()),
			currentStorageScope: () => this.currentStorageScope,
			setWorkspaceOrder: order => { this.workspaceOrderCache = order },
			workspaceOrderFilePath: () => {
				const folder = fileUtils.getGlobalBookmarkFolder(true, this.currentScopeUri())
				return folder ? path.join(folder, '_workspace_order.json') : undefined
			},
			writeWorkspaceOrder: (filePath, order) => fileUtils.writeJsonFileAsync(filePath, workspaceOrderPersistence(order)),
			reportWorkspaceOrderSaveFailure: () =>
				logger.showWarningMessage(localize(
					'无法保存撤销后的工作区文件顺序，请检查书签存储路径权限。',
					'Unable to save the restored workspace file order. Check bookmark storage-folder permissions.',
				)),
			bookmarkSourcePaths: () => this.codeBookmarks.values
				.filter(bookmark => bookmark.isFile && bookmark.path)
				.map(bookmark => this.absoluteBookmarkPath(bookmark.path)),
			bookmarks: () => this.codeBookmarks,
			saveBookmarks: filePaths => this.saveBookmarksToFile(filePaths),
			saveAllBookmarks: () => this.saveAllBookmarksToFile(),
			refreshDecoration: () => this.refreshDecoration(),
			showAppliedMessage: message => logger.showMessage(message),
			showUnavailableMessage: message => { void vscode.window.showInformationMessage(message) },
		}
	}

	async undo(): Promise<void> {
		return runBookmarkHistoryOperation('undo', this.bookmarkHistoryWorkflowPort())
	}

	async redo(): Promise<void> {
		return runBookmarkHistoryOperation('redo', this.bookmarkHistoryWorkflowPort())
	}

	dispose() {
		this.disposed = true
		this.bookmarkContextCoordinator.dispose()
		this.bookmarkTreeViewLifecycle.dispose()
		this.viewLoads.dispose()
		this.configWatcherCoordinator.dispose()
		this.codeMarkerWorkflow.dispose()
		this.bookmarkDocumentChangeCoordinator.dispose()
		this.viewRefreshCoordinator.dispose()
		this.saveCoordinator.dispose()
		this._onDidChangeTreeData.dispose()
	}
}
