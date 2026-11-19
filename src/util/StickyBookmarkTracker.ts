/**
 * 根据已知编辑范围跟踪源码，或在重新打开文档时用内容证据恢复书签。
 * 删除后保留旧指纹；只有证据充分的匹配才能重新激活书签。
 */
import type { TextDocument, TextDocumentContentChangeEvent } from 'vscode'
import type { Bookmark } from '../models/Bookmark'
import { ContextBookmark } from './ContextValue'
import { getFingerprintContext } from './FingerprintMatcher'
import { textDocumentLines } from './VscodeDocument'

interface Point {
	line: number
	column: number
}

interface Span {
	start: number
	end: number
}

interface Edit extends Span {
	inserted: Span
	text: string
	sameLine: boolean
}

function samePoint(left: Point, right: Point): boolean {
	return left.line === right.line && left.column === right.column
}

function fingerprintText(content: string): string {
	return content.trim().replace(/\r\n/g, '\n')
}

function meaningful(text: string | undefined): boolean {
	return (text?.match(/[\p{L}\p{N}_]/gu)?.length ?? 0) >= 4
}

function distinctive(text: string): boolean {
	return (text.match(/[\p{L}\p{N}_]/gu)?.length ?? 0) >= 12
}

class Snapshot {
	readonly version: number
	readonly lines: string[]
	readonly text: string
	readonly reconciled = new WeakSet<Bookmark>()
	private readonly eol: string
	private readonly lineStarts: number[] = []
	private readonly matches = new Map<string, Span[]>()

	constructor(document: TextDocument) {
		this.version = document.version
		this.lines = textDocumentLines(document)
		this.text = document.getText()
		this.eol = this.text.includes('\r\n') ? '\r\n' : '\n'
		let offset = 0
		for (const line of this.lines) {
			this.lineStarts.push(offset)
			offset += line.length + this.eol.length
		}
	}

	offset(point: Point): number | undefined {
		const line = this.lines[point.line]
		if (line === undefined || point.column < 0 || point.column > line.length) return undefined
		return this.lineStarts[point.line] + point.column
	}

	lineSpan(line: number): Span {
		const text = this.lines[line]
		const offset = this.lineStarts[line]
		const start = offset + text.length - text.trimStart().length
		return { start, end: start + text.trim().length }
	}

	point(offset: number): Point {
		let low = 0
		let high = this.lineStarts.length
		while (low + 1 < high) {
			const middle = (low + high) >>> 1
			if (this.lineStarts[middle] <= offset) low = middle
			else high = middle
		}
		return { line: low, column: Math.min(offset - this.lineStarts[low], this.lines[low].length) }
	}

	context(span: Span) {
		const start = this.point(span.start).line
		const end = this.point(Math.max(span.start, span.end - 1)).line
		return getFingerprintContext(this.lines, start, this.text.slice(span.start, span.end), end)
	}

	candidates(content: string, wholeLine: boolean): Span[] {
		const key = `${wholeLine || content === ''}\0${content}`
		const cached = this.matches.get(key)
		if (cached) return cached
		const spans: Span[] = []
		if (wholeLine || content === '') {
			for (let line = 0; line < this.lines.length; line++) {
				if (this.lines[line].trim() === content) spans.push(this.lineSpan(line))
			}
		} else {
			const needle = content.replace(/\n/g, this.eol)
			for (let start = this.text.indexOf(needle); start >= 0; start = this.text.indexOf(needle, start + 1)) {
				const end = start + needle.length
				const word = /[\p{L}\p{N}_$]/u
				if (word.test(needle[0]) && word.test(this.text[start - 1] ?? '')) continue
				if (word.test(needle[needle.length - 1]) && word.test(this.text[end] ?? '')) continue
				spans.push({ start, end })
			}
		}
		this.matches.set(key, spans)
		return spans
	}
}

function bookmarkSpan(bookmark: Bookmark, snapshot: Snapshot): Span | undefined {
	const start = snapshot.offset(bookmark.start)
	const end = snapshot.offset(bookmark.end)
	if (start === undefined || end === undefined) return undefined
	if (start === end) return snapshot.lineSpan(bookmark.start.line)
	return { start, end }
}

function editsInOrder(changes: readonly TextDocumentContentChangeEvent[]): Edit[] {
	let shift = 0
	return [...changes].sort((left, right) => left.rangeOffset - right.rangeOffset).map(change => {
		const start = change.rangeOffset
		const end = start + change.rangeLength
		const inserted = { start: start + shift, end: start + shift + change.text.length }
		shift += change.text.length - change.rangeLength
		return {
			start, end, inserted, text: change.text,
			sameLine: change.range.start.line === change.range.end.line && !/[\r\n]/.test(change.text),
		}
	})
}

function mapOffset(offset: number, edits: readonly Edit[], right: boolean): number {
	let shift = 0
	for (const edit of edits) {
		if (offset < edit.start || (!right && offset === edit.start)) break
		if (offset < edit.end) return right ? edit.inserted.end : edit.inserted.start
		shift += edit.text.length - (edit.end - edit.start)
	}
	return offset + shift
}

function mapAnchor(span: Span, edits: readonly Edit[]): Span | undefined {
	for (const edit of edits) {
		if (edit.end <= span.start || edit.start >= span.end) {
			if (span.start !== span.end || edit.start > span.start || edit.end <= span.start) continue
		}
		if (edit.start === edit.end) continue
		const coversStart = edit.start <= span.start
		const coversSpan = coversStart && edit.end >= span.end
		if ((!edit.sameLine && coversStart) || (coversSpan && !edit.text.trim())) return undefined
	}
	const replacesStart = edits.some(edit => edit.start <= span.start && span.start < edit.end)
	const replacesEnd = edits.some(edit => edit.start < span.end && span.end <= edit.end)
	return {
		start: mapOffset(span.start, edits, !replacesStart),
		end: mapOffset(span.end, edits, replacesEnd || span.start === span.end),
	}
}

function selectCandidate(
	bookmark: Bookmark,
	snapshot: Snapshot,
	edits?: readonly Edit[],
): Span | undefined {
	const content = fingerprintText(bookmark.content ?? '')
	const wholeLine = samePoint(bookmark.start, bookmark.end)
	const hasContext = meaningful(bookmark.contextBefore) || meaningful(bookmark.contextAfter)
	const candidates = snapshot.candidates(content, wholeLine).filter(span => !edits?.length
		|| edits.some(edit => edit.inserted.start < edit.inserted.end
			&& span.start < edit.inserted.end
			&& (span.start === span.end ? span.start >= edit.inserted.start : span.end > edit.inserted.start)))
	let best: Span | undefined
	let bestScore = 0
	for (const span of candidates) {
		const context = snapshot.context(span)
		const before = meaningful(bookmark.contextBefore) && bookmark.contextBefore === context.before
		const after = meaningful(bookmark.contextAfter) && bookmark.contextAfter === context.after
		const contextScore = Number(before) + Number(after)
		const original = snapshot.offset(bookmark.start)
		const atOriginal = original !== undefined && (wholeLine
			? snapshot.point(span.start).line === bookmark.start.line
			: span.start === original)
		const strongText = distinctive(content) && (edits !== undefined || !hasContext || content.includes('\n'))
		const requiredContext = content === '' || (bookmark.isBookmarkInvalid && !edits) ? 2 : 1
		const verified = contextScore >= requiredContext
			|| (strongText && candidates.length === 1 && (!bookmark.isBookmarkInvalid || !!edits))
			|| (!bookmark.isBookmarkInvalid && atOriginal && candidates.length === 1 && !hasContext)
		if (!verified) continue
		const score = 1 + contextScore
		if (score > bestScore) {
			best = span
			bestScore = score
		} else if (score === bestScore) {
			best = undefined
		}
	}
	return best
}

export class StickyBookmarkTracker {
	private readonly snapshots = new WeakMap<TextDocument, Snapshot>()

	private snapshot(document: TextDocument): Snapshot {
		const cached = this.snapshots.get(document)
		if (cached?.version === document.version) return cached
		const snapshot = new Snapshot(document)
		this.snapshots.set(document, snapshot)
		return snapshot
	}

	updateContext(bookmark: Bookmark, document: TextDocument): boolean {
		const snapshot = this.snapshot(document)
		const span = bookmarkSpan(bookmark, snapshot)
		if (!span) return false
		const context = snapshot.context(span)
		const changed = bookmark.contextBefore !== context.before || bookmark.contextAfter !== context.after
		bookmark.contextBefore = context.before
		bookmark.contextAfter = context.after
		return changed
	}

	reconcile(bookmarks: readonly Bookmark[], document: TextDocument, changes?: readonly TextDocumentContentChangeEvent[]): number {
		const previous = this.snapshots.get(document)
		const current = this.snapshot(document)
		const edits = changes?.length ? editsInOrder(changes) : undefined
		let changed = 0
		for (const bookmark of bookmarks) {
			if (bookmark.isFile || bookmark.isCodeMarker || current.reconciled.has(bookmark)) continue
			if (this.relocate(bookmark, current, previous?.version === current.version - 1 ? previous : undefined, edits)) changed++
			current.reconciled.add(bookmark)
		}
		return changed
	}

	private relocate(bookmark: Bookmark, current: Snapshot, previous?: Snapshot, edits?: readonly Edit[]): boolean {
		const oldSpan = previous && bookmarkSpan(bookmark, previous)
		const tracked = edits && !bookmark.isBookmarkInvalid && oldSpan && (
			bookmark.content === undefined
			|| fingerprintText(previous.text.slice(oldSpan.start, oldSpan.end)) === fingerprintText(bookmark.content)
		)
		const span = tracked
			? mapAnchor(oldSpan, edits) ?? selectCandidate(bookmark, current, edits)
			: bookmark.content === undefined && !bookmark.isBookmarkInvalid
				? bookmarkSpan(bookmark, current)
				: selectCandidate(bookmark, current, bookmark.isBookmarkInvalid ? edits : undefined)
		if (!span || span.start > span.end || span.start < 0 || span.end > current.text.length
			|| (tracked && bookmark.content && !current.text.slice(span.start, span.end).trim())) {
			if (bookmark.isBookmarkInvalid) return false
			bookmark.contextValue = ContextBookmark.BookmarkInvalid
			return true
		}
		const wholeLine = samePoint(bookmark.start, bookmark.end)
		const point = current.point(span.start)
		const column = tracked && previous ? previous.offset(bookmark.start) : undefined
		const mappedPoint = column !== undefined && edits ? current.point(mapOffset(column, edits, true)) : undefined
		const start = wholeLine && mappedPoint?.line === point.line && bookmark.start.column !== 0
			? mappedPoint
			: wholeLine ? { line: point.line, column: Math.min(bookmark.start.column, current.lines[point.line].length) } : point
		const end = wholeLine ? start : current.point(span.end)
		const anchor = wholeLine ? current.lineSpan(start.line) : span
		const content = current.text.slice(anchor.start, anchor.end).trim()
		const context = current.context(anchor)
		const changed = bookmark.isBookmarkInvalid || !samePoint(bookmark.start, start) || !samePoint(bookmark.end, end)
			|| bookmark.content !== content || bookmark.contextBefore !== context.before || bookmark.contextAfter !== context.after
		Object.assign(bookmark.start, start)
		Object.assign(bookmark.end, end)
		bookmark.content = content
		bookmark.contextBefore = context.before
		bookmark.contextAfter = context.after
		if (bookmark.isBookmarkInvalid) {
			bookmark.contextValue = bookmark.isPinned ? ContextBookmark.BookmarkPinned : ContextBookmark.Bookmark
		}
		return changed
	}
}
