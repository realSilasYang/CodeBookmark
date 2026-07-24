/**
 * 在文件容器 Bookmark 与持久化脚本信封之间转换，统一处理绝对路径和脚本身份。
 * 容器节点不参与普通书签内容指纹，更新路径时会同步其展示路径但保留稳定 scriptId。
 */
import * as path from 'path'
import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import { Bookmark } from '../models/Bookmark'
import { assignFileNodeOwnership, type OwnedBookmarkProjection } from '../models/BookmarkOwnership'
import { setSerializedBookmarkPaths } from '../models/SerializedBookmarkTree'
import { absolutePathKey, normalizedAbsolutePath } from '../util/AbsolutePath'
import { canonicalBookmarkPath } from '../util/BookmarkPath'
import { ContextBookmark } from '../util/ContextValue'
import { isJsonRecord } from '../util/JsonRecord'
import { logger } from '../util/Logger'
import { createScriptId, fingerprintSourceFile } from '../util/ScriptIdentity'
import type { ScriptMetadata } from './ScriptIndex'
import {
	bookmarkItems,
	createScriptEnvelope,
	scriptMetadata,
	type BookmarkFileEnvelope,
} from './ScriptEnvelopeCodec'

function serializedPathsMatchScript(values: unknown[], scriptPath: string): boolean {
	for (const value of values) {
		if (!isJsonRecord(value) || typeof value.path !== 'string'
			|| absolutePathKey(value.path) !== absolutePathKey(scriptPath)) return false
		if (!Array.isArray(value.subs) || !serializedPathsMatchScript(value.subs, scriptPath)) return false
	}
	return true
}

export function updateBookmarkFileNodePath(fileNode: Bookmark, nextPath: string): void {
	fileNode.path = canonicalBookmarkPath(nextPath)
	if (!fileNode.fileLabelCustomized) fileNode.label = path.basename(fileNode.path)
	const update = (bookmarks: Bookmark[]): void => {
		for (const bookmark of bookmarks) {
			bookmark.path = fileNode.path
			if (bookmark.subs.size > 0) update(bookmark.subs.values)
		}
	}
	update(fileNode.subs.values)
}

export function createBookmarkFileNode(
	data: unknown,
	displayPath?: string,
	strict = false,
): Bookmark | undefined {
	const items = bookmarkItems(data)
	const metadata = scriptMetadata(data)
	if (!items || !metadata) return undefined
	if (!serializedPathsMatchScript(items, metadata.path)) {
		if (strict) throw new Error(localize("repository.BookmarkFileNodeCodec.theBookmarkPathsInTheConfigurationDoNotMatch"))
		return undefined
	}

	const fileNode = new Bookmark({
		id: `file_${metadata.id}`,
		path: metadata.path,
		label: metadata.presentation?.label,
		icon: metadata.presentation?.icon,
		fileLabelCustomized: metadata.presentation?.label !== undefined,
		scriptId: metadata.id,
		contextValue: ContextBookmark.File,
		collapsible: vscode.TreeItemCollapsibleState.Expanded,
	})
	const bookmarks: Bookmark[] = []
	const parseState = { count: 0 }
	for (const item of items) {
		try {
			bookmarks.push(Bookmark.fromJSON(item, 0, parseState))
		} catch (error) {
			if (strict) throw error
			logger.error(localize("repository.BookmarkFileNodeCodec.skippedADamagedBookmarkRecord", { error }))
			if (String(error).includes('nodes')) break
		}
	}
	if (bookmarks.length > 0) fileNode.createdAt = Math.min(...bookmarks.map(bookmark => bookmark.createdAt))
	for (const bookmark of bookmarks) bookmark.parent = fileNode
	fileNode.subs.addAll(bookmarks)
	assignFileNodeOwnership(fileNode)
	updateBookmarkFileNodePath(fileNode, displayPath ?? metadata.path)
	return fileNode
}

export function absoluteBookmarkFileNodePath(fileNode: Bookmark, workspaceRoot?: string): string {
	if (path.isAbsolute(fileNode.path)) return normalizedAbsolutePath(fileNode.path)
	if (!workspaceRoot) throw new Error(localize("repository.BookmarkFileNodeCodec.unableToResolveTheBookmarkRelativePathToAn", { path: fileNode.path }))
	return normalizedAbsolutePath(path.resolve(workspaceRoot, fileNode.path))
}

export async function createBookmarkFileEnvelope(
	fileNode: Bookmark,
	absolutePathInput: string,
	previousMetadata?: ScriptMetadata,
): Promise<BookmarkFileEnvelope> {
	if (!fileNode.scriptId) fileNode.scriptId = createScriptId()
	const absolutePath = normalizedAbsolutePath(absolutePathInput)
	const bookmarks = fileNode.subs.values.map(bookmark => bookmark.toJSON())
	setSerializedBookmarkPaths(bookmarks, absolutePath)
	const fingerprint = await fingerprintSourceFile(absolutePath)
	return createScriptEnvelope({
		id: fileNode.scriptId,
		path: absolutePath,
		fingerprint: fingerprint ?? previousMetadata?.fingerprint,
		lastSeenAt: Date.now(),
		missingSince: fingerprint ? undefined : previousMetadata?.missingSince ?? Date.now(),
		orderIndex: fingerprint ? undefined : previousMetadata?.orderIndex,
	}, bookmarks)
}

export async function createBookmarkFileEnvelopeFromProjection(
	projection: OwnedBookmarkProjection,
	absolutePathInput: string,
	previousMetadata?: ScriptMetadata,
): Promise<BookmarkFileEnvelope> {
	const absolutePath = normalizedAbsolutePath(absolutePathInput)
	const bookmarks = structuredClone(projection.bookmarks)
	setSerializedBookmarkPaths(bookmarks, absolutePath)
	const fingerprint = await fingerprintSourceFile(absolutePath)
	const label = projection.fileNode?.fileLabelCustomized ? `${projection.fileNode.label}` : undefined
	const icon = projection.fileNode?.icon || undefined
	return createScriptEnvelope({
		id: projection.scriptId,
		path: absolutePath,
		fingerprint: fingerprint ?? previousMetadata?.fingerprint,
		lastSeenAt: Date.now(),
		missingSince: fingerprint ? undefined : previousMetadata?.missingSince ?? Date.now(),
		orderIndex: fingerprint ? undefined : previousMetadata?.orderIndex,
		presentation: projection.fileNode
			? label || icon ? { label, icon } : undefined
			: previousMetadata?.presentation,
	}, bookmarks)
}
