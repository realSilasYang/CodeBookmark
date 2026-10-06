/**
 * 把 AI 返回的行号、层级、标签和图标转换成可加入书签树的领域节点。
 * 重新生成时只替换用户书签，自动 TODO/FIXME/BUG 节点仍由代码标记扫描器独立维护。
 */
import * as vscode from 'vscode'
import { Bookmark, CursorIndex } from '../models/Bookmark'
import type { BookmarkSet } from '../models/BookmarkSet'
import type { AIBookmark } from '../util/AIBookmarkSchema'
import { resolveAIBookmarkLine } from '../util/AIBookmarkSchema'
import { getFingerprintContext } from '../util/FingerprintMatcher'

interface AIBookmarkBuildState {
	lines: string[]
	occupiedLines: Set<number>
	reusableBookmarksByLine: Map<number, Bookmark>
	existingBookmarks: ReadonlySet<Bookmark>
	roots: Bookmark[]
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
): void {
	const line = resolveAIBookmarkLine(state.lines, aiBookmark)
	if (line === undefined || state.occupiedLines.has(line)) {
		state.skipped++
		const existingParent = line === undefined ? undefined : state.reusableBookmarksByLine.get(line)
		for (const child of aiBookmark.subs) processAIBookmark(child, pathRel, state, existingParent ?? parent)
		return
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
	state.reusableBookmarksByLine.set(line, bookmark)
	// 构建阶段不修改已有树，撤销快照必须先于真正的插入。
	if (parent && !state.existingBookmarks.has(parent)) parent.subs.add(bookmark)
	else state.roots.push(bookmark)

	for (const child of aiBookmark.subs) {
		processAIBookmark(child, pathRel, state, bookmark)
	}

	bookmark.refreshDisplayProps()
	if (bookmark.subs.size > 0) bookmark.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
	state.created++
}

/** 追加优先使用构建时匹配到的原父节点；没有匹配时沿用普通新增的文件和固定容器规则。 */
export function insertGeneratedAIBookmark(bookmark: Bookmark, bookmarks: BookmarkSet): void {
	const parent = bookmark.parent ? bookmarks.findBookmark(bookmark.parent) : undefined
	if (parent && !parent.isFile && !parent.isCodeMarker && !parent.isBookmarkInvalid) {
		bookmark.parent = parent
		bookmark.ownerScriptId = parent.ownerScriptId
		parent.subs.add(bookmark)
		parent.refreshDisplayProps()
		return
	}
	bookmarks.addNewBookmark(bookmark)
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
		reusableBookmarksByLine: new Map(occupiedBookmarks
			.filter(bookmark => !bookmark.isFile && !bookmark.isCodeMarker && !bookmark.isBookmarkInvalid)
			.map(bookmark => [bookmark.start.line, bookmark])),
		existingBookmarks: new Set(occupiedBookmarks),
		roots: [],
		assignIcons,
		created: 0,
		skipped: 0,
	}
	for (const aiBookmark of aiBookmarks) processAIBookmark(aiBookmark, pathRel, state)
	return { roots: state.roots, created: state.created, skipped: state.skipped }
}
