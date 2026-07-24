/**
 * 仅在测试环境暴露稳定的集成测试接口，用真实提供器完成刷新、添加、撤销、移动恢复和标记同步。
 * 接口返回去除 VS Code 对象后的快照，测试可以断言公开行为而不直接访问内部可变状态。
 */
import * as vscode from 'vscode'
import type { CodeBookmarksViewProvider } from '../providers/CodeBookmarkViewProvider'
import type { IntegrationBookmarkSnapshot } from './IntegrationTestTypes'

export interface CodeBookmarkIntegrationTestApi {
	waitUntilReady(timeoutMs?: number): Promise<void>
	synchronizeCodeMarkers(): Promise<boolean>
	addBookmark(line: number, label: string): Promise<void>
	deleteBookmarksAtLine(line: number): Promise<void>
	undo(): Promise<void>
	redo(): Promise<void>
	moveNode(sourceId: string, targetId: string): Promise<void>
	reload(): Promise<void>
	flush(): Promise<void>
	snapshot(): IntegrationBookmarkSnapshot
}

function activeFileEditor(): vscode.TextEditor {
	const editor = vscode.window.activeTextEditor
	if (!editor || editor.document.uri.scheme !== 'file') {
		throw new Error('Integration test requires an active file editor.')
	}
	return editor
}

function selectLine(editor: vscode.TextEditor, line: number): void {
	if (!Number.isInteger(line) || line < 0 || line >= editor.document.lineCount) {
		throw new Error(`Integration test line is outside the document: ${line}`)
	}
	const position = new vscode.Position(line, 0)
	editor.selections = [new vscode.Selection(position, position)]
}

export function createIntegrationTestApi(
	provider: CodeBookmarksViewProvider,
): CodeBookmarkIntegrationTestApi {
	return Object.freeze({
		async waitUntilReady(timeoutMs = 10_000): Promise<void> {
			const deadline = Date.now() + timeoutMs
			while (!provider.integrationTestSnapshot().ready) {
				if (Date.now() >= deadline) throw new Error('CodeBookmark view did not become ready in time.')
				await new Promise(resolve => setTimeout(resolve, 25))
			}
		},
		async synchronizeCodeMarkers(): Promise<boolean> {
			const changed = await provider.syncCodeMarkersInDocument(activeFileEditor().document)
			await provider.flushPendingSaves(true)
			return changed
		},
		async addBookmark(line: number, label: string): Promise<void> {
			const editor = activeFileEditor()
			selectLine(editor, line)
			await provider.ensureEditorScope(editor)
			await provider.forceAddBookmark(editor, async () => label)
			await provider.flushPendingSaves(true)
		},
		async deleteBookmarksAtLine(line: number): Promise<void> {
			const editor = activeFileEditor()
			selectLine(editor, line)
			await provider.ensureEditorScope(editor)
			await provider.forceDeleteBookmark(editor)
			await provider.flushPendingSaves(true)
		},
		async undo(): Promise<void> {
			await provider.undo()
			await provider.flushPendingSaves(true)
		},
		async redo(): Promise<void> {
			await provider.redo()
			await provider.flushPendingSaves(true)
		},
		async moveNode(sourceId: string, targetId: string): Promise<void> {
			await provider.integrationTestMoveNode(sourceId, targetId)
			await provider.flushPendingSaves(true)
		},
		async reload(): Promise<void> {
			await provider.refresh(undefined, undefined, true)
			await provider.flushPendingSaves(true)
		},
		async flush(): Promise<void> {
			await provider.flushPendingSaves(true)
		},
		snapshot(): IntegrationBookmarkSnapshot {
			return provider.integrationTestSnapshot()
		},
	})
}
