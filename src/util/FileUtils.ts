/**
 * 提供 JSON 原子读写与作用域路径解析，并为粘性引擎按文档归集手动书签。
 * 路径归集保留书签树结构，并使同一文档共享一次内容快照。
 */
import * as fs from "fs"
import * as vscode from 'vscode'
import { logger } from './Logger'
import path = require("path")
import type { Bookmark } from '../models/Bookmark'
import type { BookmarkSet } from '../models/BookmarkSet'
import { ExtensionConfig } from '../config/ExtensionConfig'
import { stableWorkspacePathHash } from './PathHash'
import { fileChangeFingerprints } from './FileChangeFingerprint'
import { temporarySiblingPath } from './AtomicFile'
import { StickyBookmarkTracker } from './StickyBookmarkTracker'
import { storageRootState } from './StorageRootState'
import { workspaceScopeFolderPath } from './WorkspaceScopeFolderLifecycle'
import { canonicalBookmarkPath } from './BookmarkPath'
import { localize } from '../i18n/Localization'
import { findOpenFileDocument } from './VscodeDocument'

const MAX_BOOKMARK_FILE_BYTES = 32 * 1024 * 1024

class FileUtils {
	private readonly stickyBookmarks = new StickyBookmarkTracker()

	async readJsonFileAsync(filePath: string): Promise<unknown> {
		try {
			const stat = await fs.promises.stat(filePath)
			if (stat.size > MAX_BOOKMARK_FILE_BYTES) throw new Error(localize("util.FileUtils.bookmarkFileExceedsBytes", { MAX_BOOKMARK_FILE_BYTES }))
			const data = await fs.promises.readFile(filePath, 'utf8')
			fileChangeFingerprints.rememberContent(filePath, data)
			return JSON.parse(data)
		} catch (error) {
			logger.error(localize("util.FileUtils.cannotReadJsonFile", { filePath }))
			logger.error(error)
			return null
		}
	}

	async writeJsonFileAsync(filePath: string, data: unknown): Promise<boolean> {
		const tmpPath = temporarySiblingPath(filePath)
		let contentHash: string | undefined
		try {
			const jsonData = JSON.stringify(data, null, 2)
			if (jsonData === undefined) throw new Error(localize("util.FileUtils.jsonValueIsNotSerializable"))
			await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
			const preparation = await fileChangeFingerprints.prepareWrite(filePath, jsonData)
			if (!preparation) {
				logger.error(localize("util.FileUtils.bookmarkFileChangedExternallyBeforeWrite", { filePath }))
				return false
			}
			contentHash = preparation.contentHash
			// 临时文件放在目标同目录，最后一次 rename 才让新内容对外可见；
			// 进程在写入中途退出时，原文件仍保持完整。
			await fs.promises.writeFile(tmpPath, jsonData, 'utf8')
			if (!await fileChangeFingerprints.isCurrentHash(filePath, preparation.expectedDiskHash)) {
				throw new Error(localize("util.FileUtils.bookmarkFileChangedExternallyDuringWrite", { filePath }))
			}
			await fs.promises.rename(tmpPath, filePath)
			fileChangeFingerprints.markWriteComplete(filePath, contentHash)
			return true
		} catch (error) {
			if (contentHash) fileChangeFingerprints.markWriteFailed(filePath, contentHash)
			logger.error(localize("util.FileUtils.cannotWriteJsonFile", { filePath }))
			logger.error(error)
			// 清理临时文件只是收尾。若清理也失败，仍抛出最先发生的写入错误，
			// 否则日志会把真正导致数据未保存的原因遮住。
			try { await fs.promises.unlink(tmpPath) } catch { /* 忽略临时文件清理失败 */ }
			return false
		}
	}

	async deleteJsonFileAsync(filePath: string): Promise<void> {
		await fileChangeFingerprints.trackDeletion(filePath, () => fs.promises.unlink(filePath))
	}

	updateBookmarkContextAnchors(bookmark: Bookmark, doc: vscode.TextDocument): boolean {
		return this.stickyBookmarks.updateContext(bookmark, doc)
	}

	reconcileDocumentBookmarks(
		bookmarks: readonly Bookmark[],
		document: vscode.TextDocument,
		changes?: readonly vscode.TextDocumentContentChangeEvent[],
	): number {
		return this.stickyBookmarks.reconcile(bookmarks, document, changes)
	}

	async readContentBookmarkInFile(
		bookmarks: BookmarkSet,
		scopeUri?: vscode.Uri,
		signal?: AbortSignal,
	): Promise<number> {
		const byPath = new Map<string, Bookmark[]>()
		const collect = (items: BookmarkSet): void => {
			for (const item of items) {
				if (signal?.aborted) return
				if (!item.isFile && !item.isCodeMarker && item.path) {
					const absolutePath = this.relativeToAbsolute(item.path, scopeUri)
					const group = byPath.get(absolutePath) ?? []
					group.push(item)
					byPath.set(absolutePath, group)
				}
				collect(item.subs)
			}
		}
		collect(bookmarks)
		let relocated = 0
		for (const [path, group] of byPath) {
			if (signal?.aborted) break
			const document = findOpenFileDocument(path)
			if (!document) continue
			try {
				relocated += this.reconcileDocumentBookmarks(group, document)
			} catch (error) {
				logger.error(localize("util.FileUtils.cannotUpdateBookmarkContentFromFile"))
				logger.error(error)
			}
		}
		return relocated
	}

	workspaceRoot(uri?: vscode.Uri): string {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) return ''
		const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri
		if (targetUri?.scheme === 'file') return vscode.workspace.getWorkspaceFolder(targetUri)?.uri.fsPath ?? ''
		return workspaceFolders[0].uri.fsPath
	}

	relativeToAbsolute(fsPath: string, scopeUri?: vscode.Uri): string {
		if (path.isAbsolute(fsPath)) return fsPath;
		const root = this.workspaceRoot(scopeUri)
		return root ? path.resolve(root, canonicalBookmarkPath(fsPath)) : fsPath
	}

	absoluteToRelative(fsPath: string): string {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fsPath))
		return workspaceFolder ? canonicalBookmarkPath(path.relative(workspaceFolder.uri.fsPath, fsPath)) : canonicalBookmarkPath(path.resolve(fsPath))
	}

	isWorkspaceMode(uri?: vscode.Uri): boolean {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) return false;
		
		if (!uri) {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				uri = editor.document.uri;
			}
		}
		
		if (uri?.scheme === 'file') {
			return vscode.workspace.getWorkspaceFolder(uri) !== undefined;
		}
		return true;
	}

	getGlobalBookmarkFolder(forceWorkspaceMode?: boolean, uri?: vscode.Uri, storageRootOverride?: string): string | null {
		let folder = storageRootOverride ?? storageRootState.root
		if (!folder) {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return null
			folder = ExtensionConfig.resolveStoragePath()
			storageRootState.activate(folder)
		}

		const useWorkspace = forceWorkspaceMode !== undefined ? forceWorkspaceMode : this.isWorkspaceMode(uri);

		if (useWorkspace) {
			const workspaceFolder = uri ? vscode.workspace.getWorkspaceFolder(uri) : undefined;
			const workspacePath = workspaceFolder ? workspaceFolder.uri.fsPath : this.workspaceRoot(uri);
			return this.getWorkspaceBookmarkFolder(workspacePath, folder)
		}

		return folder;
	}

	getWorkspaceBookmarkFolder(workspacePath: string, storageRootOverride?: string): string | null {
		const root = storageRootOverride ?? this.getGlobalBookmarkFolder(false)
		if (!root || !path.isAbsolute(workspacePath)) return null
		return workspaceScopeFolderPath(root, workspacePath)
	}

	getScriptStoreFolder(storageRootOverride?: string): string | null {
		const root = this.getGlobalBookmarkFolder(false, undefined, storageRootOverride)
		if (!root) return null
		const folder = path.join(root, 'scripts')
		if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true })
		return folder
	}

	hashForWorkspace(workspacePath: string): string {
		return stableWorkspacePathHash(workspacePath)
	}

	relativeToUri(fsPath: string): vscode.Uri {
		return vscode.Uri.file(this.relativeToAbsolute(fsPath))
	}

}

export const fileUtils = new FileUtils()
