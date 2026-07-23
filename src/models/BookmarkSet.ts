/**
 * 模块说明：本文件负责书签领域模型与展示投影，具体对象为 `BookmarkSet`。
 *
 * 实现要点：定义书签领域数据、父子关系和展示投影，并在对象内部维护不变量。
 * 核心边界：领域对象负责维持自身不变量；序列化字段、父子关系和展示状态不得被调用方绕过。
 * 主要入口：`BookmarkSet`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import { logger } from '../util/Logger';
import { localize } from '../i18n/Localization'
import type { Bookmark } from './Bookmark';
import path = require('path')
import * as vscode from 'vscode'
import { bookmarkPathKey, isSameOrDescendantBookmarkPath, renamedBookmarkPath } from '../util/BookmarkPath'
import { createBookmarkId } from '../util/ScriptIdentity'

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

	public add(value: Bookmark): boolean {
		if (this.has(value)) {
			return false
		} else {
			this.values.push(value)
			return true
		}
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

	public [Symbol.iterator](): IterableIterator<Bookmark> {
		return this.values[Symbol.iterator]()
	}


	public get size(): number {
		return this.values.length
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
			if (this.values[i].id === id) {
				this.delete(i)
				return
			}
			if (this.values[i].subs.size > 0) {
				this.values[i].subs.deleteBookmark(id)
				if (this.values[i].isFile) {
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
			logger.showWarningMessage(localize('不能把父书签移动到它的子书签中。', 'A parent bookmark cannot be moved into one of its children.'))
			return false
		}
		const items = [...group]
		if (items.length === 0 || (target && items.some(item => item.equals(target)))) return false
		if (items.some(item => this.containerOf(item) === undefined)) return false
		const before = this.orderSignature()
		const previousParents = new Set(items.map(item => item.parent).filter((parent): parent is Bookmark => parent !== undefined))

		for (const item of items) this.containerOf(item)?.fastDelete(item)
		for (const item of items) {
			item.parent = target
			if (target) target.subs.add(item)
			else this.add(item)
		}

		for (const parent of previousParents) {
			parent.refreshDisplayProps()
			if (parent.isFile && parent !== target && parent.subs.size === 0) this.fastDelete(parent)
		}
		target?.refreshDisplayProps()
		return before !== this.orderSignature()
	}

	changeIndexNode(group: BookmarkSet, target: Bookmark | undefined): boolean {
		const isChild = target?.isChildOf(group)
		if (isChild) {
			logger.showWarningMessage(localize('不能把父书签移动到它的子书签之前。', 'A parent bookmark cannot be moved before one of its children.'))
			return false
		}
		if (!target) return false
		const targetContainer = this.containerOf(target)
		const items = [...group]
		if (!targetContainer || items.length === 0 || items.some(item => item.equals(target))) return false
		if (items.some(item => this.containerOf(item) === undefined)) return false
		const before = this.orderSignature()
		const previousParents = new Set(items.map(item => item.parent).filter((parent): parent is Bookmark => parent !== undefined))

		for (const item of items) this.containerOf(item)?.fastDelete(item)
		const targetIndex = targetContainer.indexOf(target)
		if (targetIndex < 0) return false
		for (let offset = 0; offset < items.length; offset++) {
			const item = items[offset]
			item.parent = target.parent
			targetContainer.insert(targetIndex + offset, item)
		}
		for (const parent of previousParents) parent.refreshDisplayProps()
		target.parent?.refreshDisplayProps()
		return before !== this.orderSignature()
	}

	private containerOf(bookmark: Bookmark): BookmarkSet | undefined {
		if (this.indexOf(bookmark) >= 0) return this
		const parent = bookmark.parent
		if (parent && parent.subs.indexOf(bookmark) >= 0) return parent.subs
		return undefined
	}

	private orderSignature(): string {
		const visit = (set: BookmarkSet): unknown[] => set.values.map(bookmark => [bookmark.id, visit(bookmark.subs)])
		return JSON.stringify(visit(this))
	}

	containsPath(targetPath: string): boolean {
		for (const bookmark of this.values) {
			if (isSameOrDescendantBookmarkPath(bookmark.path, targetPath)) return true
			if (bookmark.subs.size > 0 && bookmark.subs.containsPath(targetPath)) return true
		}
		return false
	}

	renamePath(oldPath: string, newPath: string) {
		for (const vi of this.values) {
			if (isSameOrDescendantBookmarkPath(vi.path, oldPath)) {
				const fsPath = renamedBookmarkPath(vi.path, oldPath, newPath)
				vi.path = fsPath
				if (vi.isFile) {
					vi.label = path.basename(fsPath)
					vi.resourceUri = undefined
				}
			}
			if (vi.subs.size > 0) {
				vi.subs.renamePath(oldPath, newPath)
			}
		}
	}

	mergeFileNodesAtPath(targetPath: string, preferredScriptId?: string): Bookmark | undefined {
		const matching = this.values.filter(bookmark => bookmark.isFile && bookmarkPathKey(bookmark.path) === bookmarkPathKey(targetPath))
		if (matching.length === 0) return undefined
		const primary = matching.find(bookmark => bookmark.scriptId === preferredScriptId) ?? matching[0]
		const existingIds = new Map(primary.subs.values.map(bookmark => [bookmark.id, bookmark]))
		const rewriteIds = (bookmark: Bookmark): void => {
			bookmark.id = createBookmarkId()
			for (const child of bookmark.subs) rewriteIds(child)
		}
		for (const duplicate of matching) {
			if (duplicate === primary) continue
			for (const bookmark of duplicate.subs.values) {
				const existing = existingIds.get(bookmark.id)
				if (existing && JSON.stringify(existing.toJSON()) === JSON.stringify(bookmark.toJSON())) continue
				if (existing) rewriteIds(bookmark)
				bookmark.parent = primary
				primary.subs.add(bookmark)
				existingIds.set(bookmark.id, bookmark)
			}
			const duplicateIndex = this.indexOf(duplicate)
			if (duplicateIndex >= 0) this.delete(duplicateIndex)
		}
		primary.createdAt = Math.min(primary.createdAt, ...primary.subs.values.map(bookmark => bookmark.createdAt))
		return primary
	}

	mergeDuplicateFileNodes(preferredScriptIds: Set<string> = new Set()): void {
		const paths = new Set(this.values.filter(bookmark => bookmark.isFile).map(bookmark => bookmarkPathKey(bookmark.path)))
		for (const pathKey of paths) {
			const matching = this.values.filter(bookmark => bookmark.isFile && bookmarkPathKey(bookmark.path) === pathKey)
			if (matching.length < 2) continue
			const preferred = matching.find(bookmark => bookmark.scriptId && preferredScriptIds.has(bookmark.scriptId))
			this.mergeFileNodesAtPath(matching[0].path, preferred?.scriptId)
		}
	}


	deleteWithPath(pathDeleted: string): boolean {
		let hasDelete = false
		for (let i = 0; i < this.values.length;) {
			if (isSameOrDescendantBookmarkPath(this.values[i].path, pathDeleted)) {
				this.delete(i)
				hasDelete = true
				continue
			}
			if (this.values[i].subs.size > 0) {
				const de = this.values[i].subs.deleteWithPath(pathDeleted)
				if (hasDelete === false) {
					hasDelete = de
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
				vi.isPinned = !vi.isPinned
				changed = true;
			} else {
				if (vi.isPinned && !vi.isFile) {
					vi.isPinned = false
					changed = true;
				}
			}
			if (changed) {
				vi.collapsibleState = vi.isPinned
					? vscode.TreeItemCollapsibleState.Expanded
					: vi.subs.size > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
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
			if (vi.isPinned && !vi.isFile && bookmarkPathKey(vi.path) === bookmarkPathKey(bookmark.path)) {
				bookmark.parent = vi
				vi.subs.add(bookmark)
				const refreshSubtree = (node: Bookmark) => {
					node.refreshDisplayProps()
					for (const child of node.subs) refreshSubtree(child)
				}
				refreshSubtree(bookmark)
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
			let fileNode = this.values.find(v => v.isFile && bookmarkPathKey(v.path) === bookmarkPathKey(bookmark.path));
			if (fileNode) {
				bookmark.parent = fileNode;
				fileNode.subs.add(bookmark);
				fileNode.createdAt = Math.min(fileNode.createdAt, bookmark.createdAt)
			} else {
				fileNode = bookmark.createContainingFileNode()
				bookmark.parent = fileNode;
				fileNode.subs.add(bookmark);
				this.add(fileNode);
			}
		}
		return pin
	}

}
