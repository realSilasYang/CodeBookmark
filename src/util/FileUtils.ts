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
import { canonicalBookmarkPath } from './BookmarkPath'
import { localize } from '../i18n/Localization'

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
			lines: Array.from({ length: doc.lineCount }, (_, line) => doc.lineAt(line).text),
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

	private pathsEqual(first: string, second: string): boolean {
		const left = path.resolve(first)
		const right = path.resolve(second)
		return left === right
	}

	async readJsonFileAsync(filePath: string): Promise<unknown> {
		try {
			const stat = await fs.promises.stat(filePath)
			if (stat.size > MAX_BOOKMARK_FILE_BYTES) throw new Error(localize(
				`书签文件超过 ${MAX_BOOKMARK_FILE_BYTES} 字节`,
				`Bookmark file exceeds ${MAX_BOOKMARK_FILE_BYTES} bytes`,
			))
			const data = await fs.promises.readFile(filePath, 'utf8')
			fileChangeFingerprints.rememberContent(filePath, data)
			return JSON.parse(data)
		} catch (error) {
			logger.error(localize(`无法读取 JSON 文件：${filePath}`, `Cannot read JSON file: ${filePath}`))
			logger.error(error)
			return null
		}
	}

	async writeJsonFileAsync(filePath: string, data: unknown): Promise<boolean> {
		const tmpPath = temporarySiblingPath(filePath)
		let contentHash: string | undefined
		try {
			const jsonData = JSON.stringify(data, null, 2)
			if (jsonData === undefined) throw new Error(localize('JSON 值无法序列化', 'JSON value is not serializable'))
			await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
			const preparation = await fileChangeFingerprints.prepareWrite(filePath, jsonData)
			if (!preparation) {
				logger.error(localize(`书签文件在写入前被外部修改：${filePath}`, `Bookmark file changed externally before write: ${filePath}`))
				return false
			}
			contentHash = preparation.contentHash
			// Atomic write (see writeJsonFile): temp file in the same directory + atomic rename.
			await fs.promises.writeFile(tmpPath, jsonData, 'utf8')
			if (!await fileChangeFingerprints.isCurrentHash(filePath, preparation.expectedDiskHash)) {
				throw new Error(localize(`书签文件在写入期间被外部修改：${filePath}`, `Bookmark file changed externally during write: ${filePath}`))
			}
			await fs.promises.rename(tmpPath, filePath)
			fileChangeFingerprints.markWriteComplete(filePath, contentHash)
			return true
		} catch (error) {
			if (contentHash) fileChangeFingerprints.markWriteFailed(filePath, contentHash)
			logger.error(localize(`无法写入 JSON 文件：${filePath}`, `Cannot write JSON file: ${filePath}`))
			logger.error(error)
			// Best-effort cleanup of a leftover temp file on failure.
			try { await fs.promises.unlink(tmpPath) } catch { /* ignore */ }
			return false
		}
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
				// File container nodes have no semantic content fingerprint.
				// They must be skipped by the sticky engine, otherwise their empty content would
				// get overwritten with line-0 text and their contextValue downgraded to Bookmark,
				// which removes them (and all their children) from the tree view.
				if (item.isFile) {
					if (item.subs.size > 0) {
						await this.readContentBookmarkInFile(item.subs, false, targetPath, scopeUri, state)
					}
						continue
					}
					// Automatic TODO/FIXME/BUG bookmarks are synchronized from comment tokens.
					// The generic sticky engine must not keep or invalidate them after the token vanishes.
					if (item.isCodeMarker) {
						if (item.subs.size > 0) {
							await this.readContentBookmarkInFile(item.subs, false, targetPath, scopeUri, state)
						}
						continue
					}

					// Resource optimization: when a targetPath is given (e.g. after editing one file),
				// only re-anchor bookmarks belonging to that file. Others keep their cached state.
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
					doc = vscode.workspace.textDocuments.find(d => this.pathsEqual(d.uri.fsPath, absolutePath));
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

						// A matching line is accepted only when its stored context does not identify a
						// better duplicate elsewhere in the document.
						if (currentMatches && currentCandidateIsBest) {
							if (item.contextValue !== ContextBookmark.Bookmark) {
								state.relocatedCount++;
							}
							item.contextValue = ContextBookmark.Bookmark;
							if (this.updateBookmarkContextAnchors(item, doc)) state.relocatedCount++
						} else {
							// The text at the bookmark's recorded position no longer matches the fingerprint.
							// Decide between: the line MOVED (relocate by fingerprint) vs. IN-LINE EDIT
							// (same physical line was edited → refresh fingerprint) vs. truly INVALID.
							const isMultiLine = trimmedItemContent.includes('\n');
							// Score all exact matches by surrounding context, then use line distance as
							// the tie-breaker. This disambiguates adjacent repeated lines.
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
								// The fingerprint still exists somewhere → the bookmarked line MOVED.
								// Re-anchor to the closest occurrence. Precise follow for cut / move / reorder.
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
								// The fingerprint is gone from the file, BUT the bookmark's recorded line
								// still exists and holds non-empty text → treat as an IN-LINE EDIT of the
								// bookmarked line. Keep the bookmark alive and refresh its fingerprint.
								// (Position unchanged + content changed → not an invalidation.)
								item.content = currentLineContent;
								if (item.contextValue !== ContextBookmark.Bookmark) {
									state.relocatedCount++;
								}
								item.contextValue = ContextBookmark.Bookmark;
								if (this.updateBookmarkContextAnchors(item, doc)) state.relocatedCount++
							} else {
								// Fingerprint gone AND position no longer valid (line removed or now empty)
								// → position and fingerprint both changed → declare the bookmark invalid.
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
				logger.error(localize('无法根据文件更新书签内容', 'Cannot update bookmark content from file'))
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
		const hash = this.hashForWorkspace(workspacePath)
		const workspaceName = path.basename(path.resolve(workspacePath))
		const folder = path.join(root, 'scopes', `${workspaceName}_${hash}`)
		if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true })
		return folder
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
