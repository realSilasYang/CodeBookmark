/**
 * 模块说明：本文件负责集成测试专用公开接口，具体对象为 `IntegrationTestApi`。
 *
 * 实现要点：把真实提供器操作包装为稳定测试 API，并只返回可断言的不可变快照。
 * 核心边界：仅向受控测试环境暴露稳定快照和操作入口，生产运行时不得依赖这些接口。
 * 主要入口：`CodeBookmarkIntegrationTestApi`、`createIntegrationTestApi`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
		async flush(): Promise<void> {
			await provider.flushPendingSaves(true)
		},
		snapshot(): IntegrationBookmarkSnapshot {
			return provider.integrationTestSnapshot()
		},
	})
}
