import * as vscode from 'vscode'
import type { CodeBookmarksViewProvider } from '../providers/CodeBookmarkViewProvider'
import type { IntegrationBookmarkSnapshot } from './IntegrationTestTypes'

export interface CodeBookmarkIntegrationTestApi {
	waitUntilReady(timeoutMs?: number): Promise<void>
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
