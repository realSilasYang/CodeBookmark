/**
 * 自动恢复脚本绑定时验证文件身份、完整摘要或成组的源码锚点。
 * 文件名与扩展名不参与绑定判断，多个同等可信的目标保持未绑定。
 */
import type { Bookmark } from '../models/Bookmark'
import { allBookmarks } from '../models/BookmarkOwnership'
import { fingerprintSourceFile, type SourceFingerprint } from '../util/ScriptIdentity'
import type { SourceCandidateIndex } from './SourceCandidateIndex'

const MAX_ANCHORS = 20
const MAX_SOURCE_BYTES = 16 * 1024 * 1024
const CONTEXT_WINDOW = 4

function sourceAnchors(fileNode: Bookmark): Bookmark[] {
	const seen = new Set<string>()
	const anchors: Bookmark[] = []
	for (const bookmark of allBookmarks(fileNode.subs)) {
		if (bookmark.isBookmarkInvalid || bookmark.isCodeMarker || !bookmark.content) continue
		const content = bookmark.content.trim()
		if (seen.has(content) || (content.match(/[\p{L}\p{N}_]/gu)?.length ?? 0) < 12) continue
		seen.add(content)
		anchors.push(bookmark)
		if (anchors.length === MAX_ANCHORS) break
	}
	return anchors
}

function anchorScore(content: string, anchors: readonly Bookmark[]): number {
	const lines = content.split(/\r?\n/).map(line => line.trim())
	const offsets = new Map<string, number[]>()
	const needed = new Set(anchors.map(anchor => anchor.content!.split(/\r?\n/, 1)[0].trim()))
	for (let line = 0; line < lines.length; line++) {
		const text = lines[line]
		if (!needed.has(text)) continue
		const matches = offsets.get(text) ?? []
		matches.push(line)
		offsets.set(text, matches)
	}
	let matches = 0
	let corroborated = 0
	for (const anchor of anchors) {
		const text = anchor.content!.split(/\r?\n/).map(line => line.trim())
		const found = (offsets.get(text[0]) ?? []).filter(start =>
			text.every((line, offset) => lines[start + offset] === line))
		if (found.length !== 1) continue
		matches++
		const start = found[0]
		const end = start + text.length
		const before = anchor.contextBefore?.trim()
		const after = anchor.contextAfter?.trim()
		if ((before && before.length >= 8 && lines.slice(Math.max(0, start - CONTEXT_WINDOW), start).includes(before))
			|| (after && after.length >= 8 && lines.slice(end, end + CONTEXT_WINDOW).includes(after))) corroborated++
	}
	return matches >= 2 || corroborated > 0 ? matches + corroborated : 0
}

export async function findRelocatedSource(
	fileNode: Bookmark,
	previous: SourceFingerprint | undefined,
	candidates: SourceCandidateIndex,
	checkCancelled: () => void,
): Promise<string | undefined> {
	checkCancelled()
	if (previous) {
		const sameIdentity = previous.device && previous.inode && previous.inode !== '0' && previous.birthtimeMs
			? (candidates.byFileSystemIdentity.get(`${previous.device}\0${previous.inode}`) ?? [])
				.filter(candidate => previous.birthtimeMs === candidate.stat.birthtimeMs)
			: []
		if (sameIdentity.length > 0) return sameIdentity.length === 1 ? sameIdentity[0].path : undefined

		const exactMatches: string[] = []
		for (const candidate of candidates.bySize.get(previous.size) ?? []) {
			checkCancelled()
			if (!candidates.fingerprints.has(candidate.path)) {
				candidates.fingerprints.set(candidate.path, await fingerprintSourceFile(candidate.path))
				checkCancelled()
			}
			if (candidates.fingerprints.get(candidate.path)?.sha256 === previous.sha256) exactMatches.push(candidate.path)
		}
		if (exactMatches.length > 0) return exactMatches.length === 1 ? exactMatches[0] : undefined
	}

	const anchors = sourceAnchors(fileNode)
	if (anchors.length === 0) return undefined
	let best: string | undefined
	let bestScore = 0
	for (const candidate of candidates.all) {
		checkCancelled()
		if (candidate.stat.size > MAX_SOURCE_BYTES) continue
		const content = await candidates.readContent(candidate.path)
		checkCancelled()
		if (content === undefined) continue
		const score = anchorScore(content, anchors)
		if (score > bestScore) {
			bestScore = score
			best = candidate.path
		} else if (score === bestScore) {
			best = undefined
		}
	}
	return best
}
