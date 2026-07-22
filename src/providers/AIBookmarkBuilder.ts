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
	// Overwrite replaces user bookmarks only. Automatic code markers remain
	// managed by the scanner and continue occupying their source lines.
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
