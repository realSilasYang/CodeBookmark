/**
 * 登记编辑器、文档和文件系统事件，把切换、编辑、保存、创建、删除与重命名传给提供器。
 * 非 file 编辑器不会改变当前书签作用域；所有订阅都加入扩展上下文以便停用时统一释放。
 */
import * as vscode from 'vscode'
import * as path from 'path'
import { CodeBookmarksViewProvider } from '../providers/CodeBookmarkViewProvider'
import { bookmarkRepository } from '../repository/BookmarkRepository'
import { logger } from '../util/Logger'
import { localize } from '../i18n/Localization'
import { ExtensionConfig } from '../config/ExtensionConfig'
import { isExcludedSourceRelativePath } from '../util/SourceFilePolicy'
export function fileEditorSubscriber(context: vscode.ExtensionContext,
	bookmarkProvider: CodeBookmarksViewProvider,
) {
	const sourceFileWatchers: vscode.Disposable[] = []
	const pendingSourceAppearances = new Set<string>()
	let sourceAppearanceTimer: NodeJS.Timeout | undefined
	const isEligibleWorkspaceSource = (workspaceFolder: vscode.WorkspaceFolder, uri: vscode.Uri): boolean => {
		if (uri.scheme !== 'file') return false
		const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath)
		return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
			&& !isExcludedSourceRelativePath(relativePath)
	}
	const isEligibleSource = (uri: vscode.Uri): boolean => {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
		return uri.scheme === 'file' && (!workspaceFolder || isEligibleWorkspaceSource(workspaceFolder, uri))
	}
	const reconcileSourceAppearances = async (): Promise<void> => {
		const paths = [...pendingSourceAppearances]
		pendingSourceAppearances.clear()
		if (paths.length === 0) return
		const changes = await bookmarkRepository.handleFileAppearances(paths)
		await bookmarkProvider.applyRepositoryRelocations(changes)
	}
	const scheduleSourceAppearance = (absolutePath: string): void => {
		pendingSourceAppearances.add(path.resolve(absolutePath))
		if (sourceAppearanceTimer) clearTimeout(sourceAppearanceTimer)
		sourceAppearanceTimer = setTimeout(() => {
			sourceAppearanceTimer = undefined
			void reconcileSourceAppearances().catch(error =>
				logger.error(localize("subscriptions.fileEditorSubscriber.sourceFileAppearanceBatchRebindFailed", { error })))
		}, 150)
	}
	const disposeSourceFileWatchers = (): void => {
		if (sourceAppearanceTimer) clearTimeout(sourceAppearanceTimer)
		sourceAppearanceTimer = undefined
		pendingSourceAppearances.clear()
		for (const watcher of sourceFileWatchers) watcher.dispose()
		sourceFileWatchers.length = 0
	}
	const setupSourceFileWatchers = (): void => {
		disposeSourceFileWatchers()
		if (typeof vscode.workspace.createFileSystemWatcher !== 'function') return
		for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
			if (workspaceFolder.uri.scheme !== 'file') continue
			try {
				const watcher = vscode.workspace.createFileSystemWatcher(
					new vscode.RelativePattern(workspaceFolder, '**/*'),
				)
					sourceFileWatchers.push(
					watcher.onDidCreate(uri => {
						if (!isEligibleWorkspaceSource(workspaceFolder, uri)) return
						scheduleSourceAppearance(uri.fsPath)
					}),
					watcher,
				)
			} catch (error) {
				logger.error(localize("subscriptions.fileEditorSubscriber.unableToWatchWorkspaceSourceFiles", { error }))
			}
		}
	}
	setupSourceFileWatchers()

	const documentChanges = vscode.workspace.onDidChangeTextDocument(event => {
		bookmarkProvider.changeContentFile(event)
	})

	const focusEditor = vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			const scheme = editor.document.uri.scheme;
			// 设置页、欢迎页和虚拟文档没有可绑定的磁盘脚本。遇到它们时保留工作区作用域，
			// 不能把一次非文件编辑器切换误解成“离开当前书签目录”。
			if (scheme !== 'file') return
			void bookmarkProvider.reloadActiveTab().catch(error => logger.error(localize("subscriptions.fileEditorSubscriber.failedToLoadBookmarksAfterSwitchingFiles", { error })))
		}
	})

	const openDocuments = vscode.workspace.onDidOpenTextDocument(document => {
		if (isEligibleSource(document.uri)) {
			scheduleSourceAppearance(document.uri.fsPath)
		}
		void bookmarkProvider.syncCodeMarkersInDocument(document)
			.catch(error => logger.error(localize("subscriptions.fileEditorSubscriber.failedToSynchronizeTodoFixmeBugBookmarksAfterOpening", { fsPath: document.uri.fsPath, error })))
	})

	const createFiles = vscode.workspace.onDidCreateFiles(event => {
		bookmarkProvider.onSourceFilesChanged()
		for (const uri of event.files) {
			if (isEligibleSource(uri)) {
				scheduleSourceAppearance(uri.fsPath)
			}
			bookmarkProvider.scheduleCodeMarkerFileSync(uri)
		}
	})

	const renameFiles = vscode.workspace.onDidRenameFiles(event => {
		void (async () => {
			for (const file of event.files) {
				try {
					await bookmarkRepository.handleFileRename(file.oldUri.fsPath, file.newUri.fsPath)
				} catch (error) {
					logger.error(localize("subscriptions.fileEditorSubscriber.failedToTransferBookmarkConfigurationForRenamedFile", { fsPath: file.oldUri.fsPath, error }))
				}
				try {
					await bookmarkProvider.onRenameDirectory(file.oldUri.fsPath, file.newUri.fsPath)
				} catch (error) {
					logger.error(localize("subscriptions.fileEditorSubscriber.failedToUpdateInMemoryBookmarksForRenamedFile", { fsPath: file.oldUri.fsPath, error }))
				}
			}
			bookmarkProvider.onSourceFilesChanged()
		})().catch(error => logger.error(localize("subscriptions.fileEditorSubscriber.failedToProcessFileRenameEvent", { error })))
	})

	const deleteFiles = vscode.workspace.onDidDeleteFiles(event => {
		void (async () => {
			for (const file of event.files) {
				try {
					await bookmarkRepository.handleFileDelete(file.fsPath)
				} catch (error) {
					logger.error(localize("subscriptions.fileEditorSubscriber.failedToRemoveBookmarkConfigurationForDeletedFile", { fsPath: file.fsPath, error }))
				}
				try {
					bookmarkProvider.onDeleteDirectory(file.fsPath)
				} catch (error) {
					logger.error(localize("subscriptions.fileEditorSubscriber.failedToUpdateInMemoryBookmarksForDeletedFile", { fsPath: file.fsPath, error }))
				}
			}
			bookmarkProvider.onSourceFilesChanged()
		})().catch(error => logger.error(localize("subscriptions.fileEditorSubscriber.failedToProcessFileDeletionEvent", { error })))
	})

	const configurationChanges = vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('codebookmark')) ExtensionConfig.invalidate()
		if (event.affectsConfiguration('codebookmark.defaultExpandLevel')) {
			bookmarkProvider.refreshExpandCollapseContext()
		}
		if (event.affectsConfiguration('codebookmark.globalStoragePath')) {
			void bookmarkProvider.onStoragePathChanged().catch(error => logger.error(localize("subscriptions.fileEditorSubscriber.failedToSwitchTheBookmarkStoragePath", { error })))
		} else if (event.affectsConfiguration('codebookmark.inlineLabel')) {
			bookmarkProvider.onDisplayConfigurationChanged()
		}
	})

	const workspaceFolderChanges = vscode.workspace.onDidChangeWorkspaceFolders(() => {
		setupSourceFileWatchers()
		void bookmarkProvider.onWorkspaceFoldersChanged().catch(error => logger.error(localize("subscriptions.fileEditorSubscriber.failedToLoadBookmarksAfterWorkspaceFoldersChanged", { error })))
	})

	context.subscriptions.push(
		documentChanges,
		focusEditor,
		openDocuments,
		createFiles,
		renameFiles,
		deleteFiles,
		configurationChanges,
		workspaceFolderChanges,
		{ dispose: disposeSourceFileWatchers },
	)
}
