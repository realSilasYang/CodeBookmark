/**
 * 提供 JSON 原子读写与书签粘性引擎：根据文本指纹、上下文和距离让书签跟随代码移动。
 * 文件容器和自动标记不走通用重定位；只有内容与原位置都消失时，手动书签才会标记失效。
 */
import * as fs from "fs"
import * as vscode from 'vscode'
import { logger } from './Logger'
import path = require("path")
import { ContextBookmark } from './ContextValue'
import { BookmarkSet } from '../models/BookmarkSet'
import { ExtensionConfig } from '../config/ExtensionConfig'
import { stableWorkspacePathHash } from './PathHash'
import { fileChangeFingerprints } from './FileChangeFingerprint'
import { temporarySiblingPath } from './AtomicFile'
import {
	getFingerprintContext,
	prepareFingerprintContext,
	scorePreparedFingerprintCandidate,
	type PreparedFingerprintContext,
} from './FingerprintMatcher'
import { storageRootState } from './StorageRootState'
import { workspaceScopeFolderPath } from './WorkspaceScopeFolderLifecycle'
import { canonicalBookmarkPath } from './BookmarkPath'
import { localize } from '../i18n/Localization'
import { findOpenFileDocument, textDocumentLines } from './VscodeDocument'

const MAX_BOOKMARK_FILE_BYTES = 32 * 1024 * 1024

interface BookmarkReadState {
	documents: Map<string, vscode.TextDocument>
	relocatedCount: number
	signal?: AbortSignal
}

interface FingerprintCandidate {
	index: number
	line: number
	context: PreparedFingerprintContext
}

interface DocumentSnapshot {
	version: number
	lines: string[]
	fullText: string
	fingerprintCandidates: Map<string, FingerprintCandidate[]>
	emptyLineCandidates?: FingerprintCandidate[]
}

class FileUtils {
	private documentSnapshots = new WeakMap<vscode.TextDocument, DocumentSnapshot>()

	private getDocumentSnapshot(doc: vscode.TextDocument) {
		const cached = this.documentSnapshots.get(doc)
		if (cached?.version === doc.version) return cached
		const snapshot = {
			version: doc.version,
			lines: textDocumentLines(doc),
			fullText: doc.getText(),
			fingerprintCandidates: new Map<string, FingerprintCandidate[]>(),
		}
		this.documentSnapshots.set(doc, snapshot)
		return snapshot
	}

	private getFingerprintCandidates(
		doc: vscode.TextDocument,
		snapshot: DocumentSnapshot,
		content: string,
		signal?: AbortSignal,
	): FingerprintCandidate[] {
		const cached = snapshot.fingerprintCandidates.get(content)
		if (cached) return cached

		const candidates: FingerprintCandidate[] = []
		let currentIndex = snapshot.fullText.indexOf(content)
		while (currentIndex !== -1) {
			if (signal?.aborted) return candidates
			const position = doc.positionAt(currentIndex)
			candidates.push({
				index: currentIndex,
				line: position.line,
				context: prepareFingerprintContext(getFingerprintContext(snapshot.lines, position.line, content)),
			})
			currentIndex = snapshot.fullText.indexOf(content, currentIndex + 1)
		}
		snapshot.fingerprintCandidates.set(content, candidates)
		return candidates
	}

	private getFingerprintLineCandidates(
		doc: vscode.TextDocument,
		snapshot: DocumentSnapshot,
		content: string,
		signal?: AbortSignal,
	): FingerprintCandidate[] {
		if (content !== '') return this.getFingerprintCandidates(doc, snapshot, content, signal)
		if (snapshot.emptyLineCandidates) return snapshot.emptyLineCandidates

		const before: Array<string | undefined> = []
		let previous: string | undefined
		for (const line of snapshot.lines) {
			before.push(previous)
			const trimmed = line.trim()
			if (trimmed !== '') previous = trimmed
		}
		const after: Array<string | undefined> = new Array(snapshot.lines.length)
		let next: string | undefined
		for (let line = snapshot.lines.length - 1; line >= 0; line--) {
			after[line] = next
			const trimmed = snapshot.lines[line].trim()
			if (trimmed !== '') next = trimmed
		}

		const candidates: FingerprintCandidate[] = []
		for (let line = 0; line < snapshot.lines.length; line++) {
			if (signal?.aborted) return candidates
			if (snapshot.lines[line].trim() !== '') continue
			candidates.push({
				index: -1,
				line,
				context: prepareFingerprintContext({ before: before[line], after: after[line] }),
			})
		}
		snapshot.emptyLineCandidates = candidates
		return candidates
	}

	private findBestFingerprintLine(
		doc: vscode.TextDocument,
		snapshot: DocumentSnapshot,
		content: string,
		originalLine: number,
		expected: { before?: string, after?: string },
		signal?: AbortSignal,
	): number {
		let bestLine = -1
		let bestScore = Number.NEGATIVE_INFINITY
		const preparedExpected = prepareFingerprintContext(expected)
		for (const candidate of this.getFingerprintLineCandidates(doc, snapshot, content, signal)) {
			if (signal?.aborted) break
			const score = scorePreparedFingerprintCandidate(
				originalLine,
				candidate.line,
				preparedExpected,
				candidate.context,
			)
			if (score > bestScore) {
				bestLine = candidate.line
				bestScore = score
			}
		}
		return bestLine
	}

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

	updateBookmarkContextAnchors(bookmark: { start: { line: number }, content?: string, contextBefore?: string, contextAfter?: string }, doc: vscode.TextDocument): boolean {
		if (bookmark.start.line < 0 || bookmark.start.line >= doc.lineCount) return false
		const context = getFingerprintContext(this.getDocumentSnapshot(doc).lines, bookmark.start.line, bookmark.content ?? '')
		const changed = bookmark.contextBefore !== context.before || bookmark.contextAfter !== context.after
		bookmark.contextBefore = context.before
		bookmark.contextAfter = context.after
		return changed
	}

	async readContentBookmarkInFile(
		bookmarks: BookmarkSet,
		isRootCall: boolean = true,
		targetPath?: string,
		scopeUri?: vscode.Uri,
		readState?: BookmarkReadState,
		signal?: AbortSignal,
	): Promise<number> {
		const state = readState ?? { documents: new Map<string, vscode.TextDocument>(), relocatedCount: 0, signal }
		if (state.signal?.aborted) return state.relocatedCount

		for (const item of bookmarks) {
			if (state.signal?.aborted) return state.relocatedCount
			try {
				// 文件容器代表脚本，不代表某一行代码，因此没有可重定位的文本指纹。
				// 若把它当普通书签处理，首行会填进空内容，contextValue 也随之降级，整棵文件子树便会消失。
				if (item.isFile) {
					if (item.subs.size > 0) {
						await this.readContentBookmarkInFile(item.subs, false, targetPath, scopeUri, state)
					}
						continue
					}
					// 自动标记的生灭由 CodeMarkerScanner 决定。粘性引擎若接手，已删除的 TODO 可能被保留，
					// 或被改成普通失效书签，两种结果都会破坏下一轮扫描对账。
					if (item.isCodeMarker) {
						if (item.subs.size > 0) {
							await this.readContentBookmarkInFile(item.subs, false, targetPath, scopeUri, state)
						}
						continue
					}

					// 文档编辑只影响 targetPath 对应脚本。其他文件沿用现有位置，
					// 否则每次敲键都会把一次局部更新放大成整个工作区的源码扫描。
				if (targetPath !== undefined && item.path !== targetPath) {
					if (item.subs.size > 0) {
						await this.readContentBookmarkInFile(item.subs, false, targetPath, scopeUri, state)
					}
					continue
				}
				let content = ''
				let doc: vscode.TextDocument | undefined
				if (state.documents.has(item.path)) {
					doc = state.documents.get(item.path)
				} else {
					const absolutePath = this.relativeToAbsolute(item.path, scopeUri);
					doc = findOpenFileDocument(absolutePath);
					if (doc) {
						state.documents.set(item.path, doc);
					}
				}
				if (doc) {
					const snapshot = this.getDocumentSnapshot(doc)
					if (item.content !== undefined && item.content !== '') {
						let currentLineContent = '';
						if (doc.lineCount > item.start.line) {
							if (item.start.equals(item.end)) {
								currentLineContent = doc.lineAt(item.start.line).text;
							} else {
								const safeEndLine = Math.min(item.end.line, doc.lineCount - 1);
								const safeEndChar = item.end.line < doc.lineCount ? item.end.column : doc.lineAt(safeEndLine).text.length;
								const selection = new vscode.Selection(
									new vscode.Position(item.start.line, item.start.column),
									new vscode.Position(safeEndLine, safeEndChar)
								);
								currentLineContent = doc.getText(selection);
							}
						}

						const trimmedItemContent = item.content.trim();
						const currentTrimmed = currentLineContent.trim();

						const currentMatches = currentTrimmed === trimmedItemContent
							|| (trimmedItemContent !== '' && currentLineContent.indexOf(trimmedItemContent) !== -1)
						let currentCandidateIsBest = true
						if (currentMatches && !trimmedItemContent.includes('\n') && (item.contextBefore || item.contextAfter)) {
							currentCandidateIsBest = this.findBestFingerprintLine(
								doc,
								snapshot,
								trimmedItemContent,
								item.start.line,
								{ before: item.contextBefore, after: item.contextAfter }
							) === item.start.line
						}

						// 当前位置文本虽相同，也可能只是重复代码中的另一行。先确认上下文评分没有指向
						// 更可信的候选，再把当前位置视为原书签仍留在原地。
						if (currentMatches && currentCandidateIsBest) {
							if (item.contextValue !== ContextBookmark.Bookmark) {
								state.relocatedCount++;
							}
							item.contextValue = ContextBookmark.Bookmark;
							if (this.updateBookmarkContextAnchors(item, doc)) state.relocatedCount++
						} else {
							// 原行与旧指纹不再一致时不能立即判失效：代码可能整体移动、在原地被编辑，
							// 也可能真的被删除。下面三个分支分别处理这三种含义。
							const isMultiLine = trimmedItemContent.includes('\n');
							// 所有文本完全相同的行先比较前后文；证据相同时才参考与旧行号的距离，
							// 让相邻重复代码尽量回到原来的那一段。
							let bestIndex = -1;
							let bestScore = Number.NEGATIVE_INFINITY;
							if (trimmedItemContent !== '') {
								const expectedContext = prepareFingerprintContext({ before: item.contextBefore, after: item.contextAfter })
								for (const candidate of this.getFingerprintCandidates(doc, snapshot, trimmedItemContent, state.signal)) {
									if (state.signal?.aborted) break
									const score = scorePreparedFingerprintCandidate(
										item.start.line,
										candidate.line,
										expectedContext,
										candidate.context,
									)
									if (score > bestScore) {
										bestScore = score;
										bestIndex = candidate.index;
									}
								}
							}

							if (bestIndex !== -1) {
								// 旧指纹在别处找到唯一最佳候选，说明代码被剪切、移动或重排；
								// 更新行号和上下文，让后续编辑从新位置继续跟随。
								const newStartPos = doc.positionAt(bestIndex);
								const newEndPos = doc.positionAt(bestIndex + trimmedItemContent.length);
								item.start.line = newStartPos.line;
								item.start.column = newStartPos.character;
								item.end.line = newEndPos.line;
								item.end.column = newEndPos.character;
								item.content = isMultiLine ? item.content : doc.lineAt(newStartPos.line).text;
								item.contextValue = ContextBookmark.Bookmark;
								if (this.updateBookmarkContextAnchors(item, doc)) state.relocatedCount++
								state.relocatedCount++;
							} else if (item.start.line < doc.lineCount && currentTrimmed !== '') {
								// 没有旧指纹候选，但原行仍有代码，最合理的解释是用户就地修改了这一行。
								// 书签留在原位，并以新文本刷新指纹，而不是把正常编辑标成失效。
								item.content = currentLineContent;
								if (item.contextValue !== ContextBookmark.Bookmark) {
									state.relocatedCount++;
								}
								item.contextValue = ContextBookmark.Bookmark;
								if (this.updateBookmarkContextAnchors(item, doc)) state.relocatedCount++
							} else {
								// 旧内容无处可寻，原位置也已越界或变空；位置和文本两条证据同时消失，
								// 到这一步才确认书签失效。
								if (item.contextValue !== ContextBookmark.BookmarkInvalid) {
									state.relocatedCount++;
								}
								item.contextValue = ContextBookmark.BookmarkInvalid;
							}
						}
					} else if (item.content === '') {
						let matchedLine = -1
						if (item.contextBefore || item.contextAfter) {
							matchedLine = this.findBestFingerprintLine(
								doc,
								snapshot,
								'',
								item.start.line,
								{ before: item.contextBefore, after: item.contextAfter }
							)
						} else if (item.start.line < doc.lineCount && snapshot.lines[item.start.line].trim() === '') {
							matchedLine = item.start.line
						}
						if (matchedLine >= 0) {
							if (matchedLine !== item.start.line) state.relocatedCount++
							item.start.line = matchedLine
							item.start.column = 0
							item.end.line = matchedLine
							item.end.column = 0
							item.contextValue = ContextBookmark.Bookmark
							if (this.updateBookmarkContextAnchors(item, doc)) state.relocatedCount++
						} else {
							item.contextValue = ContextBookmark.BookmarkInvalid
						}
					} else {
						if (doc.lineCount <= item.start.line) {
							if (item.contextValue !== ContextBookmark.BookmarkInvalid) {
								state.relocatedCount++;
							}
							item.contextValue = ContextBookmark.BookmarkInvalid;
						} else {
							if (item.start.equals(item.end)) {
								content = doc.lineAt(item.start.line).text
							} else {
								const selection = new vscode.Selection(
									new vscode.Position(item.start.line, item.start.column),
									new vscode.Position(item.end.line, item.end.column)
								)
								content = doc.getText(selection)
							}
							item.content = content;
							if (item.contextValue !== ContextBookmark.Bookmark) {
								state.relocatedCount++;
							}
							item.contextValue = ContextBookmark.Bookmark;
							if (this.updateBookmarkContextAnchors(item, doc)) state.relocatedCount++
						}
					}
				}
				if (item.subs.size > 0) {
					await this.readContentBookmarkInFile(item.subs, false, targetPath, scopeUri, state)
				}
			} catch (error) {
				logger.error(localize("util.FileUtils.cannotUpdateBookmarkContentFromFile"))
				logger.error(error)
			}
		}

		if (isRootCall) {
			return state.relocatedCount;
		}
		return 0;
	}

	async readContentBookmarksInDocument(
		bookmarks: BookmarkSet,
		document: vscode.TextDocument,
		targetPath: string,
		scopeUri?: vscode.Uri,
		signal?: AbortSignal,
	): Promise<number> {
		return this.readContentBookmarkInFile(
			bookmarks,
			true,
			targetPath,
			scopeUri,
			{ documents: new Map([[targetPath, document]]), relocatedCount: 0, signal },
			signal,
		)
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
