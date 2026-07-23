import * as path from 'path'
import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import { Bookmark } from '../models/Bookmark'
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
	fileNode.label = path.basename(fileNode.path)
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
	if (!items || items.length === 0 || !metadata) return undefined
	if (!serializedPathsMatchScript(items, metadata.path)) {
		if (strict) throw new Error(localize(
			'配置内书签路径与脚本绝对路径不一致',
			'The bookmark paths in the configuration do not match the script absolute path.',
		))
		return undefined
	}

	const fileNode = new Bookmark({
		id: `file_${metadata.id}`,
		path: metadata.path,
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
			logger.error(localize(`已跳过损坏的书签记录: ${error}`, `Skipped a damaged bookmark record: ${error}`))
			if (String(error).includes('nodes')) break
		}
	}
	if (bookmarks.length === 0) return undefined
	fileNode.createdAt = Math.min(...bookmarks.map(bookmark => bookmark.createdAt))
	for (const bookmark of bookmarks) bookmark.parent = fileNode
	fileNode.subs.addAll(bookmarks)
	updateBookmarkFileNodePath(fileNode, displayPath ?? metadata.path)
	return fileNode
}

export function absoluteBookmarkFileNodePath(fileNode: Bookmark, workspaceRoot?: string): string {
	if (path.isAbsolute(fileNode.path)) return normalizedAbsolutePath(fileNode.path)
	if (!workspaceRoot) throw new Error(localize(
		`无法将书签相对路径解析为绝对路径: ${fileNode.path}`,
		`Unable to resolve the bookmark relative path to an absolute path: ${fileNode.path}`,
	))
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
