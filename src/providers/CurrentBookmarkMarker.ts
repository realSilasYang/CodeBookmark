/**
 * 使用原生条目描述标记活动编辑器所在的书签章节。
 * 标记只跟随编辑器和树的展开状态，避免干扰侧边栏选择与滚动。
 */
import * as vscode from 'vscode'
import type { Bookmark } from '../models/Bookmark'

// 较宽的飘旗在 Windows 原生书签行中的字形重心接近行中线。
const currentBookmarkSymbol = '🏲'

export class CurrentBookmarkMarker {
	private current?: Bookmark

	constructor(
		private readonly candidates: (editor: vscode.TextEditor) => readonly Bookmark[],
		private readonly parentOf: (bookmark: Bookmark) => Bookmark | undefined,
		private readonly refreshItems: (bookmarks: Bookmark[]) => void,
	) {}

	track(tree: vscode.TreeView<Bookmark>, treeChanged: vscode.Event<Bookmark | Bookmark[] | void>): vscode.Disposable {
		const update = () => this.update(tree.visible)
		const activeOnly = ({ textEditor }: { textEditor: vscode.TextEditor }) => {
			if (textEditor === vscode.window.activeTextEditor) update()
		}
		return vscode.Disposable.from(
			vscode.window.onDidChangeActiveTextEditor(update),
			vscode.window.onDidChangeTextEditorSelection(activeOnly),
			vscode.window.onDidChangeTextEditorVisibleRanges(activeOnly),
			tree.onDidChangeVisibility(update),
			tree.onDidExpandElement(update),
			tree.onDidCollapseElement(update),
			treeChanged(changed => { if (changed === undefined) this.update(tree.visible, false) }),
		)
	}

	decorate(bookmark: Bookmark): vscode.TreeItem {
		if (bookmark !== this.current) return bookmark
		const description = bookmark.description ? `${currentBookmarkSymbol}  ${bookmark.description}` : currentBookmarkSymbol
		return { ...bookmark, description }
	}

	private update(visible: boolean, refresh = true): void {
		if (!visible) return
		const editor = vscode.window.activeTextEditor
		const previous = this.current
		this.current = editor?.document.uri.scheme === 'file' ? this.findVisibleBookmark(editor) : undefined
		if (!refresh || this.current === previous) return
		const affected = [previous, this.current].filter((bookmark): bookmark is Bookmark => bookmark !== undefined)
		this.refreshItems(affected)
	}

	private findVisibleBookmark(editor: vscode.TextEditor): Bookmark | undefined {
		const cursor = editor.selection.active
		const cursorVisible = editor.visibleRanges.some(range => range.contains(cursor))
		const line = cursorVisible ? cursor.line : editor.visibleRanges[0]?.start.line ?? cursor.line
		let match: Bookmark | undefined
		for (const bookmark of this.candidates(editor)) {
			if (bookmark.isFile || bookmark.isBookmarkInvalid || bookmark.start.line > line) continue
			if (!match || bookmark.start.line > match.start.line
				|| (bookmark.start.line === match.start.line && bookmark.treeDepth > match.treeDepth)) match = bookmark
		}

		// 子项折叠时在可见的上级显示标记，无需展开分组。
		for (let parent = match && this.parentOf(match); parent; parent = this.parentOf(parent)) {
			if (parent.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed) match = parent
		}
		return match
	}
}
