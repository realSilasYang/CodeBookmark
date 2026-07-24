/**
 * 为真实 Extension Host 测试构建只读快照，并通过正式拖放入口执行节点移动。
 * 测试桥接不直接修改书签树，避免测试路径绕过用户实际使用的校验、撤销和持久化逻辑。
 */
import * as vscode from 'vscode'
import { Bookmark, bookmarkLabelText } from '../models/Bookmark'
import type { BookmarkSet } from '../models/BookmarkSet'
import { BOOKMARK_TREE_MIME_TYPE } from '../providers/BookmarkTreeInteractionRunner'
import type { IntegrationBookmarkSnapshot, IntegrationBookmarkSnapshotNode } from './IntegrationTestTypes'

function snapshotNode(bookmark: Bookmark): IntegrationBookmarkSnapshotNode {
	return {
		id: bookmark.id,
		label: bookmarkLabelText(bookmark.label),
		path: bookmark.path,
		isFile: bookmark.isFile,
		scriptId: bookmark.scriptId,
		ownerScriptId: bookmark.ownerScriptId,
		parentId: bookmark.parent?.id,
		treeDepth: bookmark.treeDepth,
		line: bookmark.start.line,
		children: bookmark.subs.values.map(snapshotNode),
	}
}

export function createIntegrationTestSnapshot(
	bookmarks: BookmarkSet,
	ready: boolean,
	storageScope?: string,
): IntegrationBookmarkSnapshot {
	return { ready, storageScope, roots: bookmarks.values.map(snapshotNode) }
}

interface IntegrationMovePort {
	findNode(id: string): Bookmark | undefined
	drop(target: Bookmark, transfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void>
}

export async function moveNodeForIntegrationTest(
	sourceId: string,
	targetId: string,
	port: IntegrationMovePort,
): Promise<void> {
	const source = port.findNode(sourceId)
	const target = port.findNode(targetId)
	if (!source || !target) throw new Error(`Integration test node is missing: ${sourceId} -> ${targetId}`)
	const transfer = new vscode.DataTransfer()
	transfer.set(BOOKMARK_TREE_MIME_TYPE, new vscode.DataTransferItem([source]))
	const cancellation = new vscode.CancellationTokenSource()
	try {
		await port.drop(target, transfer, cancellation.token)
	} finally {
		cancellation.dispose()
	}
}
