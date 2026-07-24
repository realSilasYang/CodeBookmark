/**
 * 定义书签节点、光标位置和父子关系，是树形编辑与持久化之间共享的领域对象。
 * 节点自身只序列化本地字段；脚本身份、源路径和格式版本由外层信封负责。
 */
import * as vscode from 'vscode'
import { normalizeBookmarkIconName } from '../util/BookmarkIconName'
import { canonicalBookmarkPath } from '../util/BookmarkPath'
import { Commands } from '../util/constants/Commands'
import { localize } from '../i18n/Localization'
import { Helper } from '../util/Helper'
import { createBookmarkId, createScriptId } from '../util/ScriptIdentity'


import { BookmarkSet } from '../models/BookmarkSet'
import path = require('path')
import { ContextBookmark } from '../util/ContextValue'
import {
	CODE_MARKER_ICON,
	type CodeMarkerMetadata,
} from '../util/CodeMarkerScanner'
import {
	parseBookmarkJSON,
	type BookmarkJSON,
	type BookmarkParseState,
	type ParsedBookmark,
} from './BookmarkCodec'
import { bookmarkLabelText } from './BookmarkLabel'
import { refreshBookmarkTreeItem } from './BookmarkTreeItemPresentation'

export { MAX_BOOKMARK_NODES } from './BookmarkCodec'
export type { BookmarkJSON } from './BookmarkCodec'

export { bookmarkLabelText } from './BookmarkLabel'

export class CursorIndex {
	public line: number
	public column: number
	constructor(line: number, column: number) {
		this.line = line
		this.column = column
	}
	static from(position: vscode.Position): CursorIndex {
		return new CursorIndex(position.line, position.character)
	}

	equals(other: CursorIndex) {
		return this.line === other.line && this.column === other.column
	}

}

export class Bookmark extends vscode.TreeItem {
	private displaySignature: string | undefined
	public id!: string
	public icon!: string
	public path!: string
	public subs!: BookmarkSet
	public isPinned: boolean
	public start!: CursorIndex
	public end!: CursorIndex
	public content?: string
	public contextBefore?: string
	public contextAfter?: string
	public createdAt: number
	public parent?: Bookmark
	public scriptId?: string
	public ownerScriptId?: string
	public fileLabelCustomized: boolean
	public codeMarker?: CodeMarkerMetadata

	constructor(param?: {
		id?: string
		contextValue?: ContextBookmark
		icon?: string
		label?: string | vscode.TreeItemLabel
		path?: string
		isInvalid?: boolean
		subs?: BookmarkSet
		content?: string
		contextBefore?: string
		contextAfter?: string
		isPinned?: boolean
		collapsible?: vscode.TreeItemCollapsibleState
		parent?: Bookmark
		start?: CursorIndex
		end?: CursorIndex
		createdAt?: number
		scriptId?: string
		ownerScriptId?: string
		fileLabelCustomized?: boolean
		codeMarker?: CodeMarkerMetadata
	}) {
		const collapsible = Bookmark._handleCollapsible(param)
		const labelText = bookmarkLabelText(param?.label).trim().replace(/\s+/g, ' ').slice(0, 1000)
		if (param?.contextValue === ContextBookmark.File) {
			const filePath = param.path ?? ''
			super(labelText || path.basename(filePath), collapsible)
		} else if (param?.contextValue === ContextBookmark.BookmarkInvalid) {
			const label = Helper.formatLabelSpacing(labelText)
			super({ label, highlights: [[0, label.length]] }, collapsible)
		} else {
			super(Helper.formatLabelSpacing(labelText), collapsible)
		}

		this.id = param?.id || createBookmarkId()
		this.createdAt = param?.createdAt ?? Date.now()
		this.content = param?.content?.trim()
		this.contextBefore = param?.contextBefore
		this.contextAfter = param?.contextAfter
		this.contextValue = param?.isInvalid
			? ContextBookmark.BookmarkInvalid
			: param?.contextValue ?? ContextBookmark.Bookmark
		if (param?.isPinned && this.contextValue === ContextBookmark.Bookmark) {
			this.contextValue = ContextBookmark.BookmarkPinned
		}
		this.start = param?.start ?? new CursorIndex(0, 0)
		this.end = param?.end ?? new CursorIndex(0, 0)
		this.parent = param?.parent
		this.scriptId = param?.scriptId
		this.ownerScriptId = param?.ownerScriptId
		this.fileLabelCustomized = param?.fileLabelCustomized ?? false
		this.codeMarker = param?.codeMarker
		this.icon = normalizeBookmarkIconName(param?.icon)
		this.path = param?.path ?? ''
		this.subs = param?.subs ?? new BookmarkSet()
		this.isPinned = param?.isPinned ?? false
		this.refreshDisplayProps()

		if (!this.isBookmarkInvalid) {
			this.command = {
				command: Commands.openBookmark,
				title: localize('models.Bookmark.openBookmark'),
				arguments: [this]
			}
		}
	}

	private static _handleCollapsible(param?: {
		isPinned?: boolean
		subs?: BookmarkSet
		collapsible?: vscode.TreeItemCollapsibleState
	}): vscode.TreeItemCollapsibleState {
		let collapsible = vscode.TreeItemCollapsibleState.None
		if (param?.isPinned) {
			collapsible = vscode.TreeItemCollapsibleState.Expanded
		} else if (param?.subs?.size === 0) {
			collapsible = vscode.TreeItemCollapsibleState.None
		} else if (param?.collapsible) {
			collapsible = param?.collapsible
		} else if (param?.subs?.size ?? 0 > 0) {
			collapsible = vscode.TreeItemCollapsibleState.Collapsed
		}
		return collapsible
	}

	get level(): number {
		if (this.contextValue === ContextBookmark.File) {
			return 0;
		}
		let lvl = 1;
		let curr = this.parent;
		while (curr) {
			if (curr.contextValue !== ContextBookmark.File) {
				lvl++;
			}
			curr = curr.parent;
		}
		return lvl;
	}

	public refreshDisplayProps() {
		this.displaySignature = refreshBookmarkTreeItem(this, this.displaySignature)
	}

	// Bookmark 只知道自身及子节点。scriptId、源路径和格式头属于脚本信封，
	// 若在这里一并写出，会让普通子书签也携带并不属于它们的仓库身份。
	public toJSON(): BookmarkJSON {
		return this.toJSONWithChildren(Array.from(this.subs).map(sub => sub.toJSON()))
	}

	public toJSONShallow(): BookmarkJSON {
		return this.toJSONWithChildren([])
	}

	private toJSONWithChildren(subs: BookmarkJSON[]): BookmarkJSON {
		return {
			id: this.id,
			createdAt: this.createdAt,
			label: bookmarkLabelText(this.label),
			path: this.path,
			collapsibleState: this.collapsibleState ?? vscode.TreeItemCollapsibleState.None,
			pinned: this.isPinned,
			content: this.content,
			contextBefore: this.contextBefore,
			contextAfter: this.contextAfter,
			iconName: this.icon,
			isInvalid: this.contextValue === ContextBookmark.BookmarkInvalid,
			subs,
			params: `${this.start.line},${this.start.column},${this.end.line},${this.end.column}`,
			codeMarker: this.codeMarker,
		}
	}
	private static fromParsedJSON(data: ParsedBookmark): Bookmark {
		const subs = new BookmarkSet()
		for (const child of data.subs) subs.add(this.fromParsedJSON(child))
		const parent = new Bookmark({
			id: data.id,
			label: data.label,
			path: data.path,
			content: data.content,
			contextBefore: data.contextBefore,
			contextAfter: data.contextAfter,
			collapsible: data.collapsibleState as vscode.TreeItemCollapsibleState,
			icon: data.iconName,
			subs,
			start: new CursorIndex(data.startLine, data.startColumn),
			end: new CursorIndex(data.endLine, data.endColumn),
			isInvalid: data.isInvalid,
			isPinned: data.pinned,
			createdAt: data.createdAt,
			codeMarker: data.codeMarker,
		})
		for (const child of subs) child.parent = parent
		parent.subs = subs
		return parent
	}

	public static fromJSON(data: unknown, depth = 0, state: BookmarkParseState = { count: 0 }): Bookmark {
		return this.fromParsedJSON(parseBookmarkJSON(data, depth, state))
	}

	public createContainingFileNode(): Bookmark {
		const scriptId = createScriptId()
		const canonicalPath = canonicalBookmarkPath(this.path)
		this.path = canonicalPath
		this.ownerScriptId = scriptId
		return new Bookmark({
			id: `file_${scriptId}`,
			label: path.basename(canonicalPath),
			path: canonicalPath,
			scriptId,
			contextValue: ContextBookmark.File,
			collapsible: vscode.TreeItemCollapsibleState.Expanded,
			createdAt: this.createdAt,
		})
	}


	public equals(other: Bookmark | undefined): boolean {
		if (!other) return false
		return this.id === other.id
	}
	isChildOf(bookmarks: BookmarkSet): boolean {
		for (const bm of bookmarks) {
			if (bm.subs.has(this)) {
				return true
			}

			if (this.isChildOf(bm.subs)) {
				return true
			}

		}
		return false
	}

	get isFile(): boolean {
		return this.contextValue === ContextBookmark.File
	}

	get treeDepth(): number {
		let depth = 0
		let current = this.parent
		while (current) {
			depth++
			current = current.parent
		}
		return depth
	}
	get isBookmarkInvalid(): boolean {
		return this.contextValue === ContextBookmark.BookmarkInvalid
	}
	get isCodeMarker(): boolean {
		return this.codeMarker !== undefined
	}
	get defaultIconName(): string {
		return this.isCodeMarker ? CODE_MARKER_ICON : ''
	}
	get isUsingDefaultIcon(): boolean {
		return this.icon === this.defaultIconName
	}
}
