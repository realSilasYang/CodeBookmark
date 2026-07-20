import * as fs from "fs"
import * as vscode from 'vscode'
import { logger } from './Logger'
import path = require("path")
import { ContextBookmark } from './ContextValue'
import { BookmarkSet } from '../models/BookmarkSet'
import { ExtensionConfig } from '../config/ExtensionConfig'
import * as crypto from 'crypto'
import * as os from 'os'


class FileUtils {
	readonly BOOKMARKS_WORKSPACE = 'bookmarks'
	readonly WATCHER_WORKSPACE = 'watcher'
	readonly ICONS_WORKSPACE = 'icons'

	hasDir = false

	readWorkspace(context: vscode.ExtensionContext, workspace: string): any {
		try {
			const parsedData = context.workspaceState.get(workspace)
			return parsedData
		} catch {
			// ignore
		}
	}

	writeWorkspace(context: vscode.ExtensionContext, workspace: string, data: any) {
		context.workspaceState.update(workspace, data)
	}

	writeGlobal(context: vscode.ExtensionContext, workspace: string, data: any) {
		context.globalState.update('codebookmark_' + workspace, data)
	}

	readGlobal(context: vscode.ExtensionContext, workspace: string) {
		try {
			const parsedData = context.globalState.get('codebookmark_' + workspace)
			return parsedData
		} catch {
			// ignore
		}
	}

	readJsonFile(filePath: string): any {
		try {
			const data = fs.readFileSync(filePath, 'utf8')
			return JSON.parse(data)
		} catch (error) {
			logger.error('Can not read file')
			logger.error(error)
			return null
		}
	}

	writeJsonFile(filePath: string, data: any) {
		try {
			const jsonData = JSON.stringify(data, null, 2)
			fs.writeFileSync(filePath, jsonData, 'utf8')
		} catch (error) {
			logger.error('Can not write file')
			logger.error(error)
		}
	}

	async readJsonFileAsync(filePath: string): Promise<any> {
		try {
			const data = await fs.promises.readFile(filePath, 'utf8')
			return JSON.parse(data)
		} catch (error) {
			logger.error('Can not read file async')
			logger.error(error)
			return null
		}
	}

	async writeJsonFileAsync(filePath: string, data: any): Promise<void> {
		try {
			const jsonData = JSON.stringify(data, null, 2)
			await fs.promises.writeFile(filePath, jsonData, 'utf8')
		} catch (error) {
			logger.error('Can not write file async')
			logger.error(error)
		}
	}

	private mapDocumentBuf: Map<string, vscode.TextDocument> = new Map()
	private relocatedCount: number = 0;

	async readContentBookmarkInFile(
		bookmarks: BookmarkSet,
		isRootCall: boolean = true,
		silent: boolean = false
	): Promise<number> {
		if (isRootCall) {
			this.relocatedCount = 0;
		}

		for (const item of bookmarks) {
			try {
				// Container nodes (File/Folder/Watcher) have no semantic content fingerprint.
				// They must be skipped by the sticky engine, otherwise their empty content would
				// get overwritten with line-0 text and their contextValue downgraded to Bookmark,
				// which removes them (and all their children) from the tree view.
				if (item.isDirectory || item.isWatcher) {
					if (item.subs.size > 0) {
						await this.readContentBookmarkInFile(item.subs, false, silent)
					}
					continue
				}
				let content = ''
				let doc: vscode.TextDocument | undefined
				const keys = new Set(this.mapDocumentBuf.keys())
				if (keys.has(item.path)) {
					doc = this.mapDocumentBuf.get(item.path)
				} else {
					const absolutePath = this.relativeToAbsolute(item.path);
					doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === absolutePath);
					if (doc) {
						this.mapDocumentBuf.set(item.path, doc);
					}
				}
				if (doc) {
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
						if (currentLineContent.trim() !== trimmedItemContent && currentLineContent.indexOf(trimmedItemContent) === -1) {
							
							// Fix: Empty line teleportation bug
							// If the original bookmark was an empty line, its semantic fingerprint is void.
							// Attempting to indexOf('') will ALWAYS return 0 and teleport it to the top.
							// Therefore, if it no longer matches the current line, we declare it completely dead.
							if (!trimmedItemContent) {
								if (item.contextValue === ContextBookmark.Bookmark) {
									item.contextValue = ContextBookmark.BookmarkInvalid;
									this.relocatedCount++;
								}
								continue;
							}

							let foundMatch = false;
							let newStartPos: vscode.Position | undefined;
							let newEndPos: vscode.Position | undefined;
							let newContent = '';

							const isMultiLine = trimmedItemContent.includes('\n');
							const fullText = doc.getText();
							
							// Fix: Greedy First-Match Teleportation bug (Proximity Snapping)
							// Instead of just taking the first indexOf match (which could be thousands of lines away),
							// we find ALL exact matches of this semantic fingerprint and snap to the one that is 
							// physically closest to the original bookmark's line.
							let currentIndex = fullText.indexOf(trimmedItemContent);
							let bestIndex = -1;
							let minDistance = Infinity;

							while (currentIndex !== -1) {
								const pos = doc.positionAt(currentIndex);
								const distance = Math.abs(pos.line - item.start.line);
								
								if (distance < minDistance) {
									minDistance = distance;
									bestIndex = currentIndex;
								}
								
								// Move to the next match
								currentIndex = fullText.indexOf(trimmedItemContent, currentIndex + 1);
							}

							if (bestIndex !== -1) {
								foundMatch = true;
								newStartPos = doc.positionAt(bestIndex);
								newEndPos = doc.positionAt(bestIndex + trimmedItemContent.length);
								newContent = isMultiLine ? item.content : doc.lineAt(newStartPos.line).text;
							}

							if (foundMatch && newStartPos && newEndPos) {
								item.start.line = newStartPos.line;
								item.start.column = newStartPos.character;
								item.end.line = newEndPos.line;
								item.end.column = newEndPos.character;
								item.content = newContent;
								item.contextValue = ContextBookmark.Bookmark;
								this.relocatedCount++;
							} else {
								if (item.contextValue !== ContextBookmark.BookmarkInvalid) {
									this.relocatedCount++;
								}
								item.contextValue = ContextBookmark.BookmarkInvalid;
							}
						} else {
							if (item.contextValue !== ContextBookmark.Bookmark) {
								this.relocatedCount++;
							}
							item.contextValue = ContextBookmark.Bookmark;
						}
					} else {
						if (doc.lineCount <= item.start.line) {
							if (item.contextValue !== ContextBookmark.BookmarkInvalid) {
								this.relocatedCount++;
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
								this.relocatedCount++;
							}
							item.contextValue = ContextBookmark.Bookmark;
						}
					}
				} else {
					// If the file is not currently open, we trust the cached bookmark data.
					item.contextValue = ContextBookmark.Bookmark;
				}
				if (item.subs.size > 0) {
					await this.readContentBookmarkInFile(item.subs, false, silent)
				}
			} catch (error) {
				logger.error('Can read content file')
				logger.error(error)
			}
		}

		if (isRootCall) {
			this.mapDocumentBuf.clear()
			return this.relocatedCount;
		}
		return 0;
	}



	getDocumentCurrent(): vscode.TextDocument | undefined {
		const editor = vscode.window.activeTextEditor
		if (editor) {
			return editor.document
		}
	}



	///////////////////////////////
	get rootPath() {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (workspaceFolders) {
			return workspaceFolders[0].uri.fsPath
		}
		return ''
	}

	createDirectoryIfNotExist(filePath: string): boolean {
		const file = this.relativeToAbsolute(filePath)
		if (!fs.existsSync(file)) {
			fs.mkdirSync(file)
			return true

		}
		return false
	}

	relativeToAbsolute(fsPath: string): string {
		if (path.isAbsolute(fsPath)) return fsPath;
		return path.join(this.rootPath, fsPath)
	}

	absoluteToRelative(fsPath: string): string {
		if (!this.rootPath) return fsPath;
		return path.relative(this.rootPath, fsPath)
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
		
		if (uri) {
			return vscode.workspace.getWorkspaceFolder(uri) !== undefined;
		}
		return true;
	}

	getGlobalBookmarkFolder(_context?: vscode.ExtensionContext, forceWorkspaceMode?: boolean, uri?: vscode.Uri): string | null {
		if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) {
			return null;
		}

		let folder = ExtensionConfig.globalStoragePath.trim();
		folder = folder.replace(/^~([\\/].*)?$/, (match, p1) => path.join(os.homedir(), p1 || ''));
		folder = folder.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');
		folder = path.normalize(folder);

		const useWorkspace = forceWorkspaceMode !== undefined ? forceWorkspaceMode : this.isWorkspaceMode(uri);

		if (useWorkspace) {
			const workspaceFolder = uri ? vscode.workspace.getWorkspaceFolder(uri) : undefined;
			const workspacePath = workspaceFolder ? workspaceFolder.uri.fsPath : this.rootPath;
			const hash = this.getHashForPath(workspacePath);
			const workspaceName = path.basename(workspacePath);
			folder = path.join(folder, `${workspaceName}_${hash}`);
			if (!fs.existsSync(folder)) {
				fs.mkdirSync(folder, { recursive: true });
			}
		}

		return folder;
	}

	getHashForPath(absolutePath: string): string {
		try {
			const stat = fs.statSync(absolutePath, { bigint: true })
			return stat.ino.toString()
		} catch {
			const hash = crypto.createHash('sha256');
			hash.update(absolutePath.replace(/\\/g, '/').toLowerCase());
			return hash.digest('hex');
		}
	}

	relativeToUri(fsPath: string): vscode.Uri {
		return vscode.Uri.file(this.relativeToAbsolute(fsPath))
	}

	absoluteToUri(fsPath: string): vscode.Uri {
		return vscode.Uri.file(fsPath)
	}

	static pathExists(p: string): boolean {
		try {
			fs.accessSync(p)
		} catch {
			return false
		}

		return true
	}


}

export const fileUtils = new FileUtils()
