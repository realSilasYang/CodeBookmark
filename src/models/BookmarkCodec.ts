/**
 * 把未知 JSON 解析为受限的书签树，逐项校验位置、层级、图标、状态和节点总数。
 * 解析器只接受当前领域契约，遇到越界或畸形输入时拒绝整棵树，不留下半有效对象。
 */
import { normalizeBookmarkIconName } from '../util/BookmarkIconName'
import { parseCodeMarkerMetadata, type CodeMarkerMetadata } from '../util/CodeMarkerScanner'
import { isJsonRecord } from '../util/JsonRecord'
import { localize } from '../i18n/Localization'

type PersistedCollapsibleState = 0 | 1 | 2

export interface BookmarkJSON {
	id: string
	createdAt: number
	label: string
	path: string
	collapsibleState: PersistedCollapsibleState
	pinned: boolean
	content?: string
	contextBefore?: string
	contextAfter?: string
	iconName: string
	isInvalid: boolean
	subs: BookmarkJSON[]
	params: string
	codeMarker?: CodeMarkerMetadata
}

export interface BookmarkParseState {
	count: number
}

export interface ParsedBookmark {
	id: string
	createdAt: number
	label: string
	path: string
	collapsibleState: PersistedCollapsibleState
	pinned: boolean
	content?: string
	contextBefore?: string
	contextAfter?: string
	iconName: string
	isInvalid: boolean
	subs: ParsedBookmark[]
	startLine: number
	startColumn: number
	endLine: number
	endColumn: number
	codeMarker?: CodeMarkerMetadata
}

const MAX_BOOKMARK_DEPTH = 64
export const MAX_BOOKMARK_NODES = 10_000

function collapsibleState(value: unknown): PersistedCollapsibleState {
	if (value === 1 || value === 2) return value
	return 0
}

export function parseBookmarkJSON(
	data: unknown,
	depth = 0,
	state: BookmarkParseState = { count: 0 },
): ParsedBookmark {
	if (!isJsonRecord(data)) throw new Error(localize("models.BookmarkCodec.invalidBookmarkData"))
	if (depth > MAX_BOOKMARK_DEPTH) throw new Error(localize("models.BookmarkCodec.bookmarkNestingExceedsLevels", { MAX_BOOKMARK_DEPTH }))
	if (typeof data.id !== 'string' || data.id.length === 0) throw new Error(localize("models.BookmarkCodec.bookmarkIdIsRequired"))
	if (typeof data.createdAt !== 'number' || !Number.isFinite(data.createdAt) || data.createdAt <= 0) {
		throw new Error(localize("models.BookmarkCodec.bookmarkCreationTimeIsInvalid"))
	}
	if (typeof data.label !== 'string') throw new Error(localize("models.BookmarkCodec.bookmarkLabelIsRequired"))
	if (typeof data.path !== 'string') throw new Error(localize("models.BookmarkCodec.bookmarkPathIsRequired"))
	if (typeof data.iconName !== 'string') throw new Error(localize("models.BookmarkCodec.bookmarkIconIsRequired"))
	if (typeof data.pinned !== 'boolean') throw new Error(localize("models.BookmarkCodec.bookmarkPinStateIsRequired"))
	if (typeof data.isInvalid !== 'boolean') throw new Error(localize("models.BookmarkCodec.bookmarkValidityStateIsRequired"))
	if (data.content !== undefined && typeof data.content !== 'string') throw new Error(localize("models.BookmarkCodec.bookmarkContentIsInvalid"))
	if (data.contextBefore !== undefined && typeof data.contextBefore !== 'string') throw new Error(localize("models.BookmarkCodec.bookmarkLeadingContextIsInvalid"))
	if (data.contextAfter !== undefined && typeof data.contextAfter !== 'string') throw new Error(localize("models.BookmarkCodec.bookmarkTrailingContextIsInvalid"))
	if (!Array.isArray(data.subs)) throw new Error(localize("models.BookmarkCodec.bookmarkChildrenAreRequired"))
	if (data.collapsibleState !== 0 && data.collapsibleState !== 1 && data.collapsibleState !== 2) {
		throw new Error(localize("models.BookmarkCodec.bookmarkCollapsibleStateIsInvalid"))
	}
	state.count++
	if (state.count > MAX_BOOKMARK_NODES) throw new Error(localize("models.BookmarkCodec.bookmarkDataExceedsNodes", { MAX_BOOKMARK_NODES }))
	const subs = data.subs.map(item => parseBookmarkJSON(item, depth + 1, state))

	if (typeof data.params !== 'string') throw new Error(localize("models.BookmarkCodec.bookmarkPositionIsRequired"))
	const rawParams = data.params.split(',')
	if (rawParams.length !== 4 || rawParams.some(value => !Number.isInteger(Number(value)) || Number(value) < 0)) {
		throw new Error(localize("models.BookmarkCodec.bookmarkPositionIsInvalid"))
	}
	const startLine = Number(rawParams[0])
	const startColumn = Number(rawParams[1])
	const endLine = Number(rawParams[2])
	const endColumn = Number(rawParams[3])
	if (endLine < startLine || (endLine === startLine && endColumn < startColumn)) {
		throw new Error(localize("models.BookmarkCodec.bookmarkPositionRangeIsInvalid"))
	}

	const iconName = normalizeBookmarkIconName(data.iconName)
	const codeMarker = data.codeMarker === undefined ? undefined : parseCodeMarkerMetadata(data.codeMarker)
	if (data.codeMarker !== undefined && !codeMarker) throw new Error(localize("models.BookmarkCodec.bookmarkCodeMarkerMetadataIsInvalid"))

	return {
		id: data.id,
		createdAt: data.createdAt,
		label: data.label,
		path: data.path,
		collapsibleState: collapsibleState(data.collapsibleState),
		pinned: data.pinned,
		content: typeof data.content === 'string' ? data.content : undefined,
		contextBefore: typeof data.contextBefore === 'string' ? data.contextBefore : undefined,
		contextAfter: typeof data.contextAfter === 'string' ? data.contextAfter : undefined,
		iconName,
		isInvalid: data.isInvalid,
		subs,
		startLine,
		startColumn,
		endLine,
		endColumn,
		codeMarker,
	}
}
