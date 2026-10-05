/**
 * 为 AI 书签生成准备大源码的分段视图。
 * 分段只改变一次请求看到的文本范围，不改变源码的全局行号。
 * 相邻分段保留少量上下文，但每段都有唯一的负责行区间，便于合并结果时避免重复。
 */

import type { AIBookmark } from './AIBookmarkSchema'

const AI_GENERATION_CHUNK_TARGET_BYTES = 192 * 1024
const AI_GENERATION_CONTEXT_LINES = 80

interface AIGenerationChunk {
	/** 该段需要生成书签的全局 0 基起始行（含）。 */
	readonly startLine: number
	/** 该段需要生成书签的全局 0 基结束行（不含）。 */
	readonly endLine: number
	/** 发送给模型的上下文全局 0 基起始行（含）。 */
	readonly contextStartLine: number
	/** 发送给模型的上下文全局 0 基结束行（不含）。 */
	readonly contextEndLine: number
	/** 带全局 1 基行号前缀的源码片段。 */
	readonly numberedSource: string
}

function sourceLines(codeContent: string): string[] {
	return codeContent.split(/\r\n|\n|\r/)
}

function sourceLineBytes(line: string): number {
	// 分段输出统一使用 LF；额外的一个字节让边界估算不会低估换行开销。
	return Buffer.byteLength(line, 'utf8') + 1
}

function isNaturalBoundary(line: string): boolean {
	return line.trim() === ''
}

function chooseChunkEnd(lines: readonly string[], startLine: number, targetBytes: number): number {
	let endLine = startLine
	let bytes = 0
	let naturalBoundary: { endLine: number; bytes: number } | undefined
	const minimumNaturalBoundaryBytes = targetBytes * 0.65
	const preferredMaximumBytes = targetBytes * 1.15

	while (endLine < lines.length) {
		const nextBytes = sourceLineBytes(lines[endLine])
		if (endLine > startLine && bytes + nextBytes > preferredMaximumBytes) break
		bytes += nextBytes
		endLine++
		if (isNaturalBoundary(lines[endLine - 1]) && bytes >= minimumNaturalBoundaryBytes) {
			naturalBoundary = { endLine, bytes }
		}
		if (bytes >= targetBytes && naturalBoundary) break
		if (bytes >= preferredMaximumBytes && endLine < lines.length) break
	}

	if (naturalBoundary && naturalBoundary.bytes <= preferredMaximumBytes) return naturalBoundary.endLine
	return Math.max(endLine, startLine + 1)
}

function formatLineNumberedRange(lines: readonly string[], startLine: number, endLine: number): string {
	return lines
		.slice(startLine, endLine)
		.map((line, offset) => `${startLine + offset + 1} | ${line}`)
		.join('\n')
}

/**
 * 按源码字节数切分生成请求。短源码保持单请求行为；长源码的负责范围连续且互不重叠。
 */
export function splitAIGenerationChunks(
	codeContent: string,
	targetBytes = AI_GENERATION_CHUNK_TARGET_BYTES,
	contextLines = AI_GENERATION_CONTEXT_LINES,
): AIGenerationChunk[] {
	if (!Number.isSafeInteger(targetBytes) || targetBytes <= 0) {
		throw new Error('AI generation chunk target must be a positive safe integer')
	}
	if (!Number.isSafeInteger(contextLines) || contextLines < 0) {
		throw new Error('AI generation context lines must be a non-negative safe integer')
	}

	const lines = sourceLines(codeContent)
	const totalBytes = Buffer.byteLength(codeContent, 'utf8')
	if (totalBytes <= targetBytes || lines.length <= 1) {
		return [{
			startLine: 0,
			endLine: lines.length,
			contextStartLine: 0,
			contextEndLine: lines.length,
			numberedSource: formatLineNumberedRange(lines, 0, lines.length),
		}]
	}

	const chunks: AIGenerationChunk[] = []
	let startLine = 0
	while (startLine < lines.length) {
		const endLine = chooseChunkEnd(lines, startLine, targetBytes)
		const contextStartLine = Math.max(0, startLine - contextLines)
		const contextEndLine = Math.min(lines.length, endLine + contextLines)
		chunks.push({
			startLine,
			endLine,
			contextStartLine,
			contextEndLine,
			numberedSource: formatLineNumberedRange(lines, contextStartLine, contextEndLine),
		})
		startLine = endLine
	}
	return chunks
}

/**
 * 只保留某一段负责范围内的节点；上下文中的节点会被丢弃，子节点则提升到当前层级。
 * 这里不依赖模型是否准确填写 lineNumber，调用方会先用完整源码和 anchor 校正位置。
 */
export function filterAIBookmarksToRange(
	bookmarks: readonly AIBookmark[],
	resolveLine: (bookmark: AIBookmark) => number | undefined,
	startLine: number,
	endLine: number,
): AIBookmark[] {
	const filtered: AIBookmark[] = []
	for (const bookmark of bookmarks) {
		const children = filterAIBookmarksToRange(bookmark.subs, resolveLine, startLine, endLine)
		const line = resolveLine(bookmark)
		if (line === undefined || line < startLine || line >= endLine) {
			filtered.push(...children)
			continue
		}
		filtered.push({ ...bookmark, line, subs: children })
	}
	return filtered
}

