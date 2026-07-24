/**
 * 把 AI 返回的行号、层级、标签和图标转换成可加入书签树的领域节点。
 * 重新生成时只替换用户书签，自动 TODO/FIXME/BUG 节点仍由代码标记扫描器独立维护。
 */
import * as vscode from 'vscode'
import { Bookmark, CursorIndex } from '../models/Bookmark'
import type { AIBookmark } from '../util/AIBookmarkSchema'
import { resolveAIBookmarkLine } from '../util/AIBookmarkSchema'
import { getFingerprintContext } from '../util/FingerprintMatcher'

interface AIBookmarkBuildState {
	lines: string[]
	occupiedLines: Set<number>
	assignIcons: boolean
	created: number
	skipped: number
}

interface AIBookmarkBuildResult {
	roots: Bookmark[]
	created: number
	skipped: number
}

export function expandGeneratedBookmarkTree(bookmarks: readonly Bookmark[]): void {
	const expanded = new Set<Bookmark>()
	const expandSubtree = (bookmark: Bookmark): void => {
		for (const child of bookmark.subs) expandSubtree(child)
		if (bookmark.subs.size === 0 || expanded.has(bookmark)) return
		bookmark.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
		bookmark.refreshDisplayProps()
		expanded.add(bookmark)
	}
	for (const bookmark of bookmarks) {
		expandSubtree(bookmark)
		let ancestor = bookmark.parent
		while (ancestor) {
			if (ancestor.subs.size > 0 && !expanded.has(ancestor)) {
				ancestor.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
				ancestor.refreshDisplayProps()
				expanded.add(ancestor)
			}
			ancestor = ancestor.parent
		}
	}
}

function processAIBookmark(
	aiBookmark: AIBookmark,
	pathRel: string,
	state: AIBookmarkBuildState,
	parent?: Bookmark,
): Bookmark[] {
	const line = resolveAIBookmarkLine(state.lines, aiBookmark)
	if (line === undefined || state.occupiedLines.has(line)) {
		state.skipped++
		return aiBookmark.subs.flatMap(child => processAIBookmark(child, pathRel, state, parent))
	}
	state.occupiedLines.add(line)

	const lineText = state.lines[line]
	const bookmark = new Bookmark({
		path: pathRel,
		label: aiBookmark.label,
		icon: state.assignIcons ? aiBookmark.iconName : undefined,
		content: lineText,
		start: new CursorIndex(line, 0),
		end: new CursorIndex(line, lineText.length),
		parent,
	})
	const context = getFingerprintContext(state.lines, line, lineText)
	bookmark.contextBefore = context.before
	bookmark.contextAfter = context.after

	for (const child of aiBookmark.subs) {
		const childBookmarks = processAIBookmark(child, pathRel, state, bookmark)
		bookmark.subs.addAll(childBookmarks)
	}

	bookmark.refreshDisplayProps()
		if (bookmark.subs.size > 0) bookmark.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
	state.created++
	return [bookmark]
}

export function buildAIBookmarks(
	aiBookmarks: readonly AIBookmark[],
	lines: string[],
	pathRel: string,
	existingBookmarks: readonly Bookmark[],
	overwrite: boolean,
	assignIcons: boolean,
): AIBookmarkBuildResult {
	// “重新生成并替换”针对的是用户书签。TODO/FIXME/BUG 节点由扫描器拥有，
	// 此处先把它们留下，稍后的插入还会避开这些已经占用的源码行。
	const occupiedBookmarks = overwrite
		? existingBookmarks.filter(bookmark => bookmark.isCodeMarker)
		: existingBookmarks
	const state: AIBookmarkBuildState = {
		lines,
		occupiedLines: new Set(occupiedBookmarks.map(bookmark => bookmark.start.line)),
		assignIcons,
		created: 0,
		skipped: 0,
	}
	const roots: Bookmark[] = []
	for (const aiBookmark of aiBookmarks) roots.push(...processAIBookmark(aiBookmark, pathRel, state))
	return { roots, created: state.created, skipped: state.skipped }
}
