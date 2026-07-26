/**
 * 定义跨设备便携书签包的唯一公开格式，并把归档中的未知 JSON 收敛为严格领域对象。
 * 便携格式从不保存绝对路径或设备身份；任何缺失、重复、越界和未来版本数据都会整包拒绝。
 */
import { parseBookmarkJSON } from '../models/BookmarkCodec'
import { decodeWorkspaceLayoutPersistence, type WorkspaceLayout } from '../models/WorkspaceLayout'
import { isJsonRecord } from '../util/JsonRecord'
import { isScriptId } from '../util/ScriptIdentity'
import type { PortableSourceFingerprint } from './PortableSourceFingerprint'

export const PORTABLE_PACKAGE_FORMAT = 'codebookmark.portable-package' as const
export const PORTABLE_SCRIPT_FORMAT = 'codebookmark.portable-script' as const
export const PORTABLE_PACKAGE_SCHEMA_VERSION = 1 as const
export const PORTABLE_PACKAGE_EXTENSION = '.codebookmark'
export const MAX_PORTABLE_SCRIPTS = 20_000
export const MAX_PORTABLE_ARCHIVE_BYTES = 128 * 1024 * 1024
export const MAX_PORTABLE_UNCOMPRESSED_BYTES = 512 * 1024 * 1024

type PortableScopeKind = 'script' | 'workspace'

interface PortableRootDescriptor {
	id: string
	name: string
}

export interface PortableScriptIndexEntry {
	scriptId: string
	rootId: string
	relativePath: string
	entry: string
	sha256: string
}

export interface PortableManifest {
	format: typeof PORTABLE_PACKAGE_FORMAT
	schemaVersion: typeof PORTABLE_PACKAGE_SCHEMA_VERSION
	exchangeId: string
	revisionId: string
	parentRevisionIds: string[]
	createdAt: number
	title: string
	scope: PortableScopeKind
	roots: PortableRootDescriptor[]
	scripts: PortableScriptIndexEntry[]
	layout?: { entry: 'layout.json', sha256: string }
	base?: {
		revisionId: string
		scripts: Array<{ scriptId: string, entry: string, sha256: string }>
	}
}

export interface PortableScript {
	format: typeof PORTABLE_SCRIPT_FORMAT
	schemaVersion: typeof PORTABLE_PACKAGE_SCHEMA_VERSION
	scriptId: string
	presentation?: { label?: string, icon?: string }
	fingerprint?: PortableSourceFingerprint
	bookmarks: unknown[]
}

export interface PortablePackage {
	manifest: PortableManifest
	scripts: Map<string, PortableScript>
	baseScripts: Map<string, PortableScript>
	layout?: WorkspaceLayout
}

function requiredString(value: unknown, name: string, maximum = 1_000): string {
	if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
		throw new Error(`Portable package ${name} is invalid`)
	}
	return value
}

function currentHeader(value: unknown, format: string): asserts value is Record<string, unknown> {
	if (!isJsonRecord(value) || value.format !== format || value.schemaVersion !== PORTABLE_PACKAGE_SCHEMA_VERSION) {
		throw new Error(`Unsupported portable package format: expected ${format} v${PORTABLE_PACKAGE_SCHEMA_VERSION}`)
	}
}

function portableRelativePath(value: unknown): string {
	const relativePath = requiredString(value, 'relative path', 32_768).replace(/\\/g, '/')
	if (relativePath.startsWith('/') || /^[a-z]:/i.test(relativePath)
		|| relativePath.split('/').some(segment => !segment || segment === '.' || segment === '..' || segment.includes('\0'))) {
		throw new Error('Portable package relative path escapes its root')
	}
	return relativePath
}

function sha256(value: unknown): string {
	const result = requiredString(value, 'SHA-256', 64).toLowerCase()
	if (!/^[0-9a-f]{64}$/.test(result)) throw new Error('Portable package SHA-256 is invalid')
	return result
}

function archiveEntry(value: unknown, expected?: string): string {
	const result = requiredString(value, 'archive entry', 256)
	if (result.includes('\\') || result.startsWith('/') || result.split('/').some(segment => segment === '..')) {
		throw new Error('Portable package archive entry is unsafe')
	}
	if (expected !== undefined && result !== expected) throw new Error(`Portable package archive entry must be ${expected}`)
	return result
}

export function decodePortableManifest(value: unknown): PortableManifest {
	currentHeader(value, PORTABLE_PACKAGE_FORMAT)
	if (!isScriptId(value.exchangeId) || !isScriptId(value.revisionId)) throw new Error('Portable package identity is invalid')
	if (!Array.isArray(value.parentRevisionIds) || value.parentRevisionIds.length > 16
		|| value.parentRevisionIds.some(id => !isScriptId(id))) throw new Error('Portable package revision ancestry is invalid')
	if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt) || value.createdAt <= 0) {
		throw new Error('Portable package creation time is invalid')
	}
	if (value.scope !== 'script' && value.scope !== 'workspace') throw new Error('Portable package scope is invalid')
	if (!Array.isArray(value.roots) || value.roots.length === 0 || value.roots.length > 64) {
		throw new Error('Portable package roots are invalid')
	}
	const rootIds = new Set<string>()
	const roots = value.roots.map(raw => {
		if (!isJsonRecord(raw)) throw new Error('Portable package root is invalid')
		const id = requiredString(raw.id, 'root identity', 128)
		if (rootIds.has(id)) throw new Error('Portable package contains duplicate roots')
		rootIds.add(id)
		return { id, name: requiredString(raw.name, 'root name', 1_000) }
	})
	if (!Array.isArray(value.scripts) || value.scripts.length === 0 || value.scripts.length > MAX_PORTABLE_SCRIPTS) {
		throw new Error('Portable package script index is invalid')
	}
	const scriptIds = new Set<string>()
	const entries = new Set<string>()
	const scripts = value.scripts.map(raw => {
		if (!isJsonRecord(raw) || !isScriptId(raw.scriptId)) throw new Error('Portable package script identity is invalid')
		if (scriptIds.has(raw.scriptId)) throw new Error('Portable package contains duplicate scripts')
		scriptIds.add(raw.scriptId)
		const rootId = requiredString(raw.rootId, 'script root identity', 128)
		if (!rootIds.has(rootId)) throw new Error('Portable package script refers to a missing root')
		const entry = archiveEntry(raw.entry, `scripts/${raw.scriptId}.json`)
		if (entries.has(entry)) throw new Error('Portable package contains duplicate archive entries')
		entries.add(entry)
		return {
			scriptId: raw.scriptId,
			rootId,
			relativePath: portableRelativePath(raw.relativePath),
			entry,
			sha256: sha256(raw.sha256),
		}
	})
	let layout: PortableManifest['layout']
	if (value.layout !== undefined) {
		if (!isJsonRecord(value.layout)) throw new Error('Portable package layout index is invalid')
		layout = { entry: archiveEntry(value.layout.entry, 'layout.json') as 'layout.json', sha256: sha256(value.layout.sha256) }
	}
	let base: PortableManifest['base']
	if (value.base !== undefined) {
		if (!isJsonRecord(value.base) || !isScriptId(value.base.revisionId) || !Array.isArray(value.base.scripts)
			|| value.base.scripts.length > scripts.length) throw new Error('Portable package base revision is invalid')
		const baseIds = new Set<string>()
		const baseScripts = value.base.scripts.map(raw => {
			if (!isJsonRecord(raw) || !isScriptId(raw.scriptId) || !scriptIds.has(raw.scriptId) || baseIds.has(raw.scriptId)) {
				throw new Error('Portable package base script identity is invalid')
			}
			baseIds.add(raw.scriptId)
			return {
				scriptId: raw.scriptId,
				entry: archiveEntry(raw.entry, `base/scripts/${raw.scriptId}.json`),
				sha256: sha256(raw.sha256),
			}
		})
		base = { revisionId: value.base.revisionId, scripts: baseScripts }
		if (!value.parentRevisionIds.includes(base.revisionId)) {
			throw new Error('Portable package base revision is not part of its ancestry')
		}
	}
	return {
		format: PORTABLE_PACKAGE_FORMAT,
		schemaVersion: PORTABLE_PACKAGE_SCHEMA_VERSION,
		exchangeId: value.exchangeId,
		revisionId: value.revisionId,
		parentRevisionIds: [...new Set(value.parentRevisionIds as string[])],
		createdAt: value.createdAt,
		title: requiredString(value.title, 'title', 1_000),
		scope: value.scope,
		roots,
		scripts,
		layout,
		base,
	}
}

function validatePortableBookmark(value: unknown, ids: Set<string>): void {
	if (!isJsonRecord(value) || !isScriptId(value.id)) throw new Error('Portable bookmark identity is invalid')
	if (ids.has(value.id)) throw new Error('Portable package contains duplicate bookmark identities')
	ids.add(value.id)
	if (Object.hasOwn(value, 'path')) throw new Error('Portable bookmarks must not contain machine paths')
	if (Array.isArray(value.subs)) value.subs.forEach(child => validatePortableBookmark(child, ids))
	const clone = structuredClone(value)
	const addPath = (item: unknown): void => {
		if (!isJsonRecord(item)) return
		item.path = process.platform === 'win32' ? 'C:\\portable\\source.txt' : '/portable/source.txt'
		if (Array.isArray(item.subs)) item.subs.forEach(addPath)
	}
	addPath(clone)
	parseBookmarkJSON(clone)
}

export function decodePortableScript(value: unknown, expectedScriptId: string): PortableScript {
	currentHeader(value, PORTABLE_SCRIPT_FORMAT)
	if (value.scriptId !== expectedScriptId || !isScriptId(value.scriptId)) throw new Error('Portable script identity is invalid')
	if (!Array.isArray(value.bookmarks)) throw new Error('Portable script bookmarks are invalid')
	const ids = new Set<string>()
	for (const bookmark of value.bookmarks) validatePortableBookmark(bookmark, ids)
	let fingerprint: PortableScript['fingerprint']
	if (value.fingerprint !== undefined) {
		if (!isJsonRecord(value.fingerprint)) {
			throw new Error('Portable script fingerprint is invalid')
		}
		fingerprint = {
			sha256: sha256(value.fingerprint.sha256),
			normalizedSha256: value.fingerprint.normalizedSha256 === undefined
				? undefined : sha256(value.fingerprint.normalizedSha256),
		}
	}
	let presentation: PortableScript['presentation']
	if (value.presentation !== undefined) {
		if (!isJsonRecord(value.presentation)) throw new Error('Portable script presentation is invalid')
		if (value.presentation.label !== undefined && typeof value.presentation.label !== 'string') throw new Error('Portable script label is invalid')
		if (value.presentation.icon !== undefined && typeof value.presentation.icon !== 'string') throw new Error('Portable script icon is invalid')
		presentation = {
			label: value.presentation.label as string | undefined,
			icon: value.presentation.icon as string | undefined,
		}
	}
	return {
		format: PORTABLE_SCRIPT_FORMAT,
		schemaVersion: PORTABLE_PACKAGE_SCHEMA_VERSION,
		scriptId: value.scriptId,
		presentation,
		fingerprint,
		bookmarks: value.bookmarks.map(bookmark => structuredClone(bookmark)),
	}
}

export function decodePortableLayout(value: unknown): WorkspaceLayout {
	return decodeWorkspaceLayoutPersistence(value).layout
}

export function portableBookmarkItems(items: readonly unknown[]): unknown[] {
	const clones = items.map(item => structuredClone(item))
	const removePath = (value: unknown): void => {
		if (!isJsonRecord(value)) return
		delete value.path
		if (Array.isArray(value.subs)) value.subs.forEach(removePath)
	}
	clones.forEach(removePath)
	return clones
}
