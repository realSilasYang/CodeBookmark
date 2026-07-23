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
	if (!isJsonRecord(data)) throw new Error(localize('书签数据无效', 'Invalid bookmark data'))
	if (depth > MAX_BOOKMARK_DEPTH) throw new Error(localize(`书签嵌套超过 ${MAX_BOOKMARK_DEPTH} 层`, `Bookmark nesting exceeds ${MAX_BOOKMARK_DEPTH} levels`))
	if (typeof data.id !== 'string' || data.id.length === 0) throw new Error(localize('书签 ID 不能为空', 'Bookmark ID is required'))
	if (typeof data.createdAt !== 'number' || !Number.isFinite(data.createdAt) || data.createdAt <= 0) {
		throw new Error(localize('书签创建时间无效', 'Bookmark creation time is invalid'))
	}
	if (typeof data.label !== 'string') throw new Error(localize('书签标签不能为空', 'Bookmark label is required'))
	if (typeof data.path !== 'string') throw new Error(localize('书签路径不能为空', 'Bookmark path is required'))
	if (typeof data.iconName !== 'string') throw new Error(localize('书签图标不能为空', 'Bookmark icon is required'))
	if (typeof data.pinned !== 'boolean') throw new Error(localize('书签固定状态无效', 'Bookmark pin state is required'))
	if (typeof data.isInvalid !== 'boolean') throw new Error(localize('书签有效性状态无效', 'Bookmark validity state is required'))
	if (data.content !== undefined && typeof data.content !== 'string') throw new Error(localize('书签代码内容无效', 'Bookmark content is invalid'))
	if (data.contextBefore !== undefined && typeof data.contextBefore !== 'string') throw new Error(localize('书签前文上下文无效', 'Bookmark leading context is invalid'))
	if (data.contextAfter !== undefined && typeof data.contextAfter !== 'string') throw new Error(localize('书签后文上下文无效', 'Bookmark trailing context is invalid'))
	if (!Array.isArray(data.subs)) throw new Error(localize('书签子项不能为空', 'Bookmark children are required'))
	if (data.collapsibleState !== 0 && data.collapsibleState !== 1 && data.collapsibleState !== 2) {
		throw new Error(localize('书签折叠状态无效', 'Bookmark collapsible state is invalid'))
	}
	state.count++
	if (state.count > MAX_BOOKMARK_NODES) throw new Error(localize(`书签数据超过 ${MAX_BOOKMARK_NODES} 个节点`, `Bookmark data exceeds ${MAX_BOOKMARK_NODES} nodes`))
	const subs = data.subs.map(item => parseBookmarkJSON(item, depth + 1, state))

	if (typeof data.params !== 'string') throw new Error(localize('书签位置不能为空', 'Bookmark position is required'))
	const rawParams = data.params.split(',')
	if (rawParams.length !== 4 || rawParams.some(value => !Number.isInteger(Number(value)) || Number(value) < 0)) {
		throw new Error(localize('书签位置无效', 'Bookmark position is invalid'))
	}
	const startLine = Number(rawParams[0])
	const startColumn = Number(rawParams[1])
	const endLine = Number(rawParams[2])
	const endColumn = Number(rawParams[3])
	if (endLine < startLine || (endLine === startLine && endColumn < startColumn)) {
		throw new Error(localize('书签位置范围无效', 'Bookmark position range is invalid'))
	}

	const iconName = normalizeBookmarkIconName(data.iconName)
	const codeMarker = data.codeMarker === undefined ? undefined : parseCodeMarkerMetadata(data.codeMarker)
	if (data.codeMarker !== undefined && !codeMarker) throw new Error(localize('书签代码标记元数据无效', 'Bookmark code marker metadata is invalid'))

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
