/**
 * 模块说明：本文件负责VS Code 事件订阅与生命周期清理，具体对象为 `fileEditorSubscriber`。
 *
 * 实现要点：订阅编辑器与文件系统事件，把事件转换为可取消的提供器操作并统一登记释放。
 * 核心边界：每个监听器都必须随扩展上下文释放，事件回调不得阻塞 Extension Host。
 * 主要入口：`fileEditorSubscriber`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
				logger.error(localize(`源码出现后的批量重新绑定失败：${error}`, `Source file appearance batch rebind failed: ${error}`)))
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
				logger.error(localize(`无法监听工作区源码文件：${error}`, `Unable to watch workspace source files: ${error}`))
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
			// 非文件编辑器不能切换或覆盖当前工作区的书签作用域。
			if (scheme !== 'file') return
			void bookmarkProvider.reloadActiveTab().catch(error => logger.error(localize(
				`切换文件后加载书签失败: ${error}`,
				`Failed to load bookmarks after switching files: ${error}`,
			)))
		}
	})

	const openDocuments = vscode.workspace.onDidOpenTextDocument(document => {
		if (isEligibleSource(document.uri)) {
			scheduleSourceAppearance(document.uri.fsPath)
		}
		void bookmarkProvider.syncCodeMarkersInDocument(document)
			.catch(error => logger.error(localize(
				`打开脚本后同步 TODO/FIXME/BUG 失败（${document.uri.fsPath}）: ${error}`,
				`Failed to synchronize TODO/FIXME/BUG bookmarks after opening ${document.uri.fsPath}: ${error}`,
			)))
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
					logger.error(localize(
						`转移重命名文件的书签配置失败（${file.oldUri.fsPath}）: ${error}`,
						`Failed to transfer bookmark configuration for renamed file ${file.oldUri.fsPath}: ${error}`,
					))
				}
				try {
					await bookmarkProvider.onRenameDirectory(file.oldUri.fsPath, file.newUri.fsPath)
				} catch (error) {
					logger.error(localize(
						`更新重命名文件的内存书签失败（${file.oldUri.fsPath}）: ${error}`,
						`Failed to update in-memory bookmarks for renamed file ${file.oldUri.fsPath}: ${error}`,
					))
				}
			}
			bookmarkProvider.onSourceFilesChanged()
		})().catch(error => logger.error(localize(
			`处理文件重命名事件失败: ${error}`,
			`Failed to process file rename event: ${error}`,
		)))
	})

	const deleteFiles = vscode.workspace.onDidDeleteFiles(event => {
		void (async () => {
			for (const file of event.files) {
				try {
					await bookmarkRepository.handleFileDelete(file.fsPath)
				} catch (error) {
					logger.error(localize(
						`删除文件的书签配置失败（${file.fsPath}）: ${error}`,
						`Failed to remove bookmark configuration for deleted file ${file.fsPath}: ${error}`,
					))
				}
				try {
					bookmarkProvider.onDeleteDirectory(file.fsPath)
				} catch (error) {
					logger.error(localize(
						`更新已删除文件的内存书签失败（${file.fsPath}）: ${error}`,
						`Failed to update in-memory bookmarks for deleted file ${file.fsPath}: ${error}`,
					))
				}
			}
			bookmarkProvider.onSourceFilesChanged()
		})().catch(error => logger.error(localize(
			`处理文件删除事件失败: ${error}`,
			`Failed to process file deletion event: ${error}`,
		)))
	})

	const configurationChanges = vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('codebookmark')) ExtensionConfig.invalidate()
		if (event.affectsConfiguration('codebookmark.defaultExpandLevel')) {
			bookmarkProvider.refreshExpandCollapseContext()
		}
		if (event.affectsConfiguration('codebookmark.globalStoragePath')) {
			void bookmarkProvider.onStoragePathChanged().catch(error => logger.error(localize(
				`切换书签存储路径失败: ${error}`,
				`Failed to switch the bookmark storage path: ${error}`,
			)))
		} else if (event.affectsConfiguration('codebookmark.inlineLabel')) {
			bookmarkProvider.onDisplayConfigurationChanged()
		}
	})

	const workspaceFolderChanges = vscode.workspace.onDidChangeWorkspaceFolders(() => {
		setupSourceFileWatchers()
		void bookmarkProvider.onWorkspaceFoldersChanged().catch(error => logger.error(localize(
			`工作区文件夹变更后加载书签失败: ${error}`,
			`Failed to load bookmarks after workspace folders changed: ${error}`,
		)))
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
