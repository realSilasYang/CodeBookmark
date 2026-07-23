/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `CodeMarkerWorkflowController`。
 *
 * 实现要点：把上层意图编排为多个纯工作流，并在单一边界适配 VS Code 与持久化依赖。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`CodeMarkerWorkflowController`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import type { Bookmark } from '../models/Bookmark'
import type { BookmarkSet } from '../models/BookmarkSet'
import { fileUtils } from '../util/FileUtils'
import { LanguageCommentProfileRegistry } from '../util/LanguageCommentProfiles'
import { logger } from '../util/Logger'
import { normalizedAbsolutePath } from '../util/AbsolutePath'
import { performanceMonitor } from '../util/PerformanceMonitor'
import {
	isExcludedSourceRelativePath,
	SOURCE_SCAN_EXCLUDE_GLOB,
} from '../util/SourceFilePolicy'
import {
	synchronizeCodeMarkersForUris,
	synchronizeCodeMarkersInDocument,
	synchronizeOpenCodeMarkerDocuments,
	type CodeMarkerDocumentSyncPort,
} from './CodeMarkerDocumentSync'
import { reloadCodeMarkerLanguageProfiles } from './CodeMarkerLanguageReloadRunner'
import {
	CodeMarkerSnapshotCoordinator,
	type CodeMarkerSnapshotPort,
} from './CodeMarkerSnapshotCoordinator'
import {
	CodeMarkerSourceReader,
	type CodeMarkerSourceReaderPort,
} from './CodeMarkerSourceReader'
import {
	CodeMarkerSyncLifecycle,
	type CodeMarkerSyncLifecyclePort,
} from './CodeMarkerSyncLifecycle'
import { scanWorkspaceCodeMarkers } from './WorkspaceCodeMarkerScanRunner'

const MAX_BACKGROUND_CODE_MARKER_FILES = 2_000
const CODE_MARKER_SCAN_CONCURRENCY = 4

interface CodeMarkerWorkflowPort {
	bookmarks(): BookmarkSet
	currentScopeUri(): vscode.Uri | undefined
	currentStorageScope(): string | undefined
	currentViewGeneration(): number
	loadingViewGeneration(): number | undefined
	isCurrentScope(uri: vscode.Uri): boolean
	isDisposed(): boolean
	absoluteBookmarkPath(bookmarkPath: string): string
	storageScopeForUri(uri: vscode.Uri): string
	invalidatePathIndex(): void
	saveBookmarks(absolutePaths: readonly string[]): void
	refreshDecorations(): void
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

export class CodeMarkerWorkflowController {
	private readonly profiles = new LanguageCommentProfileRegistry()
	private readonly snapshots = new CodeMarkerSnapshotCoordinator<vscode.Uri>()
	private readonly sourceReader = new CodeMarkerSourceReader<vscode.TextDocument, vscode.Uri>()
	private readonly lifecycle = new CodeMarkerSyncLifecycle<vscode.Uri, vscode.Disposable>()

	constructor(private readonly port: CodeMarkerWorkflowPort) {}

	initializeLanguageProfiles(): Promise<void> {
		return this.profiles.initialize()
	}

	sourceFilesChanged(): void {
		this.lifecycle.invalidateWorkspaceScanScope()
		this.scheduleWorkspaceScan()
	}

	cancelPath(absolutePath: string): void {
		this.lifecycle.cancelPath(absolutePath)
	}

	async syncDocument(document: vscode.TextDocument): Promise<boolean> {
		return synchronizeCodeMarkersInDocument(document, this.documentSyncPort())
	}

	async syncUris(uris: readonly vscode.Uri[]): Promise<void> {
		await synchronizeCodeMarkersForUris(uris, this.documentSyncPort())
	}

	scheduleFileSync(uri: vscode.Uri, deleted = false): void {
		this.lifecycle.scheduleFileSync(uri, deleted, this.lifecyclePort())
	}

	setupFileWatchers(): void {
		this.lifecycle.setupFileWatchers(this.lifecyclePort())
	}

	async reloadLanguageProfiles(): Promise<void> {
		const viewGeneration = this.port.currentViewGeneration()
		await reloadCodeMarkerLanguageProfiles({
			reloadLanguageProfiles: () => this.profiles.reload(),
			isCurrent: () => !this.port.isDisposed() && viewGeneration === this.port.currentViewGeneration(),
			setupFileWatchers: () => this.setupFileWatchers(),
			resetWorkspaceScanScope: () => this.lifecycle.invalidateWorkspaceScanScope(),
			synchronizeOpenDocuments: () => this.synchronizeOpenDocuments(),
			scheduleWorkspaceScan: () => this.scheduleWorkspaceScan(),
		})
	}

	async synchronizeOpenDocuments(): Promise<void> {
		synchronizeOpenCodeMarkerDocuments(vscode.workspace.textDocuments, this.documentSyncPort())
	}

	fileNodeHasMarkers(fileNode: Bookmark): boolean {
		return this.snapshots.fileNodeHasCodeMarkers(fileNode)
	}

	synchronizeMarkerSnapshot(uri: vscode.Uri, lines: readonly string[], languageId?: string) {
		return this.synchronizeSnapshot(uri, lines, languageId)
	}

	persistMarkerChanges(changedPaths: readonly string[]): void {
		this.persistChanges(changedPaths)
	}

	scheduleWorkspaceScan(): void {
		this.lifecycle.scheduleWorkspaceScan(this.lifecyclePort())
	}

	resetWorkspaceScan(): void {
		this.lifecycle.resetWorkspaceScan()
	}

	dispose(): void {
		this.lifecycle.dispose()
	}

	private documentLines(document: vscode.TextDocument): string[] {
		return Array.from({ length: document.lineCount }, (_, line) => document.lineAt(line).text)
	}

	private readonly snapshotPortAdapter: CodeMarkerSnapshotPort<vscode.Uri> = {
		isFileUri: uri => uri.scheme === 'file',
		isCurrentScope: uri => this.port.isCurrentScope(uri),
		filePath: uri => uri.fsPath,
		relativeBookmarkPath: absolutePath => fileUtils.absoluteToRelative(absolutePath),
		bookmarks: () => this.port.bookmarks(),
		profileFor: (languageId, filePath) => this.profiles.profileFor(languageId, filePath),
		warnFileTruncated: (filePath, limit) => logger.showWarningMessage(localize(
			`脚本 ${path.basename(filePath)} 中的 TODO/FIXME/BUG 超过 ${limit} 个，仅同步前 ${limit} 个以避免书签配置异常膨胀。`,
			`${path.basename(filePath)} contains more than ${limit} TODO/FIXME/BUG markers. Only the first ${limit} were synchronized to prevent excessive bookmark configuration growth.`,
		)),
		warnFileCapacityLimited: filePath => logger.showWarningMessage(localize(
			`脚本 ${path.basename(filePath)} 的手动书签与自动标记已达到 10000 个节点上限；为保证配置可读取，未继续生成其余 TODO/FIXME/BUG 书签。`,
			`Manual bookmarks and automatic markers in ${path.basename(filePath)} have reached the 10,000-node limit. Remaining TODO/FIXME/BUG bookmarks were not generated so the configuration stays readable.`,
		)),
		warnWorkspaceDiscoveryTruncated: (_scope, maxFiles) => logger.showWarningMessage(localize(
			`当前工作区脚本超过 ${maxFiles} 个；后台仅扫描前 ${maxFiles} 个，其他脚本会在打开或编辑时自动同步 TODO/FIXME/BUG。`,
			`The current workspace contains more than ${maxFiles} scripts. The background scan covers the first ${maxFiles}; TODO/FIXME/BUG markers in other scripts will synchronize when those files are opened or edited.`,
		)),
		invalidatePathIndex: () => this.port.invalidatePathIndex(),
		saveBookmarks: absolutePaths => this.port.saveBookmarks(absolutePaths),
		refreshDecorations: () => this.port.refreshDecorations(),
	}

	private snapshotPort(): CodeMarkerSnapshotPort<vscode.Uri> {
		return this.snapshotPortAdapter
	}

	private readonly sourceReaderPortAdapter: CodeMarkerSourceReaderPort<vscode.TextDocument, vscode.Uri> = {
		openDocuments: () => vscode.workspace.textDocuments,
		documentUri: document => document.uri,
		isFileUri: uri => uri.scheme === 'file',
		filePath: uri => uri.fsPath,
		sameFilePath: (left, right) => normalizedAbsolutePath(left) === normalizedAbsolutePath(right),
		documentLines: document => this.documentLines(document),
		documentLanguage: document => document.languageId,
		profilesInitialized: () => this.profiles.isInitialized,
		supportsFile: filePath => this.profiles.supportsFile(filePath),
		statFile: async filePath => {
			const stat = await fs.promises.stat(filePath)
			return { isFile: stat.isFile(), size: stat.size }
		},
		readTextFile: filePath => fs.promises.readFile(filePath, 'utf8'),
	}

	private sourceReaderPort(): CodeMarkerSourceReaderPort<vscode.TextDocument, vscode.Uri> {
		return this.sourceReaderPortAdapter
	}

	private removeMarkers(uri: vscode.Uri): boolean {
		return this.snapshots.removeMarkers(uri, this.snapshotPort())
	}

	private async sourceIsMissing(uri: vscode.Uri): Promise<boolean> {
		try {
			return !(await fs.promises.stat(uri.fsPath)).isFile()
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code
			return code === 'ENOENT' || code === 'ENOTDIR'
		}
	}

	private synchronizeSnapshot(uri: vscode.Uri, lines: readonly string[], languageId?: string) {
		return this.snapshots.synchronizeSnapshot(uri, lines, languageId, this.snapshotPort())
	}

	private persistChanges(changedPaths: readonly string[]): void {
		this.snapshots.persistChanges(changedPaths, this.snapshotPort())
	}

	private readonly documentSyncPortAdapter: CodeMarkerDocumentSyncPort<vscode.TextDocument, vscode.Uri> = {
		initializeLanguageProfiles: () => this.profiles.initialize(),
		currentGeneration: () => this.port.currentViewGeneration(),
		isFileUri: uri => uri.scheme === 'file',
		isCurrentScope: uri => this.port.isCurrentScope(uri),
		documentUri: document => document.uri,
		documentLines: document => this.documentLines(document),
		documentLanguage: document => document.languageId,
		readSource: uri => this.readFile(uri),
		synchronizeSnapshot: (uri, lines, languageId) => this.synchronizeSnapshot(uri, lines, languageId),
		persistChanges: uris => this.persistChanges(uris.map(uri => uri.fsPath)),
	}

	private documentSyncPort(): CodeMarkerDocumentSyncPort<vscode.TextDocument, vscode.Uri> {
		return this.documentSyncPortAdapter
	}

	private isExcluded(uri: vscode.Uri): boolean {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
		if (!workspaceFolder) return false
		return isExcludedSourceRelativePath(path.relative(workspaceFolder.uri.fsPath, uri.fsPath))
	}

	private createLifecyclePort(): CodeMarkerSyncLifecyclePort<vscode.Uri, vscode.Disposable> {
		return {
			isFileUri: uri => uri.scheme === 'file',
			isExcluded: uri => this.isExcluded(uri),
			profilesInitialized: () => this.profiles.isInitialized,
			supportsFile: filePath => this.profiles.supportsFile(filePath),
			filePath: uri => uri.fsPath,
			currentViewGeneration: () => this.port.currentViewGeneration(),
			isCurrentScope: uri => this.port.isCurrentScope(uri),
			removeMarkers: uri => this.removeMarkers(uri),
			persistRemovedMarkers: uri => this.persistChanges([uri.fsPath]),
			synchronizeUris: uris => this.syncUris(uris),
			reportFileSyncFailure: (uri, error) => logger.error(localize(
				`同步脚本 TODO/FIXME/BUG 失败（${uri.fsPath}）: ${errorMessage(error)}`,
				`Failed to synchronize TODO/FIXME/BUG markers in the script (${uri.fsPath}): ${errorMessage(error)}`,
			)),
			canWatchFiles: () => typeof vscode.workspace.createFileSystemWatcher === 'function',
			discoveryGlobs: () => this.profiles.discoveryGlobs(),
			watchFilePattern: (glob, onCreate, onChange, onDelete) => {
				const watcher = vscode.workspace.createFileSystemWatcher(glob)
				return [
					watcher.onDidCreate(onCreate),
					watcher.onDidChange(onChange),
					watcher.onDidDelete(onDelete),
					watcher,
				]
			},
			reportWatcherFailure: (glob, error) => logger.error(localize(
				`无法监听语言文件模式 ${glob}: ${errorMessage(error)}`,
				`Unable to watch language file pattern ${glob}: ${errorMessage(error)}`,
			)),
			loadingViewGeneration: () => this.port.loadingViewGeneration(),
			currentStorageScope: () => this.port.currentStorageScope(),
			runWorkspaceScan: (scope, generation) => this.scanWorkspace(scope, generation),
			reportWorkspaceScanFailure: error => logger.error(localize(
				`后台扫描 TODO/FIXME/BUG 失败: ${errorMessage(error)}`,
				`Background TODO/FIXME/BUG scan failed: ${errorMessage(error)}`,
			)),
		}
	}

	private readonly lifecyclePortAdapter = this.createLifecyclePort()

	private lifecyclePort(): CodeMarkerSyncLifecyclePort<vscode.Uri, vscode.Disposable> {
		return this.lifecyclePortAdapter
	}

	private readFile(uri: vscode.Uri, allowLargeFile = false): Promise<{ lines: string[], languageId?: string } | undefined> {
		return this.sourceReader.read(uri, allowLargeFile, this.sourceReaderPort())
	}

	private async scanWorkspace(scope: string, generation: number): Promise<void> {
		const scopeUri = this.port.currentScopeUri()
		const workspaceFolder = scopeUri ? vscode.workspace.getWorkspaceFolder(scopeUri) : undefined
		await scanWorkspaceCodeMarkers(scope, generation, MAX_BACKGROUND_CODE_MARKER_FILES, CODE_MARKER_SCAN_CONCURRENCY, {
			startMeasurement: () => performanceMonitor.start(),
			canDiscoverFiles: () => typeof vscode.workspace.findFiles === 'function' && typeof vscode.RelativePattern === 'function',
			workspaceFolder: () => workspaceFolder,
			discoveryGlobs: () => this.profiles.discoveryGlobs(),
			findFiles: async (folder, glob, limit) => vscode.workspace.findFiles(
				new vscode.RelativePattern(folder, glob),
				SOURCE_SCAN_EXCLUDE_GLOB,
				limit,
			),
			uriKey: uri => normalizedAbsolutePath(uri.fsPath),
			isCurrent: (candidateScope, candidateGeneration) => candidateGeneration === this.lifecycle.currentWorkspaceScanGeneration
				&& this.port.currentStorageScope() === candidateScope,
			warnDiscoveryTruncated: candidateScope => this.snapshots.warnWorkspaceDiscoveryTruncated(
				candidateScope,
				MAX_BACKGROUND_CODE_MARKER_FILES,
				this.snapshotPort(),
			),
			existingMarkerCandidates: () => this.port.bookmarks().values
				.filter(fileNode => fileNode.isFile && this.fileNodeHasMarkers(fileNode))
				.map(fileNode => ({
					uri: vscode.Uri.file(this.port.absoluteBookmarkPath(fileNode.path)),
					knownMarkerFile: true,
				})),
			scopeForUri: uri => this.port.storageScopeForUri(uri),
			isExcluded: uri => this.isExcluded(uri),
			readSource: (uri, knownMarkerFile) => this.readFile(uri, knownMarkerFile),
			synchronize: (uri, source) => this.synchronizeSnapshot(uri, source.lines, source.languageId),
			removeMarkers: uri => this.removeMarkers(uri),
			sourceIsMissing: uri => this.sourceIsMissing(uri),
			markCompleted: candidateScope => this.lifecycle.markWorkspaceScanCompleted(candidateScope),
			persistChanges: uris => this.persistChanges(uris.map(uri => uri.fsPath)),
			measure: (startedAt, files, changedFiles) => performanceMonitor.measure('workspace-code-marker-scan', startedAt, {
				files,
				changedFiles,
			}),
			reportDiscoveryFailure: (glob, error) => logger.error(localize(
				`无法按语言文件模式扫描 ${glob}: ${errorMessage(error)}`,
				`Unable to scan language file pattern ${glob}: ${errorMessage(error)}`,
			)),
		})
	}
}
