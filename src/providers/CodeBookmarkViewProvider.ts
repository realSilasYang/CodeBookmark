import * as vscode from 'vscode'
import { Commands } from '../util/constants/Commands'
import { fileUtils } from '../util/FileUtils'
import { logger } from '../util/Logger'

import { IconPickerWebview } from '../util/quick_pick_icon/IconPickerWebview'
import { fileChangeFingerprints } from '../util/FileChangeFingerprint'
import { Bookmark } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'
import { bookmarkRepository, type ScriptRelocationChange } from '../repository/BookmarkRepository'
import fs = require('fs')
import * as path from 'path'
import { ContextBookmark, isBookmarkItemContext } from '../util/ContextValue'
import { ExtensionConfig } from '../config/ExtensionConfig'
import { undoManager, type CapturedUndoState } from './UndoManager'
import { storageRootState } from '../util/StorageRootState'
import { transferStorageRoot } from '../repository/StorageRootTransfer'
import { bookmarkPathKey } from '../util/BookmarkPath'
import { LanguageCommentProfileRegistry } from '../util/LanguageCommentProfiles'
import {
	isExcludedSourceRelativePath,
	SOURCE_SCAN_EXCLUDE_GLOB,
} from '../util/SourceFilePolicy'
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
import {
	synchronizeCodeMarkersInDocument as runCodeMarkerDocumentSync,
	synchronizeCodeMarkersForUris as runCodeMarkerUriSync,
	synchronizeOpenCodeMarkerDocuments as runOpenCodeMarkerSync,
	type CodeMarkerDocumentSyncPort,
} from './CodeMarkerDocumentSync'
import { scanWorkspaceCodeMarkers as runWorkspaceCodeMarkerScan } from './WorkspaceCodeMarkerScanRunner'
import { reloadCodeMarkerLanguageProfiles as runCodeMarkerLanguageReload } from './CodeMarkerLanguageReloadRunner'
import { AITaskRegistry } from './AITaskRegistry'
import { visitAISourceFilesInFolder } from '../util/AISourceFolderScanner'
import {
	AIFolderPresenceCache,
	bookmarkPathPresenceSignature,
	type AIFolderBookmarkPresence,
} from './AIFolderPresenceCache'
import { AIWorkflowGuard } from './AIWorkflowGuard'
import {
	runGenerateBookmarksForFile,
	runOptimizeBookmarksForFile,
	type AIGenerationMode,
	type AISingleFileWorkflowPort,
} from './AISingleFileWorkflowRunner'
import {
	runGenerateBookmarksForFolder,
	runOptimizeBookmarksForFolder,
	type AIFolderWorkflowPort,
	type AIFolderWorkflowTarget,
} from './AIFolderWorkflowRunner'
import { BookmarkIdleViewCoordinator } from './BookmarkIdleViewCoordinator'
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
	CodeMarkerSyncLifecycle,
	type CodeMarkerSyncLifecyclePort,
} from './CodeMarkerSyncLifecycle'
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
import {
	CodeMarkerSnapshotCoordinator,
	type CodeMarkerSnapshotPort,
} from './CodeMarkerSnapshotCoordinator'
import {
	CodeMarkerSourceReader,
	type CodeMarkerSourceReaderPort,
} from './CodeMarkerSourceReader'

const LAST_STORAGE_ROOT_KEY = 'codebookmark.lastStorageRoot'

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

const MAX_BACKGROUND_CODE_MARKER_FILES = 2_000
const CODE_MARKER_SCAN_CONCURRENCY = 4
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
			void fileUtils.writeJsonFileAsync(orderFile, order).then(success => {
				if (!success) logger.showWarningMessage('无法保存工作区文件排序，请检查书签存储路径权限。')
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
		setLoadingMessage: treeView => { treeView.message = '正在加载书签…' },
		reportSlowInitialLoad: warningMs =>
			logger.error(`书签初始化已超过 ${warningMs / 1000} 秒；扩展已正常启动，数据仍在后台加载。`),
		setSlowLoadingMessage: treeView => { treeView.message = '书签加载时间较长，仍在后台继续…' },
		clearInitialLoadMessage: treeView => { treeView.message = undefined },
		reportInitialLoadFailure: error => logger.error(`初始化书签视图失败: ${errorMessage(error)}`),
		setInitialLoadFailureMessage: treeView => {
			treeView.message = '书签初始化失败，请查看“CodeBookmark”输出。'
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
	private readonly aiFolderPresence = new AIFolderPresenceCache()

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
		folderBookmarkPresence: directory => this.folderBookmarkPresence(directory),
		reportFailure: (kind, error) => this.reportBookmarkContextFailure(kind, error),
	}

	private bookmarkContextPort(): BookmarkContextPort<vscode.Uri> {
		return this.bookmarkContextPortAdapter
	}

	private reportBookmarkContextFailure(kind: BookmarkContextFailureKind, error: unknown): void {
		const messages: Record<BookmarkContextFailureKind, string> = {
			'active-editor': '更新活动编辑器命令状态失败',
			'active-tab': '更新活动标签页上下文失败',
			'presence': '更新书签显示上下文失败',
			'previous-ai-folder': '上一次 AI 菜单上下文更新失败',
			'ai-folder-state': '更新 AI 文件夹菜单状态失败',
			'ai-folder-update': '更新 AI 菜单上下文失败',
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
	private readonly codeMarkerSnapshotCoordinator = new CodeMarkerSnapshotCoordinator<vscode.Uri>()
	private readonly codeMarkerSourceReader = new CodeMarkerSourceReader<vscode.TextDocument, vscode.Uri>()
	private readonly codeMarkerSyncLifecycle = new CodeMarkerSyncLifecycle<vscode.Uri, vscode.Disposable>()
	private readonly bookmarkDocumentChangeCoordinator =
		new BookmarkDocumentChangeCoordinator<vscode.TextDocument, vscode.Uri, BookmarkSet>()
	private readonly languageCommentProfiles = new LanguageCommentProfileRegistry()
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
		this.aiFolderPresence.invalidateSourceFiles()
		this.bookmarkContextCoordinator.invalidateAIFolderContext()
		this.reconciliationAttemptedPaths.clear()
		this.codeMarkerSyncLifecycle.invalidateWorkspaceScanScope()
		this.scheduleWorkspaceCodeMarkerScan()
		void this.queueBookmarkPresenceContexts()
	}

	private cancelPendingPathWork(absolutePath: string): void {
		const bookmarkPath = fileUtils.absoluteToRelative(absolutePath)
		this.bookmarkDocumentChangeCoordinator.cancelBookmarkPath(bookmarkPath)
		this.codeMarkerSyncLifecycle.cancelPath(absolutePath)
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
	 * Apply repository-level rebinding to the in-memory tree.  File-system
	 * providers can report a move as delete + create, so the repository may
	 * update the durable script binding without going through onRenameDirectory.
	 * Keeping this bridge here prevents a subsequent in-memory save from putting
	 * the old path back on disk.
	 */
	async applyRepositoryRelocations(changes: readonly ScriptRelocationChange[]): Promise<void> {
		return applySourceRepositoryRelocations(changes, this.sourcePathChangeWorkflowPort())
	}

	private documentLines(document: vscode.TextDocument): string[] {
		return Array.from({ length: document.lineCount }, (_, line) => document.lineAt(line).text)
	}

	private readonly codeMarkerSnapshotPortAdapter: CodeMarkerSnapshotPort<vscode.Uri> = {
		isFileUri: uri => uri.scheme === 'file',
		isCurrentScope: uri => this.uriMatchesCurrentScope(uri),
		filePath: uri => uri.fsPath,
		relativeBookmarkPath: absolutePath => fileUtils.absoluteToRelative(absolutePath),
		bookmarks: () => this.codeBookmarks,
		profileFor: (languageId, filePath) => this.languageCommentProfiles.profileFor(languageId, filePath),
		warnFileTruncated: (filePath, limit) =>
			logger.showWarningMessage(`脚本 ${path.basename(filePath)} 中的 TODO/FIXME/BUG 超过 ${limit} 个，仅同步前 ${limit} 个以避免书签配置异常膨胀。`),
		warnFileCapacityLimited: filePath =>
			logger.showWarningMessage(`脚本 ${path.basename(filePath)} 的手动书签与自动标记已达到 10000 个节点上限；为保证配置可读取，未继续生成其余 TODO/FIXME/BUG 书签。`),
		warnWorkspaceDiscoveryTruncated: (_scope, maxFiles) =>
			logger.showWarningMessage(`当前工作区脚本超过 ${maxFiles} 个；后台仅扫描前 ${maxFiles} 个，其他脚本会在打开或编辑时自动同步 TODO/FIXME/BUG。`),
		invalidatePathIndex: () => this.invalidatePathIndex(),
		saveBookmarks: absolutePaths => this.saveBookmarksToFile(absolutePaths),
		refreshDecorations: () => this.refreshDecoration(),
	}

	private codeMarkerSnapshotPort(): CodeMarkerSnapshotPort<vscode.Uri> {
		return this.codeMarkerSnapshotPortAdapter
	}

	private readonly codeMarkerSourceReaderPortAdapter: CodeMarkerSourceReaderPort<
		vscode.TextDocument,
		vscode.Uri
	> = {
		openDocuments: () => vscode.workspace.textDocuments,
		documentUri: document => document.uri,
		isFileUri: uri => uri.scheme === 'file',
		filePath: uri => uri.fsPath,
		sameFilePath: (left, right) => normalizedAbsolutePath(left) === normalizedAbsolutePath(right),
		documentLines: document => this.documentLines(document),
		documentLanguage: document => document.languageId,
		profilesInitialized: () => this.languageCommentProfiles.isInitialized,
		supportsFile: filePath => this.languageCommentProfiles.supportsFile(filePath),
		statFile: async filePath => {
			const stat = await fs.promises.stat(filePath)
			return { isFile: stat.isFile(), size: stat.size }
		},
		readTextFile: filePath => fs.promises.readFile(filePath, 'utf8'),
	}

	private codeMarkerSourceReaderPort(): CodeMarkerSourceReaderPort<vscode.TextDocument, vscode.Uri> {
		return this.codeMarkerSourceReaderPortAdapter
	}

	private isExcludedCodeMarkerUri(uri: vscode.Uri): boolean {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
		if (!workspaceFolder) return false
		const relative = path.relative(workspaceFolder.uri.fsPath, uri.fsPath)
		return isExcludedSourceRelativePath(relative)
	}

	private removeCodeMarkersForUri(uri: vscode.Uri): boolean {
		return this.codeMarkerSnapshotCoordinator.removeMarkers(uri, this.codeMarkerSnapshotPort())
	}

	private async codeMarkerSourceIsMissing(uri: vscode.Uri): Promise<boolean> {
		try {
			return !(await fs.promises.stat(uri.fsPath)).isFile()
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code
			return code === 'ENOENT' || code === 'ENOTDIR'
		}
	}

	private synchronizeCodeMarkerSnapshot(
		uri: vscode.Uri,
		lines: readonly string[],
		languageId?: string,
	) {
		return this.codeMarkerSnapshotCoordinator.synchronizeSnapshot(
			uri,
			lines,
			languageId,
			this.codeMarkerSnapshotPort(),
		)
	}

	private persistCodeMarkerChanges(changedPaths: readonly string[]): void {
		this.codeMarkerSnapshotCoordinator.persistChanges(changedPaths, this.codeMarkerSnapshotPort())
	}

	private readonly codeMarkerDocumentSyncPortAdapter: CodeMarkerDocumentSyncPort<
		vscode.TextDocument,
		vscode.Uri
	> = {
		initializeLanguageProfiles: () => this.languageCommentProfiles.initialize(),
		currentGeneration: () => this.viewLoadGeneration,
		isFileUri: uri => uri.scheme === 'file',
		isCurrentScope: uri => this.uriMatchesCurrentScope(uri),
		documentUri: document => document.uri,
		documentLines: document => this.documentLines(document),
		documentLanguage: document => document.languageId,
		readSource: uri => this.readCodeMarkerFile(uri),
		synchronizeSnapshot: (uri, lines, languageId) => this.synchronizeCodeMarkerSnapshot(uri, lines, languageId),
		persistChanges: paths => this.persistCodeMarkerChanges(paths.map(uri => uri.fsPath)),
	}

	private codeMarkerDocumentSyncPort(): CodeMarkerDocumentSyncPort<vscode.TextDocument, vscode.Uri> {
		return this.codeMarkerDocumentSyncPortAdapter
	}

	private createCodeMarkerSyncLifecyclePort(): CodeMarkerSyncLifecyclePort<vscode.Uri, vscode.Disposable> {
		return {
			isFileUri: uri => uri.scheme === 'file',
			isExcluded: uri => this.isExcludedCodeMarkerUri(uri),
			profilesInitialized: () => this.languageCommentProfiles.isInitialized,
			supportsFile: filePath => this.languageCommentProfiles.supportsFile(filePath),
			filePath: uri => uri.fsPath,
			currentViewGeneration: () => this.viewLoadGeneration,
			isCurrentScope: uri => this.uriMatchesCurrentScope(uri),
			removeMarkers: uri => this.removeCodeMarkersForUri(uri),
			persistRemovedMarkers: uri => this.persistCodeMarkerChanges([uri.fsPath]),
			synchronizeUris: uris => this.syncCodeMarkersForUris(uris),
			reportFileSyncFailure: (uri, error) =>
				logger.error(`同步脚本 TODO/FIXME/BUG 失败（${uri.fsPath}）: ${errorMessage(error)}`),
			canWatchFiles: () => typeof vscode.workspace.createFileSystemWatcher === 'function',
			discoveryGlobs: () => this.languageCommentProfiles.discoveryGlobs(),
			watchFilePattern: (glob, onCreate, onChange, onDelete) => {
				const watcher = vscode.workspace.createFileSystemWatcher(glob)
				return [
					watcher.onDidCreate(onCreate),
					watcher.onDidChange(onChange),
					watcher.onDidDelete(onDelete),
					watcher,
				]
			},
			reportWatcherFailure: (glob, error) =>
				logger.error(`无法监听语言文件模式 ${glob}: ${errorMessage(error)}`),
			loadingViewGeneration: () => this.loadingViewGeneration,
			currentStorageScope: () => this.currentStorageScope,
			runWorkspaceScan: (scope, generation) => this.scanWorkspaceCodeMarkers(scope, generation),
			reportWorkspaceScanFailure: error =>
				logger.error(`后台扫描 TODO/FIXME/BUG 失败: ${errorMessage(error)}`),
		}
	}

	private readonly codeMarkerSyncLifecyclePortAdapter: CodeMarkerSyncLifecyclePort<
		vscode.Uri,
		vscode.Disposable
	> = this.createCodeMarkerSyncLifecyclePort()

	private codeMarkerSyncLifecyclePort(): CodeMarkerSyncLifecyclePort<vscode.Uri, vscode.Disposable> {
		return this.codeMarkerSyncLifecyclePortAdapter
	}

	public async syncCodeMarkersInDocument(document: vscode.TextDocument): Promise<boolean> {
		return runCodeMarkerDocumentSync(document, this.codeMarkerDocumentSyncPort())
	}

	private async readCodeMarkerFile(uri: vscode.Uri, allowLargeFile = false): Promise<{ lines: string[], languageId?: string } | undefined> {
		return this.codeMarkerSourceReader.read(uri, allowLargeFile, this.codeMarkerSourceReaderPort())
	}

	public async syncCodeMarkersForUris(uris: readonly vscode.Uri[]): Promise<void> {
		await runCodeMarkerUriSync(uris, this.codeMarkerDocumentSyncPort())
	}

	public scheduleCodeMarkerFileSync(uri: vscode.Uri, deleted = false): void {
		this.codeMarkerSyncLifecycle.scheduleFileSync(uri, deleted, this.codeMarkerSyncLifecyclePort())
	}

	private setupCodeMarkerFileWatchers(): void {
		this.codeMarkerSyncLifecycle.setupFileWatchers(this.codeMarkerSyncLifecyclePort())
	}

	private async reloadCodeMarkerLanguageProfiles(): Promise<void> {
		const viewGeneration = this.viewLoadGeneration
		await runCodeMarkerLanguageReload({
			reloadLanguageProfiles: () => this.languageCommentProfiles.reload(),
			isCurrent: () => !this.disposed && viewGeneration === this.viewLoadGeneration,
			setupFileWatchers: () => this.setupCodeMarkerFileWatchers(),
			resetWorkspaceScanScope: () => this.codeMarkerSyncLifecycle.invalidateWorkspaceScanScope(),
			synchronizeOpenDocuments: () => this.synchronizeOpenCodeMarkerDocuments(),
			scheduleWorkspaceScan: () => this.scheduleWorkspaceCodeMarkerScan(),
		})
	}

	private async synchronizeOpenCodeMarkerDocuments(): Promise<void> {
		runOpenCodeMarkerSync(vscode.workspace.textDocuments, this.codeMarkerDocumentSyncPort())
	}

	private fileNodeHasCodeMarkers(fileNode: Bookmark): boolean {
		return this.codeMarkerSnapshotCoordinator.fileNodeHasCodeMarkers(fileNode)
	}

	private scheduleWorkspaceCodeMarkerScan(): void {
		this.codeMarkerSyncLifecycle.scheduleWorkspaceScan(this.codeMarkerSyncLifecyclePort())
	}

	private async scanWorkspaceCodeMarkers(scope: string, generation: number): Promise<void> {
		const scopeUri = this.currentScopeUri()
		const workspaceFolder = scopeUri ? vscode.workspace.getWorkspaceFolder(scopeUri) : undefined
		await runWorkspaceCodeMarkerScan(scope, generation, MAX_BACKGROUND_CODE_MARKER_FILES, CODE_MARKER_SCAN_CONCURRENCY, {
			startMeasurement: () => performanceMonitor.start(),
			canDiscoverFiles: () => typeof vscode.workspace.findFiles === 'function' && typeof vscode.RelativePattern === 'function',
			workspaceFolder: () => workspaceFolder,
			discoveryGlobs: () => this.languageCommentProfiles.discoveryGlobs(),
			findFiles: async (folder, glob, limit) => vscode.workspace.findFiles(
				new vscode.RelativePattern(folder, glob),
				SOURCE_SCAN_EXCLUDE_GLOB,
				limit,
			),
			uriKey: uri => normalizedAbsolutePath(uri.fsPath),
			isCurrent: (candidateScope, candidateGeneration) => candidateGeneration === this.codeMarkerSyncLifecycle.currentWorkspaceScanGeneration
				&& this.currentStorageScope === candidateScope,
			warnDiscoveryTruncated: candidateScope => {
				this.codeMarkerSnapshotCoordinator.warnWorkspaceDiscoveryTruncated(
					candidateScope,
					MAX_BACKGROUND_CODE_MARKER_FILES,
					this.codeMarkerSnapshotPort(),
				)
			},
			existingMarkerCandidates: () => this.codeBookmarks.values
				.filter(fileNode => fileNode.isFile && this.fileNodeHasCodeMarkers(fileNode))
				.map(fileNode => ({
					uri: vscode.Uri.file(this.absoluteBookmarkPath(fileNode.path)),
					knownMarkerFile: true,
				})),
			scopeForUri: uri => this.storageScopeForUri(uri),
			isExcluded: uri => this.isExcludedCodeMarkerUri(uri),
			readSource: (uri, knownMarkerFile) => this.readCodeMarkerFile(uri, knownMarkerFile),
			synchronize: (uri, source) => this.synchronizeCodeMarkerSnapshot(uri, source.lines, source.languageId),
			removeMarkers: uri => this.removeCodeMarkersForUri(uri),
			sourceIsMissing: uri => this.codeMarkerSourceIsMissing(uri),
			markCompleted: candidateScope => this.codeMarkerSyncLifecycle.markWorkspaceScanCompleted(candidateScope),
			persistChanges: paths => this.persistCodeMarkerChanges(paths.map(uri => uri.fsPath)),
			measure: (startedAt, files, changedFiles) => performanceMonitor.measure('workspace-code-marker-scan', startedAt, {
				files,
				changedFiles,
			}),
			reportDiscoveryFailure: (glob, error) => logger.error(`无法按语言文件模式扫描 ${glob}: ${errorMessage(error)}`),
		})
	}

	public constructor(context: vscode.ExtensionContext) {
		this.context = context
		const extensionChangeListener = vscode.extensions.onDidChange(() => {
			void this.reloadCodeMarkerLanguageProfiles()
				.catch(error => logger.error(`刷新语言注释配置失败: ${errorMessage(error)}`))
		})

		// Create decoration type for inline ghost text (bookmark label at end of line)
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

	// Inline ghost text decoration
	private _inlineLabelDecorationType: vscode.TextEditorDecorationType;

	init(treeView: vscode.TreeView<Bookmark>): void {
		this.treeView = treeView;
		const selectionListener = treeView.onDidChangeSelection((event) => {
			const hasSelection = event.selection && event.selection.length > 0 && event.selection.some(e => isBookmarkItemContext(e.contextValue));
			void this.setContextValue('codebookmark.hasSelection', hasSelection)
				.catch(error => logger.error(`更新书签选择上下文失败: ${errorMessage(error)}`));
		});

		// Setup cursor change listener for inline ghost text
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
				.catch(error => logger.error(`同步无活动脚本时的书签视图失败: ${errorMessage(error)}`))
		});
		const tabListener = vscode.window.tabGroups.onDidChangeTabs(() => {
			this.bookmarkContextCoordinator.handleTabsChanged(this.bookmarkContextPort())
			void this.synchronizeIdleView()
				.catch(error => logger.error(`同步脚本标签页变化后的书签视图失败: ${errorMessage(error)}`))
		})
		this.context.subscriptions.push(selectionListener, cursorListener, editorListener, tabListener)

		// TreeDataProvider registration is already complete at this point. Disk access is
		// deliberately detached from extension activation so a slow/network storage root
		// can never make VS Code time out activation or leave getChildren() unresolved.
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
			logger.error(`Error in getChildren: ${details}`);
			return [];
		}
	}

	private _getChildrenInternal(element?: Bookmark): Bookmark[] {
		return this.bookmarkTreeDataProjection.children(element, this.bookmarkTreeDataProjectionPort())
	}

	getTreeItem(element: Bookmark): vscode.TreeItem {
		return this.bookmarkTreeDataProjection.treeItem(element, this.bookmarkTreeDataProjectionPort())
	}

	// Drag-and-Drop
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
				logger.error(`延迟处理书签配置变更失败: ${errorMessage(error)}`)
				return
			case 'processing':
				logger.error(`处理书签配置变更失败: ${errorMessage(error)}`)
				return
			case 'classification':
				logger.error(`比对书签配置变更失败（${directory}）: ${errorMessage(error)}`)
				return
			case 'setup':
				logger.error('Failed to setup config watcher: ' + error)
				return
			case 'watcher':
				logger.error(`书签配置监听器失败（${directory}）: ${errorMessage(error)}`)
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
			reportFailure: error => logger.error(`后台书签增强初始化失败: ${errorMessage(error)}`),
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
		const languageProfilesReady = this.languageCommentProfiles.initialize()
		if (generation !== this.viewLoadGeneration || this.disposed) return
		this.viewLoads.markLoading(generation)
		try {
			if (!preserveLoadedContext) await this.setContextValue(Commands.varBookmarkLoaded, false)
			await this.setContextValue(Commands.varBookmarkLoadFailed, false)
		} catch (error) {
			logger.error(`设置书签加载状态失败: ${errorMessage(error)}`)
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
			reportFailure: error => logger.error(`加载书签数据失败: ${errorMessage(error)}`),
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
			reportContextFailure: error => logger.error(`结束书签加载状态失败: ${errorMessage(error)}`),
			refreshDecorations: () => this.refreshDecoration(false, false),
			saveAllBookmarks: () => this.saveAllBookmarksToFile(),
			persistWorkspaceOrder: (prepared, candidateGeneration) => this.persistWorkspaceOrderSnapshot({
				order: prepared.workspaceOrder,
				filePath: prepared.workspaceOrderFilePath,
				needsPersist: prepared.workspaceOrderNeedsPersist,
			}, prepared.storageScope, candidateGeneration),
			startConfigWatcher: candidateGeneration => {
				void this.setupConfigWatcher(candidateGeneration)
					.catch(error => logger.error(`设置书签配置监听器失败: ${errorMessage(error)}`))
			},
			// Disk-backed bookmark data is the core startup path. Language profiles and
			// marker reconciliation can run after the tree becomes interactive.
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
			warnRememberedFallback: () => logger.showWarningMessage('当前书签存储路径无效，已继续使用上次验证成功的目录。'),
			reportTransferFailure: error => logger.error(`启动时转移书签存储目录失败: ${errorMessage(error)}`),
			showTransferFailure: error => {
				void vscode.window.showErrorMessage(`目标书签存储目录尚未启用，已继续使用来源目录：${errorMessage(error)}`)
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
			.catch(error => logger.error(`更新书签命令上下文失败: ${errorMessage(error)}`))
		
		if (fireTree) this._onDidChangeTreeData.fire()

		// Refresh inline ghost text for current editor
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
				? 'TODO/FIXME/BUG 书签由源码标记自动管理，不可删除。'
				: `选中的 ${count} 个 TODO/FIXME/BUG 书签由源码标记自动管理，不可删除。`,
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

	private manualBookmarkWorkflowPort(): ManualBookmarkWorkflowPort {
		return {
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
				if (!await fileUtils.writeJsonFileAsync(orderFile, order)) {
					logger.showWarningMessage('无法保存工作区文件排序，请检查书签存储路径权限。')
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

	async forceAddBookmark(editor: vscode.TextEditor): Promise<void> {
		return runForceAddBookmark(editor, this.manualBookmarkWorkflowPort())
	}
	async generateBookmarksWithAI(editor: vscode.TextEditor, mode: AIGenerationMode): Promise<void> {
		return runGenerateBookmarksForFile(editor, mode, this.aiSingleFileWorkflowPort())
	}

	async optimizeBookmarksWithAI(editor: vscode.TextEditor): Promise<void> {
		return runOptimizeBookmarksForFile(editor, this.aiSingleFileWorkflowPort())
	}

	private async folderBookmarkPresence(dirPath: string): Promise<AIFolderBookmarkPresence> {
		return this.aiFolderPresence.getPresence(
			dirPath,
			bookmarkPathPresenceSignature(this.codeBookmarks.values),
			async () => {
				const presence = {
					hasBookmarkedScript: false,
					hasUnbookmarkedScript: false,
				}
				await visitAISourceFilesInFolder(dirPath, filePath => {
					const relativePath = fileUtils.absoluteToRelative(filePath)
					if (this.getBookmarksByPath(relativePath).length === 0) {
						presence.hasUnbookmarkedScript = true
					} else {
						presence.hasBookmarkedScript = true
					}
					return presence.hasBookmarkedScript && presence.hasUnbookmarkedScript
				})
				return presence
			},
		)
	}

	private async aiFolderWorkflowTarget(): Promise<AIFolderWorkflowTarget> {
		const editor = vscode.window.activeTextEditor?.document.uri.scheme === 'file'
			? vscode.window.activeTextEditor
			: undefined
		if (editor) {
			await this.ensureEditorScope(editor)
			return {
				directory: path.dirname(editor.document.uri.fsPath),
				storageScope: this.storageScopeForUri(editor.document.uri),
			}
		}

		const directory = this.workspaceFolderRootForCurrentScope()
		if (!directory) throw new Error('请先打开文件夹或工作区。')
		const storageScope = this.storageScopeForUri(vscode.Uri.file(directory))
		await this.refresh(undefined, storageScope)
		return { directory, storageScope }
	}

	async generateBookmarksForFolderWithAI(mode: AIGenerationMode): Promise<void> {
		return runGenerateBookmarksForFolder(
			await this.aiFolderWorkflowTarget(),
			mode,
			this.aiFolderWorkflowPort(),
		)
	}

	async optimizeBookmarksForFolderWithAI(): Promise<void> {
		return runOptimizeBookmarksForFolder(
			await this.aiFolderWorkflowTarget(),
			this.aiFolderWorkflowPort(),
		)
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
		reportFailure: error => logger.error(`书签位置跟踪失败: ${errorMessage(error)}`),
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
	// **************** file
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
			reportPreviousFailure: error => logger.error(`上一次书签存储目录转移失败: ${errorMessage(error)}`),
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
				reportReadFailure: error => logger.error(`读取工作区书签排序失败: ${errorMessage(error)}`),
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
				logger.showWarningMessage('无法保存工作区文件排序，请检查书签存储路径权限。')
			}
		}).catch(error => logger.error(`保存工作区书签排序失败: ${errorMessage(error)}`))
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
				this.codeMarkerSyncLifecycle.resetWorkspaceScan()
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
			resetCodeMarkerScan: () => this.codeMarkerSyncLifecycle.resetWorkspaceScan(),
			queueBookmarkPresenceContexts: () => this.queueBookmarkPresenceContexts(),
			restoreConfigWatcher: generation => {
				void this.setupConfigWatcher(generation)
					.catch(error => logger.error(`恢复书签配置监听器失败: ${errorMessage(error)}`))
			},
			restoreBackgroundEnhancements: generation => {
				void this.initializeBackgroundEnhancements(
					this.languageCommentProfiles.initialize(),
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
			reportRefreshFailure: error => logger.error(`刷新书签视图失败: ${errorMessage(error)}`),
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

	// On click item button
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
			writeWorkspaceOrder: (filePath, order) => fileUtils.writeJsonFileAsync(filePath, order),
			reportWorkspaceOrderSaveFailure: () =>
				logger.showWarningMessage('无法保存撤销后的工作区文件顺序，请检查书签存储路径权限。'),
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
		this.codeMarkerSyncLifecycle.dispose()
		this.bookmarkDocumentChangeCoordinator.dispose()
		this.viewRefreshCoordinator.dispose()
		this.saveCoordinator.dispose()
		this._onDidChangeTreeData.dispose()
	}
}
