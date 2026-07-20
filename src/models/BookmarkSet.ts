import * as vscode from 'vscode';
import { fileUtils } from '../util/FileUtils';
import { logger } from '../util/Logger';
import { Bookmark } from './Bookmark';
import path = require('path')
import { ContextBookmark } from '../util/ContextValue';

export class BookmarkSet {
	public values: Array<Bookmark> = new Array<Bookmark>()

	constructor(bms?: Bookmark[]) {
		this.addAll(bms ?? [])
	}

	public has(value: Bookmark): boolean {
		for (const bm of this.values) {
			if (bm.equals(value)) {
				return true
			}
		}
		return false
	}

	idConflict(bookmarks: BookmarkSet): string | undefined {
		const ids1: Array<string> = [];
		const ids2: Array<string> = [];
		this.getListId(ids1)
		bookmarks.getListId(ids2)
		for (const id1 of ids1) {
			for (const id2 of ids2) {
				if (id1 === id2) {
					return id1;
				}
			}
		}
	}

	getListId(out: Array<string>) {
		for (const i of this.values) {
			out.push(i.Id)
			if (i.subs.size > 0) {
				i.subs.getListId(out)
			}
		}
	}

	public add(value: Bookmark): boolean {
		if (this.has(value)) {
			return false
		} else {
			this.values.push(value)
			return true
		}
	}

	public addForce(value: Bookmark) {
		this.values.push(value)
	}

	public replace(index: number, value: Bookmark): void {
		this.values.splice(index, 1, value)
	}

	public delete(index: number): void {
		this.values.splice(index, 1)
	}

	public insert(index: number, value: Bookmark): void {
		this.values.splice(index, 0, value)
	}

	public indexOf(value: Bookmark): number {
		for (let i = 0; i < this.values.length; i++) {
			if (this.values[i].equals(value)) {
				return i
			}
		}
		return -1
	}

	public addAll(value: BookmarkSet | Array<Bookmark> | undefined) {
		if (value === undefined) {
			return
		}
		for (const i of value) {
			this.add(i)
		}
	}

	public clear(): void {
		this.values = []
	}

	get(i: number): Bookmark {
		return this.values[i]
	}

	set(index: number, value: Bookmark) {
		this.values[index] = value
	}

	public filter(callbackfn: (value: Bookmark, index: number, array: Bookmark[]) => boolean, thisArg?: any): BookmarkSet {
		const filteredValues = this.values.filter(callbackfn, thisArg)
		return new BookmarkSet(filteredValues)
	}


	public [Symbol.iterator](): IterableIterator<Bookmark> {
		return this.values[Symbol.iterator]()
	}


	public get size(): number {
		return this.values.length
	}

	sortById() {
		this.values.sort((a, b) => {
			if (a.Id < b.Id) return -1
			if (a.Id > b.Id) return 1
			return 0
		})
	}

	sortByPath(parent?: Bookmark) {
		if (this.values.length > 0) {
			if (parent && parent.isFile) {
				this.values.sort((a, b) => {
					if (a.start.line < b.start.line) return -1
					if (a.start.line > b.start.line) return 1
					return 0
				})
			} else {
				this.values.sort((a, b) => {
					if (a.path < b.path) return -1
					if (a.path > b.path) return 1
					return 0
				})
			}
		}

		for (const i of this.values) {
			if (i.subs.size > 0) {
				i.subs.sortByPath(i)
			}
		}
	}

	// ================= 
	public getBookmarksWithPath(out: BookmarkSet, path: string) {
		for (const i of this) {
			if (i.path === path) {
				out.add(i.copyWith())
			}
			if (i.subs.size > 0) {
				out = i.subs.getBookmarksWithPath(out, path)
			}
		}
		return out
	}

	public getBookmarksWithIndex(out: Array<Bookmark>, bookmark: Bookmark): Bookmark[] {
		for (const bm of this) {
			if (bm.compareIndex(bookmark)) {
				out.push(bm)
			}
			if (bm.subs.size > 0) {
				bm.subs.getBookmarksWithIndex(out, bookmark)
			}
		}
		return out
	}

	public fastDelete(bookmark: Bookmark) {
		for (let i = 0; i < this.values.length; i++) {
			if (this.values[i].equals(bookmark)) {
				this.delete(i)
				return
			}
		}
	}

	public deleteBookmark(id: string) {
		for (let i = 0; i < this.values.length; i++) {
			if (this.values[i].equals(new Bookmark({ Id: id }))) {
				this.delete(i)
				return
			}
			if (this.values[i].subs.size > 0) {
				this.values[i].subs.deleteBookmark(id)
				if (this.values[i].isDirectory) {
					if (this.values[i].subs.size == 0) {
						this.delete(i)
						return
					}
				}
				this.values[i].refreshDisplayProps()
			}
		}
	}

	public findBookmark(bookmark: Bookmark): Bookmark | undefined {
		for (const i of this.values) {
			if (i.equals(bookmark)) {
				return i
			}
			if (i.subs.size > 0) {
				const sub = i.subs.findBookmark(bookmark)
				if (sub !== undefined) {
					return sub
				}
			}
		}
		return undefined
	}

	public findParentBookmark(bookmark: Bookmark): Bookmark | undefined {
		for (const i of this.values) {
			if (i.subs.size > 0) {
				for (const child of i.subs.values) {
					if (child.equals(bookmark)) {
						return i
					}
				}
				const p = i.subs.findParentBookmark(bookmark)
				if (p !== undefined) {
					return p
				}
			}
		}
		return undefined
	}

	moveGroupToNode(group: BookmarkSet, target: Bookmark | undefined): boolean {
		const isChild = target?.isChildOf(group)
		if (isChild) {
			logger.showWarningMessage('Cannot move parent branch into child branch')
			return false
		}
		const newGroup = [...group]
		if (!target) {
			for (const item of group) {
				this.deleteBookmark(item.Id)
			}
			this.addAll(newGroup)
			return true
		}
		else {
			for (const item of group) {
				this.deleteBookmark(item.Id)
			}
			target.subs.addAll(newGroup)
			return true
		}
	}

	changeIndexNode(group: BookmarkSet, target: Bookmark | undefined): boolean {
		const isChild = target?.isChildOf(group)
		let hasChange = false
		if (isChild) {
			logger.showWarningMessage('Cannot move parent branch into child branch')
			return false
		}
		const newGroup = [...group]
		if (!target) { // add to last index of root
			for (const item of group) {
				this.deleteBookmark(item.Id)
			}
			this.addAll(newGroup)
			return true
		}
		else {
			for (const item of group) {
				let setParent: BookmarkSet | undefined
				if (target.parent === undefined && item.parent === undefined) {
					// eslint-disable-next-line @typescript-eslint/no-this-alias
					setParent = this
				} else if (target.parent && target.parent.equals(item.parent)) {
					setParent = target.parent.subs
				}
				if (setParent !== undefined) {
					const indexTarget = setParent.indexOf(target);
					const indexItem = setParent.indexOf(item);
					if (indexTarget >= 0 && indexItem >= 0) {
						if (indexItem === indexTarget - 1) {
							setParent.delete(indexItem)
							setParent.insert(indexTarget, item)
							hasChange = true
						} else if (indexItem > indexTarget) {
							setParent.delete(indexItem)
							setParent.insert(indexTarget, item)
							hasChange = true
						} else if (indexItem < indexTarget) {
							setParent.delete(indexItem)
							setParent.insert(indexTarget - 1, item)
							hasChange = true
						}
					}
				} else if (target.parent === undefined) {
					const indexTarget = this.indexOf(target);
					if (item.parent) {
						item.parent.subs.fastDelete(item)
					} else {
						this.fastDelete(item)
					}
					this.insert(indexTarget, item)
					hasChange = true
				} else if (target.parent !== undefined) {
					const indexTarget = target.parent.subs.indexOf(target);
					if (item.parent) {
						item.parent.subs.fastDelete(item)
					} else {
						this.fastDelete(item)
					}
					target.parent.subs.insert(indexTarget, item)
					hasChange = true
				}
			}
		}
		return hasChange
	}


	changeLine(rePath: string, change: vscode.TextDocumentContentChangeEvent, doc: vscode.TextDocument, bookmarksOfPath?: Bookmark[]): boolean {
		const textChange = change.text
		const start = change.range.start
		const end = change.range.end
		const linesAdded = change.text.split('\n').length - 1
		const linesRemoved = end.line - start.line
		const numberLine = linesAdded - linesRemoved

		let hasChange = false
		const iterable = bookmarksOfPath || this.values;
		for (const bookmark of iterable) {
			const cacheStart = bookmark.start.copy()
			const cacheEnd = bookmark.end.copy()
			if (bookmarksOfPath === undefined && bookmark.subs.size > 0) {
				const cc = bookmark.subs.changeLine(rePath, change, doc)
				if (hasChange === false) {
					hasChange = cc
				}
			}
			if (bookmark.isDirectory) continue
			if (bookmark.path === rePath) {
				// 如果内容为空且不等于换行符，则进行清理
				if (start.line === end.line && start.line === bookmark.start.line) {
					const content = fileUtils.getDocumentCurrent()?.lineAt(bookmark.start.line).text
					if (content === '' && numberLine === 0) {
						// 允许变成空内容书签，交由智能追踪判定
						bookmark.end.column = 0;
					} else if (content === '' && numberLine > 0) {
						bookmark.start.line += numberLine
						bookmark.end.line += numberLine
					}
					else if (content !== '') {
						if (!bookmark.start.equals(bookmark.end) && bookmark.start.line === bookmark.end.line) {
							if (start.line === end.line && start.character <= end.character) { // chnage on start line
								if (textChange === '') {
									if (end.character <= bookmark.start.column) {
										// 从当前书签起始位置之前进行内容裁剪/删除
										const c = end.character - start.character
										bookmark.start.column -= c
										bookmark.end.column -= c
									} else if (end.character > bookmark.start.column && end.character < bookmark.end.column) {
										// 截断并删除当前书签中间的内容
										const c = end.character - start.character
										bookmark.end.column -= c
									} else if (start.character < bookmark.end.column && end.character >= bookmark.end.column) {
										if (start.character > bookmark.start.column) {
											// 删除当前书签后续的内容
											const c = bookmark.end.column - start.character
											bookmark.end.column -= c
										} else if (start.character <= bookmark.start.column && end.character >= bookmark.end.column) {
											// xoa toan bo
											bookmark.end.column = 0
											bookmark.start.column = 0
										}
									}
								} else {
									if (end.character === bookmark.start.column) {
										// 在书签起始位置插入内容
										if (textChange.endsWith(' ')) {
											// 边界处理：若是空白字符结尾，需回退起始坐标
											const c = textChange.length
											bookmark.start.column += c
											bookmark.end.column += c
										} else {
											// 内容非空时，将新片段无缝整合进当前书签节点
											let cx = 0
											for (let i = textChange.length - 1; i >= 0; i--) {
												if (textChange[i] === ' ') break
												cx++
											}
											const cStart = textChange.length - cx
											const cEnd = textChange.length
											bookmark.start.column += cStart
											bookmark.end.column += cEnd
										}
									} else if (end.character < bookmark.start.column) {
										// 在书签前方一个字符的偏移量处插入新片段
										const c = textChange.length
										bookmark.start.column += c
										bookmark.end.column += c
									} else if (start.character <= bookmark.start.column && end.character >= bookmark.start.column) {
										// 覆盖书签首部选中区域，并追加新文本
										bookmark.start.column = start.character + textChange.length
										bookmark.end.column -= bookmark.start.column - end.character + textChange.length
									} else if (start.character >= bookmark.start.column && end.character < bookmark.end.column) {
										// 将新文本精确插入到书签节点内部
										const c = textChange.length
										bookmark.end.column += c
									} else if (start.character === bookmark.end.column) {
										if (!textChange.startsWith(' ')) {
											// 在书签节点的末尾追加新文本
											const c = textChange.trim().length
											bookmark.end.column += c
										}
									}
								}
							}
						}
						else if (start.line === bookmark.start.line && bookmark.start.line < bookmark.end.line && textChange.split('\n').length > 1) {
							bookmark.end.line += textChange.split('\n').length - 1
						}
						else if (start.line === bookmark.start.line && textChange.split('\n').length > 0) {
							// bookmark.end.line = textChange.split('\n').length - 1
							hasChange = true
						}
					}
				}
				else if (end.line < bookmark.end.line && start.line > bookmark.start.line && textChange !== '') {
					// 在多行书签的中间位置插入新行
					const c = textChange.split('\n').length - 1
					if (c > 0) {
						bookmark.end.line += c
					}
				}
				else if (end.line < bookmark.end.line && start.line > bookmark.start.line && textChange === '') {
					// 删除多行书签中间的某一行
					const c = end.line - start.line
					if (c > 0) {
						bookmark.end.line -= c
					}
				}
				else if (start.line >= bookmark.start.line && (end.line > bookmark.end.line || (end.line === bookmark.end.line && start.character < bookmark.end.column)) && start.line < bookmark.end.line && textChange === '') {
					bookmark.end.line -= bookmark.end.line - start.line
					bookmark.end.column = start.character
				}
				else if (start.line === bookmark.end.line && start.character <= bookmark.end.column && textChange === '') {
					bookmark.end.column -= bookmark.end.column - start.character
				}
				else if (start.line >= bookmark.start.line && end.line - start.line === 1 && end.line === bookmark.end.line && textChange === '') {
					bookmark.end.line--
					bookmark.end.column = fileUtils.getDocumentCurrent()?.lineAt(bookmark.end.line).range.end.character ?? 0
				}
				else if (end.line > start.line && start.line === bookmark.start.line && textChange === '') {
					bookmark.end.line -= end.line - start.line
				}

				/// NOK
				else if (bookmark.start.line === start.line && bookmark.start.line <= end.line && textChange === '' && numberLine === -1) {
					// 允许变成空内容书签，交由智能追踪判定
				}
				else if (bookmark.start.line > start.line && end.line > bookmark.start.line) {
					// 删除整个跨越书签行的节点内容，此时不应硬删除书签，而是收缩坐标，交由智能追踪来决定是否恢复
					bookmark.start.line = start.line;
					bookmark.end.line = start.line;
					bookmark.start.column = start.character;
					bookmark.end.column = start.character;
				}
				else if (bookmark.start.line > start.line) {
					bookmark.start.line += numberLine // 动态调整书签节点的起止行号映射
					bookmark.end.line += numberLine // 动态调整书签节点的起止行号映射
				}

				if (bookmark.start.line >= start.line) {
					// do nothing
				}
			}
			if (bookmark.start.line < 0) {
				bookmark.start.line = 0
			}
			if (bookmark.end.line < 0) {
				bookmark.end.line = 0
			}
			if (bookmark.start.column < 0) {
				bookmark.start.column = 0
			}
			if (bookmark.end.column < 0) {
				bookmark.end.column = 0
			}
			if (!hasChange) {
				hasChange = !cacheStart.equals(bookmark.start) || !cacheEnd.equals(bookmark.end)
			}

			if (!bookmark.isDirectory && bookmark.start.line === bookmark.end.line && bookmark.contextValue !== ContextBookmark.BookmarkInvalid) {
				if (change.range.start.line <= bookmark.end.line && change.range.end.line >= bookmark.start.line) {
					if (bookmark.start.line < doc.lineCount) {
						const currentText = doc.lineAt(bookmark.start.line).text;
						// Detect if the line was completely removed (e.g. ctrl+x) so it shifted up
						const isLineCut = change.text === '' && 
							change.range.start.line <= bookmark.start.line && 
							change.range.end.line > bookmark.end.line &&
							change.range.start.character === 0 &&
							change.range.end.character === 0;
						
						if (!isLineCut && currentText.trim() !== '' && bookmark.content !== currentText) {
							bookmark.content = currentText;
							hasChange = true;
						}
					}
				}
			}
		}
		return hasChange
	}

	removePath(oldPath: string, newPath: string) {
		const sub = new BookmarkSet()
		this._findFolderAndRemovePath(oldPath, sub)
		sub.renamePath(oldPath, newPath)
		for (const i of sub) {
			const paths = i.path.split(path.sep).slice(0, -1).join(path.sep).split(path.sep)
			this._findFolderAndAddBookmark(this, paths, 0, i)
		}
	}

	private _findFolderAndRemovePath(oldPath: string, out: BookmarkSet): number {
		for (let i = 0; i < this.values.length;) {
			const vi = this.values[i]
			if (vi.path === oldPath) {
				out.add(vi)
				this.delete(i)
				return this.size
			}
			if (vi.subs.size > 0) {
				const size = this.values[i].subs._findFolderAndRemovePath(oldPath, out)
				if (size === 0) {
					this.delete(i)
					return this.size
				}
			}
			i++
		}
		return this.size
	}

	renamePath(oldPath: string, newPath: string) {
		for (const vi of this.values) {
			if (vi.path === oldPath || vi.path.startsWith(oldPath + '/') || vi.path.startsWith(oldPath + '\\')) {
				const fsPath = vi.path.replace(oldPath, newPath)
				vi.path = fsPath
				if (vi.isDirectory) {
					vi.label = path.basename(fsPath)
					vi.resourceUri = fileUtils.relativeToUri(fsPath)
				}
			}
			if (vi.subs.size > 0) {
				vi.subs.renamePath(oldPath, newPath)
			}
		}
	}

	deleteWithPath(pathDeleted: string): boolean {
		let hasDelete = false
		for (let i = 0; i < this.values.length;) {
			if (this.values[i].path === pathDeleted || this.values[i].path.startsWith(pathDeleted + '/') || this.values[i].path.startsWith(pathDeleted + '\\')) {
				this.delete(i)
				hasDelete = true
				continue
			}
			if (this.values[i].subs.size > 0) {
				const de = this.values[i].subs.deleteWithPath(pathDeleted)
				if (hasDelete === false) {
					hasDelete = de
				}
				if (this.values[i].isFolder && this.values[i].subs.size === 0) {
					this.delete(i)
				}
			}
			i++
		}
		return hasDelete
	}

	pinBookmark(bookmark: Bookmark): Bookmark[] {
		const modified: Bookmark[] = []
		for (const vi of this.values) {
			let changed = false;
			if (vi.equals(bookmark)) {
				vi.isOpened = !vi.isOpened
				changed = true;
			} else {
				if (vi.isOpened !== false) {
					vi.isOpened = false
					changed = true;
				}
			}
			if (changed) {
				vi.refreshDisplayProps();
				modified.push(vi);
			}
			if (vi.subs.size > 0) {
				const h = vi.subs.pinBookmark(bookmark)
				if (h.length > 0) {
					modified.push(...h)
				}
			}
		}
		return modified
	}

	addNewBookmarkToPin(bookmark: Bookmark): Bookmark | undefined {
		for (const vi of this.values) {
			if (vi.isOpened) {
				vi.subs.add(bookmark.copyWith({ parent: vi }))
				vi.refreshDisplayProps()
				return vi
			}
			if (vi.subs.size > 0) {
				const hasChange = vi.subs.addNewBookmarkToPin(bookmark)
				if (hasChange) {
					return hasChange
				}
			}
		}
	}

	addNewBookmark(bookmark: Bookmark): Bookmark | undefined {
		const pin = this.addNewBookmarkToPin(bookmark)
		if (!pin) {
			this.add(bookmark)
		}
		return pin
	}

	filterBookmarkAll(out: BookmarkSet) {
		for (const i of this) {
			out.add(i)
			if (i.subs.size > 0) {
				i.subs.filterBookmarkAll(out)
			}
		}
	}

	filterBookmarkFolder(out: BookmarkSet) {
		for (const i of this) {
			if (i.path !== '') {
				out.addBookmarkToFolder(i)
			}
			if (i.subs.size > 0) {
				i.subs.filterBookmarkFolder(out);
			}
		}
	}

	// ok not change
	addBookmarkToFolder(bookmark: Bookmark) {
		const paths = bookmark.path.split(path.sep)
		this._findFolderAndAddBookmark(this, paths, 0, bookmark)
	}

	private _findFolderAndAddBookmark(out: BookmarkSet, paths: string[], index: number, bookmark: Bookmark): boolean {
		if (index === paths.length || (paths.length === 1 && paths[0] === '')) {
			out.add(bookmark)
			return true
		}
		for (const i of out) {
			if (i.label === paths[index]) {
				if (this._findFolderAndAddBookmark(i.subs, paths, index + 1, bookmark)) {
					return true
				}
			}
		}
		out.addForce(this._createNewPathAndAddBookmark(paths, index, bookmark))
		return true
	}

	private _createNewPathAndAddBookmark(paths: string[], index: number, bookmark: Bookmark): Bookmark {
		if (index === paths.length) {
			return bookmark
		}
		let contextValue = ContextBookmark.Folder
		if (index === paths.length - 1 && !bookmark.isDirectory) {
			contextValue = ContextBookmark.File
		} else {
			contextValue = ContextBookmark.Folder
		}
		const fsPath = paths.slice(0, index + 1).join(path.sep)
		const bm = this._createNewPathAndAddBookmark(paths, index + 1, bookmark)
		return new Bookmark({
			label: paths[index],
			path: fsPath,
			contextValue: contextValue,
			subs: new BookmarkSet([bm]),
		})
	}

	private _getAllBookmarkFollowPath(out: Map<string, Bookmark[]>) {
		for (const i of this) {
			const a = out.get(i.path)
			if (a) {
				a.push(i.copyWith({ subs: new BookmarkSet(), isOpened: false }))
				out.set(i.path, a)
			} else {
				out.set(i.path, [i.copyWith({ subs: new BookmarkSet() })])
			}
			if (i.subs.size > 0) {
				i.subs._getAllBookmarkFollowPath(out)
			}
		}
	}
}
