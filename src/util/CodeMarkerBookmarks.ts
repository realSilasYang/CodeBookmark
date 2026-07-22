import * as path from 'path'
import * as vscode from 'vscode'
import { Bookmark, bookmarkLabelText, CursorIndex, MAX_BOOKMARK_NODES } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'
import { ContextBookmark } from './ContextValue'
import { getFingerprintContext } from './FingerprintMatcher'
import { Helper } from './Helper'
import { bookmarkPathKey, canonicalBookmarkPath } from './BookmarkPath'
import { createScriptId } from './ScriptIdentity'
import {
	CODE_MARKER_ICON,
	type CodeMarkerMetadata,
	type CodeMarkerOccurrence,
} from './CodeMarkerScanner'

export interface CodeMarkerSyncResult {
	changed: boolean
	created: number
	removed: number
	fileNode?: Bookmark
	capacityLimited?: boolean
}

function markerScore(bookmark: Bookmark, occurrence: CodeMarkerOccurrence): number {
	if (bookmark.codeMarker?.marker !== occurrence.marker) return Number.NEGATIVE_INFINITY
	let score = -Math.abs(bookmark.start.line - occurrence.line)
	if (bookmark.content === occurrence.lineText.trim()) score += 100_000
	if (bookmark.start.line === occurrence.line) score += 50_000
	if (bookmark.start.line === occurrence.line && bookmark.start.column === occurrence.column) score += 50_000
	return score
}

interface MarkerCandidateQueue {
	items: Bookmark[]
	cursor: number
}

function markerCandidateKey(...parts: Array<string | number>): string {
	return JSON.stringify(parts)
}

function markerCandidateQueues(bookmarks: readonly Bookmark[]): Map<string, MarkerCandidateQueue> {
	const values = new Map<string, Bookmark[]>()
	const add = (key: string, bookmark: Bookmark): void => {
		const items = values.get(key) ?? []
		items.push(bookmark)
		values.set(key, items)
	}
	for (const bookmark of bookmarks) {
		const marker = bookmark.codeMarker?.marker
		if (!marker) continue
		add(markerCandidateKey('marker', marker), bookmark)
		add(markerCandidateKey('line', marker, bookmark.start.line), bookmark)
		add(markerCandidateKey('position', marker, bookmark.start.line, bookmark.start.column), bookmark)
		add(markerCandidateKey('content', marker, bookmark.content ?? ''), bookmark)
	}
	const queues = new Map<string, MarkerCandidateQueue>()
	for (const [key, items] of values) {
		items.sort((left, right) => left.start.line - right.start.line
			|| left.start.column - right.start.column
			|| left.createdAt - right.createdAt)
		queues.set(key, { items, cursor: 0 })
	}
	return queues
}

function firstUnusedCandidate(queue: MarkerCandidateQueue | undefined, unused: ReadonlySet<Bookmark>): Bookmark | undefined {
	if (!queue) return undefined
	while (queue.cursor < queue.items.length && !unused.has(queue.items[queue.cursor])) queue.cursor++
	return queue.items[queue.cursor]
}

function selectMarkerCandidate(
	occurrence: CodeMarkerOccurrence,
	queues: Map<string, MarkerCandidateQueue>,
	unused: ReadonlySet<Bookmark>,
): Bookmark | undefined {
	const marker = occurrence.marker
	const candidates = new Set<Bookmark>()
	for (const key of [
		markerCandidateKey('position', marker, occurrence.line, occurrence.column),
		markerCandidateKey('content', marker, occurrence.lineText.trim()),
		markerCandidateKey('line', marker, occurrence.line),
		markerCandidateKey('marker', marker),
	]) {
		const candidate = firstUnusedCandidate(queues.get(key), unused)
		if (candidate) candidates.add(candidate)
	}
	let selected: Bookmark | undefined
	let bestScore = Number.NEGATIVE_INFINITY
	for (const candidate of candidates) {
		const score = markerScore(candidate, occurrence)
		if (score > bestScore) {
			bestScore = score
			selected = candidate
		}
	}
	return selected
}

function extractCodeMarkers(fileNode: Bookmark): { bookmarks: Bookmark[], structureChanged: boolean } {
	const result: Bookmark[] = []
	let structureChanged = false
	let topPrefix = true
	const originalTopIds: string[] = []
	for (const child of fileNode.subs.values) {
		if (topPrefix && child.isCodeMarker) originalTopIds.push(child.id)
		else topPrefix = false
	}

	const visit = (container: BookmarkSet, parent: Bookmark): void => {
		for (let index = 0; index < container.values.length;) {
			const bookmark = container.values[index]
			if (!bookmark.isCodeMarker) {
				visit(bookmark.subs, bookmark)
				index++
				continue
			}
			if (parent !== fileNode || bookmark.subs.size > 0) structureChanged = true
			container.delete(index)
			const promoted = [...bookmark.subs.values]
			bookmark.subs.clear()
			for (let offset = 0; offset < promoted.length; offset++) {
				promoted[offset].parent = parent
				container.insert(index + offset, promoted[offset])
			}
			bookmark.parent = undefined
			result.push(bookmark)
			// Inspect promoted children at the same index so nested automatic markers are extracted too.
		}
	}
	visit(fileNode.subs, fileNode)
	if (originalTopIds.length !== result.length || originalTopIds.some((id, index) => result[index]?.id !== id)) {
		structureChanged = true
	}
	return { bookmarks: result, structureChanged }
}

function formattedLabel(value: string): string {
	return Helper.formatLabelSpacing(value.trim().replace(/\s+/g, ' ').slice(0, 1000))
}

function markerMetadata(occurrence: CodeMarkerOccurrence, iconCustomized = false): CodeMarkerMetadata {
	return {
		type: 'code-marker',
		marker: occurrence.marker,
		generatedLabel: formattedLabel(occurrence.label),
		iconCustomized,
	}
}

function applyOccurrence(bookmark: Bookmark, occurrence: CodeMarkerOccurrence, lines: readonly string[], pathRel: string): boolean {
	let changed = false
	const iconCustomized = bookmark.codeMarker?.iconCustomized === true
	const nextMetadata = markerMetadata(occurrence, iconCustomized)
	const previousGeneratedLabel = bookmark.codeMarker?.generatedLabel
	const currentLabel = bookmarkLabelText(bookmark.label)
	if (currentLabel === previousGeneratedLabel) {
		if (currentLabel !== nextMetadata.generatedLabel) {
			bookmark.label = nextMetadata.generatedLabel
			changed = true
		}
	}
	const nextContent = occurrence.lineText.trim()
	const context = getFingerprintContext(lines, occurrence.line, nextContent)
	if (bookmark.path !== pathRel) { bookmark.path = pathRel; changed = true }
	if (bookmark.content !== nextContent) { bookmark.content = nextContent; changed = true }
	if (bookmark.start.line !== occurrence.line || bookmark.start.column !== occurrence.column) changed = true
	if (bookmark.end.line !== occurrence.line || bookmark.end.column !== occurrence.column) changed = true
	bookmark.start = new CursorIndex(occurrence.line, occurrence.column)
	bookmark.end = new CursorIndex(occurrence.line, occurrence.column)
	if (bookmark.contextBefore !== context.before) { bookmark.contextBefore = context.before; changed = true }
	if (bookmark.contextAfter !== context.after) { bookmark.contextAfter = context.after; changed = true }
	if (!iconCustomized && bookmark.icon !== CODE_MARKER_ICON) {
		bookmark.icon = CODE_MARKER_ICON
		changed = true
	}
	if (bookmark.codeMarker?.marker !== nextMetadata.marker
		|| bookmark.codeMarker.generatedLabel !== nextMetadata.generatedLabel
		|| bookmark.codeMarker.iconCustomized !== nextMetadata.iconCustomized) changed = true
	bookmark.codeMarker = nextMetadata
	bookmark.refreshDisplayProps()
	return changed
}

function createMarkerBookmark(occurrence: CodeMarkerOccurrence, lines: readonly string[], pathRel: string): Bookmark {
	const bookmark = new Bookmark({
		path: pathRel,
		label: occurrence.label,
		content: occurrence.lineText,
		icon: CODE_MARKER_ICON,
		start: new CursorIndex(occurrence.line, occurrence.column),
		end: new CursorIndex(occurrence.line, occurrence.column),
	})
	bookmark.codeMarker = markerMetadata(occurrence)
	const context = getFingerprintContext(lines, occurrence.line, bookmark.content ?? '')
	bookmark.contextBefore = context.before
	bookmark.contextAfter = context.after
	bookmark.refreshDisplayProps()
	return bookmark
}

export function synchronizeCodeMarkerBookmarks(
	root: BookmarkSet,
	pathValue: string,
	lines: readonly string[],
	occurrences: readonly CodeMarkerOccurrence[],
): CodeMarkerSyncResult {
	const pathRel = canonicalBookmarkPath(pathValue)
	let fileNode = root.values.find(bookmark => bookmark.isFile && bookmarkPathKey(bookmark.path) === bookmarkPathKey(pathRel))
	if (!fileNode && occurrences.length === 0) return { changed: false, created: 0, removed: 0 }

	let changed = false
	let created = 0
	if (!fileNode) {
		const scriptId = createScriptId()
		fileNode = new Bookmark({
			id: `file_${scriptId}`,
			path: pathRel,
			label: path.basename(pathRel),
			scriptId,
			contextValue: ContextBookmark.File,
			collapsible: vscode.TreeItemCollapsibleState.Expanded,
		})
		root.add(fileNode)
		changed = true
	}

	const extracted = extractCodeMarkers(fileNode)
	if (extracted.structureChanged) changed = true
	const countNodes = (bookmarks: readonly Bookmark[]): number => bookmarks.reduce(
		(total, bookmark) => total + 1 + countNodes(bookmark.subs.values),
		0,
	)
	const availableMarkerSlots = Math.max(0, MAX_BOOKMARK_NODES - countNodes(fileNode.subs.values))
	const usableOccurrences = occurrences.slice(0, availableMarkerSlots)
	const capacityLimited = usableOccurrences.length < occurrences.length
	const unused = new Set(extracted.bookmarks)
	const candidateQueues = markerCandidateQueues(extracted.bookmarks)
	const active: Bookmark[] = []
	for (const occurrence of usableOccurrences) {
		let selected = selectMarkerCandidate(occurrence, candidateQueues, unused)
		if (!selected) {
			selected = createMarkerBookmark(occurrence, lines, pathRel)
			created++
			changed = true
		} else {
			unused.delete(selected)
			if (applyOccurrence(selected, occurrence, lines, pathRel)) changed = true
		}
		selected.parent = fileNode
		active.push(selected)
	}

	const manualTopLevel = [...fileNode.subs.values]
	const previousTopIds = extracted.bookmarks.filter(bookmark => !unused.has(bookmark)).map(bookmark => bookmark.id)
	if (previousTopIds.length !== active.length || previousTopIds.some((id, index) => active[index]?.id !== id)) changed = true
	fileNode.subs.values = [...active, ...manualTopLevel]
	fileNode.createdAt = fileNode.subs.size > 0
		? Math.min(...fileNode.subs.values.map(bookmark => bookmark.createdAt))
		: fileNode.createdAt
	fileNode.refreshDisplayProps()

	const removed = unused.size
	if (removed > 0) changed = true
	if (fileNode.subs.size === 0) {
		root.fastDelete(fileNode)
		fileNode = undefined
		changed = true
	}
	return { changed, created, removed, fileNode, capacityLimited }
}
