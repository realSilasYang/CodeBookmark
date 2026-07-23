/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `AIBookmarkBuilder`。
 *
 * 实现要点：把领域输入组装为满足持久化或协议约束的结果，并保留必要身份信息。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`buildAIBookmarks`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
	// 覆盖操作只替换用户书签；自动代码标记继续由扫描器管理，并保留其源代码行占位。
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
