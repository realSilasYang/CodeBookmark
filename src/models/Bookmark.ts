import * as os from 'os'
import * as vscode from 'vscode'
import { IconType, bookmarkIcon } from '../util/BookmarkIcon'
import { Commands } from '../util/constants/Commands'
import { fileUtils } from '../util/FileUtils'
import { Helper } from '../util/Helper'


import { BookmarkSet } from '../models/BookmarkSet'
import path = require('path')
import { ContextBookmark } from '../util/ContextValue'



// export enum BookmarkType {
// 	None = 0,
// 	File = 1, // symbol-file
// 	Folder = 2, // symbol-folder
// 	Method = 3, // symbol-method
// 	Call = 4, //symbol-class
// 	Object = 5, // symbol-object
// 	Class = 6,
// 	Interface = 7,
// 	Enum = 8, // symbol-enum
// 	Array = 9,  // symbol-array
// 	Variable = 10, // symbol-variable
// }

enum BookmarkParam {
	StartLine = 0,
	StartColumn = 1,
	EndLine = 2,
	EndColumn = 3,
}

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

	copy(): CursorIndex {
		return new CursorIndex(this.line, this.column)
	}
}

export class Bookmark extends vscode.TreeItem {
	public Id!: string
	public icon!: string
	public path!: string
	public subs!: BookmarkSet
	public isOpened?: boolean
	public collapsible?: vscode.TreeItemCollapsibleState
	public start!: CursorIndex
	public end!: CursorIndex
	public content?: string
	public parent?: Bookmark
	public command?: vscode.Command

	constructor(param?: {
		Id?: string
		contextValue?: string
		icon?: string
		label?: string | vscode.TreeItemLabel
		path?: string
		column?: number
		isInvalid?: boolean
		subs?: BookmarkSet
		content?: string
		isOpened?: boolean
		collapsible?: vscode.TreeItemCollapsibleState
		parent?: Bookmark
		start?: CursorIndex
		end?: CursorIndex
	}) {
		if (param?.contextValue === ContextBookmark.None) {
			super(param?.label ?? '', vscode.TreeItemCollapsibleState.None)
			this.icon = ''
			this.path = ''
			this.subs = new BookmarkSet()
			this.start = new CursorIndex(0, 0)
			this.end = new CursorIndex(0, 0)
			this.contextValue = ContextBookmark.None
			this.Id = Helper.createNewId()
		} else {

			// get collapsible state
			const collapsible = Bookmark._handleCollapsible(param)
			////
			if (param?.contextValue === ContextBookmark.File || param?.contextValue === ContextBookmark.Folder) {
				const uri = fileUtils.relativeToUri(param?.path ?? '')
				super(
					uri,
					collapsible
				)
				this.label = path.basename(uri.fsPath)
			} else {
				if (param?.contextValue === ContextBookmark.BookmarkInvalid) {
					super({
						label: Helper.formatLabelSpacing(`${param?.label}`.trim()),
						highlights: [[0, Helper.formatLabelSpacing(`${param?.label}`.trim()).length]]
					},
						collapsible
					)

				} else {
					super(
						Helper.formatLabelSpacing(`${param?.label}`.trim()),
						collapsible
					)
				}
			}
			if (param?.Id && param?.Id !== '') {
				this.Id = param?.Id
			} else {
				this.Id = Helper.createNewId()
			}
			this.content = param?.content?.trim()
			
			if (param?.isInvalid) {
				this.contextValue = ContextBookmark.BookmarkInvalid
			} else {
				this.contextValue = param?.contextValue ?? ContextBookmark.Bookmark
				if (param?.isOpened && this.contextValue === ContextBookmark.Bookmark) {
					this.contextValue = ContextBookmark.BookmarkPinned
				}
			}
			this.start = param?.start ?? new CursorIndex(0, 0)
			this.end = param?.end ?? new CursorIndex(0, 0)
			this.parent = param?.parent
			
			this.icon = param?.icon || '';
			
			this.path = param?.path ?? ''
			this.subs = param?.subs ?? new BookmarkSet()
			this.isOpened = param?.isOpened ?? false
			this.refreshDisplayProps()

			if (this.contextValue === ContextBookmark.Bookmark || this.contextValue === ContextBookmark.Watcher || this.contextValue === ContextBookmark.File || this.contextValue === ContextBookmark.BookmarkFolder) {
				this.command = {
					command: Commands.openBookmark, // Lệnh khi click vào item
					title: 'Open Bookmark', // Tên lệnh
					arguments: [this]
				}
			}
		}
	}

	private static _handleCollapsible(param?: any): vscode.TreeItemCollapsibleState {
		let collapsible = vscode.TreeItemCollapsibleState.None
		if (param?.isOpened) {
			if (param?.isOpened === true) {
				collapsible = vscode.TreeItemCollapsibleState.Expanded
			}
		} else if (param?.subs?.size === 0) {
			collapsible = vscode.TreeItemCollapsibleState.None
		} else if (param?.collapsible) {
			collapsible = param?.collapsible
		} else if (param?.subs?.size ?? 0 > 0) {
			collapsible = vscode.TreeItemCollapsibleState.Collapsed
		}
		return collapsible
	}

	static _handleTooltipUri(uri: vscode.Uri): string {
		if (uri.fsPath.startsWith(os.homedir())) {
			return `~${uri.fsPath.slice(os.homedir().length)}`; // Replace home directory with ~
		}
		return ''
	}

	get level(): number {
		if (this.contextValue === ContextBookmark.File || this.contextValue === ContextBookmark.Folder || this.contextValue === ContextBookmark.Watcher) {
			return 0;
		}
		let lvl = 1;
		let curr = this.parent;
		while (curr) {
			if (curr.contextValue !== ContextBookmark.File && curr.contextValue !== ContextBookmark.Folder && curr.contextValue !== ContextBookmark.Watcher) {
				lvl++;
			}
			curr = curr.parent;
		}
		return lvl;
	}

	public refreshDisplayProps() {
		if (this.contextValue === ContextBookmark.Bookmark || this.contextValue === ContextBookmark.BookmarkPinned) {
			this.contextValue = this.isOpened ? ContextBookmark.BookmarkPinned : ContextBookmark.Bookmark;
		}

		if (!this.isDirectory) {
			this.description = ''; // Clear description
			this.resourceUri = undefined;

			if (this.subs.size === 0) {
				this.collapsibleState = vscode.TreeItemCollapsibleState.None;
			} else {
				this.collapsibleState = this.isOpened ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
			}
		}

		this._handleTooltip();

		if (this.contextValue === ContextBookmark.None && this.Id === 'No Watcher') {
			this.iconPath = bookmarkIcon.getIcon(IconType.watcher)
			return
		}
		if (this.isBookmarkInvalid) {
			this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'))
			return
		}
		if (this.contextValue === ContextBookmark.Watcher) {
			if (this.isOpened) {
				this.iconPath = new vscode.ThemeIcon('eye', new vscode.ThemeColor('charts.green'))
			} else {
				this.iconPath = new vscode.ThemeIcon('eye')
			}
			return
		}
		if (this.contextValue === ContextBookmark.File) {
			this.iconPath = new vscode.ThemeIcon('file', new vscode.ThemeColor('codebookmark.color.fileNode'))
			return
		}
		
		const lvl = this.level;
		const hasSubs = this.subs.size > 0;

		if (this.isOpened) {
			this.iconPath = new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('charts.green'));
		} else if (this.icon === '') {
			if (hasSubs) {
				if (lvl === 1) {
					this.iconPath = new vscode.ThemeIcon('bookmark', new vscode.ThemeColor('codebookmark.color.Lvl1Orange'));
				} else if (lvl === 2) {
					this.iconPath = new vscode.ThemeIcon('bookmark', new vscode.ThemeColor('codebookmark.color.Lvl2Blue'));
				} else {
					this.iconPath = new vscode.ThemeIcon('folder');
				}
			} else {
				this.iconPath = new vscode.ThemeIcon('bookmark');
			}
		} else if (this.icon !== '') {
			this.iconPath = bookmarkIcon.getCustomIcon(this.icon as string);
		}
	}

	// Json local
	public toJSON(): any {
		return {
			id: this.Id,
			label: this.label,
			path: this.path,
			line: this.start.line,
			opened: this.collapsibleState,
			content: this.content,
			iconName: this.icon,
			isInvalid: this.contextValue === ContextBookmark.BookmarkInvalid,
			subs: Array.from(this.subs).map(sub => sub.toJSON()),
			params: `${this.start.line},${this.start.column},${this.end.line},${this.end.column}`,
		}
	}
	public static fromJSON(data: any): Bookmark {
		const subs = new BookmarkSet()
		if (data.subs && data.subs.length > 0) {
			for (const subItem of data.subs) {
				subs.add(this.fromJSON(subItem))
			}
		}

		const params = data.params.split(',').map(Number)
		const parsedIcon: string = data.iconName || '';

		const parent = new Bookmark({
			Id: data.id,
			label: data.label,
			path: data.path,
			content: data.content,
			collapsible: data.opened,
			icon: parsedIcon,
			subs: subs,
			start: new CursorIndex(params[BookmarkParam.StartLine], params[BookmarkParam.StartColumn]),
			end: new CursorIndex(params[BookmarkParam.EndLine], params[BookmarkParam.EndColumn]),
			isInvalid: data.isInvalid,
		})
		for (const bm of subs) {
			bm.parent = parent
		}
		parent.subs = subs
		return parent
	}


	public compareIndex(other: Bookmark): boolean {
		return this.path === other.path && this.start.line === other.start.line
	}

	public equals(other: Bookmark | undefined): boolean {
		if (!other) return false
		return this.Id === other.Id
	}

	public copyWith(param?: {
		Id?: string
		label?: string | vscode.TreeItemLabel
		path?: string
		icon?: string
		subs?: BookmarkSet
		content?: string
		isOpened?: boolean
		collapsibleState?: vscode.TreeItemCollapsibleState
		parent?: Bookmark
		contextValue?: ContextBookmark
		start?: CursorIndex
		end?: CursorIndex
	}): Bookmark {
		return new Bookmark({
			Id: param?.Id ?? this.Id,
			label: param?.label ?? this.label,
			path: param?.path ?? this.path,
			subs: param?.subs ?? this.subs,
			icon: param?.icon ?? this.icon,
			content: param?.content ?? this.content,
			isOpened: param?.isOpened ?? this.isOpened,
			collapsible: param?.collapsibleState ?? this.collapsibleState,
			parent: param?.parent ?? this.parent,
			contextValue: param?.contextValue ?? this.contextValue,
			start: param?.start ?? this.start,
			end: param?.end ?? this.end,
		})
	}

	public getParent(bookmarks: Array<Bookmark>): Bookmark | null {
		for (const bm of bookmarks) {
			const parent = this._findParent(bm, this)
			if (parent) {
				return parent
			}
		}
		return null
	}

	private _handleTooltip() {
		if (this.isDirectory) {
			if (this.resourceUri) this.tooltip = Bookmark._handleTooltipUri(this.resourceUri)
		} else {
			const tooltipContent = new vscode.MarkdownString();
			tooltipContent.supportThemeIcons = true
			tooltipContent.appendMarkdown(`#### $(tag) ${this.label} &nbsp;&nbsp; $(debug-line-by-line) ${this.start.line + 1}\n`)
			if (this.subs.size > 0) {
				tooltipContent.appendMarkdown(`$(type-hierarchy-sub) **${this.subs.size}**\n`)
			}
			tooltipContent.appendCodeblock(this.content ?? '', path.extname(this.path).split('.').pop())
			this.tooltip = tooltipContent
		}
	}

	private _findParent(parent: Bookmark, child: Bookmark): Bookmark | null {
		if (parent.subs.has(child)) {
			return parent
		}
		for (const subElement of parent.subs) {
			const found = this._findParent(subElement, child)
			if (found) {
				return found
			}
		}
		return null
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

	hasSub(bookmarks: BookmarkSet): boolean {
		const size = bookmarks.findBookmark(this)?.subs?.size ?? 0
		return size > 0
	}

	get isFile(): boolean {
		return this.contextValue === ContextBookmark.File
	}
	get isFolder(): boolean {
		return this.contextValue === ContextBookmark.Folder
	}
	get isDirectory(): boolean {
		return this.isFile || this.isFolder
	}
	get isWatcher(): boolean {
		return this.contextValue === ContextBookmark.Watcher
	}
	get isBookmark(): boolean {
		return this.contextValue === ContextBookmark.Bookmark
	}
	get isBookmarkInvalid(): boolean {
		return this.contextValue === ContextBookmark.BookmarkInvalid
	}
}
