import * as vscode from 'vscode'
import { fileUtils } from '../util/FileUtils'
import { ContextBookmark } from '../util/ContextValue';
import { logger } from '../util/Logger'
import { Bookmark } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'

import path = require("path")
import * as fs from 'fs'

class CodeBookmarksRepository {
	async readBookmarksFromFile(context: vscode.ExtensionContext, activePaths: string[] = []): Promise<Bookmark[]> {
		try {
			const folder = fileUtils.getGlobalBookmarkFolder(context, undefined, activePaths.length > 0 ? vscode.Uri.file(activePaths[0]) : undefined)
			if (!folder) return []
			const bookmarks: Bookmark[] = []

			const existsAsync = async (p: string) => {
				try {
					await fs.promises.access(p);
					return true;
				} catch {
					return false;
				}
			};

			let isWorkspace = fileUtils.isWorkspaceMode();
			if (activePaths.length > 0) {
				isWorkspace = fileUtils.isWorkspaceMode(vscode.Uri.file(activePaths[0]));
			}

			if (isWorkspace) {
				// In workspace mode, read ALL .json files in the workspace bookmark folder
				const files = await fs.promises.readdir(folder);
				const promises = [];
				for (const file of files) {
					if (file.endsWith('.json') && file !== '_workspace_order.json') {
						const jsonPath = path.join(folder, file);
						promises.push(fileUtils.readJsonFileAsync(jsonPath));
					}
				}
				const results = await Promise.all(promises);
				for (const data of results) {
					if (data && data.bookmarks && data.bookmarks.length > 0) {
						const relPath = data.bookmarks[0].path;
						const fileNode = new Bookmark({
							Id: `file_${relPath}`,
							label: relPath,
							path: relPath,
							contextValue: ContextBookmark.File,
							isOpened: true
						});
						const bms = data.bookmarks.map((item: any) => Bookmark.fromJSON(item));
						for (const b of bms) {
							b.parent = fileNode;
						}
						fileNode.subs.addAll(bms);
						bookmarks.push(fileNode);
					}
				}
			} else {
			// Non-workspace mode: read bookmarks for activePaths or all files in folder if no active editor
			const pathsToProcess = activePaths.length > 0 ? activePaths : await this._getAllBookmarkFilesInFolder(folder);
			
			for (const absolutePath of pathsToProcess) {
				const hash = fileUtils.getHashForPath(absolutePath)
				const scriptName = path.basename(absolutePath)
				const jsonPath = path.join(folder, `${scriptName}_${hash}.json`)
				
				if (!(await existsAsync(jsonPath))) {
					const files = await fs.promises.readdir(folder)
					const suffix = `_${hash}.json`
					const matchedFile = files.find(f => f.endsWith(suffix))
					
					if (matchedFile) {
						const oldJsonPath = path.join(folder, matchedFile)
						await fs.promises.rename(oldJsonPath, jsonPath)
						
						const data = await fileUtils.readJsonFileAsync(jsonPath)
						if (data && data.bookmarks) {
							const newRelPath = fileUtils.absoluteToRelative(absolutePath)
							data.bookmarks.forEach((b: any) => {
								b.path = newRelPath
							})
							await fileUtils.writeJsonFileAsync(jsonPath, data)
						}
					}
				}
				
				if (await existsAsync(jsonPath)) {
					const data = await fileUtils.readJsonFileAsync(jsonPath)
					if (data && data.bookmarks && data.bookmarks.length > 0) {
						const relPath = fileUtils.absoluteToRelative(absolutePath);
						const fileNode = new Bookmark({
							Id: `file_${relPath}`,
							label: relPath,
							path: relPath,
							contextValue: ContextBookmark.File,
							isOpened: true
						});
						const bms = data.bookmarks.map((item: any) => Bookmark.fromJSON(item));
						for (const b of bms) {
							b.parent = fileNode;
						}
						fileNode.subs.addAll(bms);
						bookmarks.push(fileNode);
					}
				}
			}
		}

			return bookmarks
		} catch(error) {
			logger.error("无法读取书签配置文件")
			logger.error(error)
			return []
		}
	}

	/**
	 * Get all bookmark file paths from the global bookmark folder.
	 * Used in non-workspace mode when no active editor is open.
	 */
	private async _getAllBookmarkFilesInFolder(folder: string | null): Promise<string[]> {
		if (!folder) return [];
		
		const paths: string[] = [];
		try {
			const files = await fs.promises.readdir(folder);
			for (const file of files) {
				// Bookmark files are named: {scriptName}_{hash}.json
				if (file.endsWith('.json') && file !== '_workspace_order.json') {
					const jsonPath = path.join(folder, file);
					try {
						const data = await fileUtils.readJsonFileAsync(jsonPath);
						if (data && data.bookmarks && data.bookmarks.length > 0) {
							const relPath = data.bookmarks[0].path;
							const absPath = fileUtils.relativeToAbsolute(relPath);
							if (absPath && !paths.includes(absPath)) {
								paths.push(absPath);
							}
						}
					} catch {
						// Skip files that can't be read
					}
				}
			}
		} catch {
			// Folder might not exist yet
		}
		return paths;
	}

	async saveBookmarksToFile(context: vscode.ExtensionContext, bookmarks: BookmarkSet, activePaths: string[] = []): Promise<void> {
		try {
			const folder = fileUtils.getGlobalBookmarkFolder(context, undefined, activePaths.length > 0 ? vscode.Uri.file(activePaths[0]) : undefined)
			if (!folder) return
			
			const existsAsync = async (p: string) => {
				try {
					await fs.promises.access(p);
					return true;
				} catch {
					return false;
				}
			};

			let isWorkspace = fileUtils.isWorkspaceMode();
			if (activePaths.length > 0) {
				isWorkspace = fileUtils.isWorkspaceMode(vscode.Uri.file(activePaths[0]));
			}

			if (isWorkspace) {
				const desiredFiles = new Set<string>();
				for (const fileNode of bookmarks.values) {
					if (fileNode.contextValue !== ContextBookmark.File) continue;
					const bms = fileNode.subs.values.map(b => b.toJSON());
					if (bms.length === 0) continue;

					const relPath = fileNode.path;
					const absPath = fileUtils.relativeToAbsolute(relPath);
					const hash = fileUtils.getHashForPath(absPath);
					const scriptName = path.basename(absPath);
					const fileName = `${scriptName}_${hash}.json`;
					desiredFiles.add(fileName);

					const jsonPath = path.join(folder, fileName);
					await fileUtils.writeJsonFileAsync(jsonPath, { bookmarks: bms });
				}

				const files = await fs.promises.readdir(folder);
				for (const file of files) {
					if (file.endsWith('.json') && file !== '_workspace_order.json' && !desiredFiles.has(file)) {
						await fs.promises.unlink(path.join(folder, file));
					}
				}

				const remainingFiles = await fs.promises.readdir(folder);
				if (remainingFiles.length === 0) {
					await fs.promises.rmdir(folder);
				}
			} else {
				for (const absolutePath of activePaths) {
					const hash = fileUtils.getHashForPath(absolutePath)
					const scriptName = path.basename(absolutePath)
					const jsonPath = path.join(folder, `${scriptName}_${hash}.json`)
					
					const relPath = fileUtils.absoluteToRelative(absolutePath)
					const fileNode = bookmarks.values.find(f => f.path === relPath && f.contextValue === ContextBookmark.File);
					const bmsForPath = fileNode ? fileNode.subs.values.map(b => b.toJSON()) : [];

					if (bmsForPath.length > 0) {
						const jsonAll = {
							bookmarks: bmsForPath
						}
						await fileUtils.writeJsonFileAsync(jsonPath, jsonAll)
					} else {
						// Delete the json file if there are no bookmarks left for this script
						if (await existsAsync(jsonPath)) {
							await fs.promises.unlink(jsonPath)
						}
					}
				}
			}
		} catch(error) {
			logger.error("Can't save bookmarks to file")
			logger.error(error)
		}
	}

	async handleFileRename(oldAbsolutePath: string, newAbsolutePath: string): Promise<void> {
		const oldFolder = fileUtils.getGlobalBookmarkFolder(undefined, undefined, vscode.Uri.file(oldAbsolutePath))
		const newFolder = fileUtils.getGlobalBookmarkFolder(undefined, undefined, vscode.Uri.file(newAbsolutePath))
		if (!oldFolder || !newFolder) return
		
		if (!fs.existsSync(newFolder)) {
			fs.mkdirSync(newFolder, { recursive: true });
		}

		const oldHash = fileUtils.getHashForPath(oldAbsolutePath)
		const newHash = fileUtils.getHashForPath(newAbsolutePath)
		const oldScriptName = path.basename(oldAbsolutePath)
		const newScriptName = path.basename(newAbsolutePath)
		
		const oldJsonPath = path.join(oldFolder, `${oldScriptName}_${oldHash}.json`)
		const newJsonPath = path.join(newFolder, `${newScriptName}_${newHash}.json`)
		
		if (fs.existsSync(oldJsonPath)) {
			const data = fileUtils.readJsonFile(oldJsonPath)
			if (data && data.bookmarks) {
				const oldRelPath = fileUtils.absoluteToRelative(oldAbsolutePath)
				const newRelPath = fileUtils.absoluteToRelative(newAbsolutePath)
				
				data.bookmarks.forEach((b: any) => {
					if (b.path === oldRelPath) {
						b.path = newRelPath
					}
				})
				
				fileUtils.writeJsonFile(newJsonPath, data)
				fs.unlinkSync(oldJsonPath)

				const oldOrderPath = path.join(oldFolder, '_workspace_order.json');
				if (fs.existsSync(oldOrderPath)) {
					const savedOrder: string[] = fileUtils.readJsonFile(oldOrderPath) || [];
					const idx = savedOrder.indexOf(oldRelPath);
					if (idx >= 0) {
						if (oldFolder === newFolder) {
							savedOrder[idx] = newRelPath;
							fileUtils.writeJsonFile(oldOrderPath, savedOrder);
						} else {
							savedOrder.splice(idx, 1);
							fileUtils.writeJsonFile(oldOrderPath, savedOrder);
							
							const newOrderPath = path.join(newFolder, '_workspace_order.json');
							const newSavedOrder: string[] = fs.existsSync(newOrderPath) ? fileUtils.readJsonFile(newOrderPath) : [];
							newSavedOrder.push(newRelPath);
							fileUtils.writeJsonFile(newOrderPath, newSavedOrder);
						}
					}
				}
			}
		}

		if (fileUtils.isWorkspaceMode(vscode.Uri.file(oldAbsolutePath))) {
			if (fs.existsSync(oldFolder)) {
				const files = fs.readdirSync(oldFolder);
				if (files.length === 0) {
					fs.rmdirSync(oldFolder);
				}
			}
		}
	}

	async handleFileDelete(absolutePath: string): Promise<void> {
		const folder = fileUtils.getGlobalBookmarkFolder(undefined, undefined, vscode.Uri.file(absolutePath))
		if (!folder) return
		const hash = fileUtils.getHashForPath(absolutePath)
		const scriptName = path.basename(absolutePath)
		const jsonPath = path.join(folder, `${scriptName}_${hash}.json`)
		
		if (fs.existsSync(jsonPath)) {
			fs.unlinkSync(jsonPath)
		}

		if (fileUtils.isWorkspaceMode(vscode.Uri.file(absolutePath))) {
			if (fs.existsSync(folder)) {
				const files = fs.readdirSync(folder);
				if (files.length === 0) {
					fs.rmdirSync(folder);
				}
			}
		}
	}

	saveRegularIcon(context: vscode.ExtensionContext, icons: number[]) {
		fileUtils.writeGlobal(context, fileUtils.ICONS_WORKSPACE, icons)
	}

	readRegularIcon(context: vscode.ExtensionContext): number[] {
		const data = fileUtils.readGlobal(context, fileUtils.ICONS_WORKSPACE)
		if (data) {
			return data as any
		} else {
			return []
		}
	}
}

export const bookmarkRepository = new CodeBookmarksRepository()
