import * as vscode from 'vscode'
import { CodeBookmarksViewProvider } from '../providers/CodeBookmarkViewProvider'
import { bookmarkRepository } from '../repository/BookmarkRepository'
export function fileEditorSubscriber(context: vscode.ExtensionContext,
	bookmarkProvider: CodeBookmarksViewProvider,
) {
	vscode.workspace.onDidChangeTextDocument(event => {
		bookmarkProvider.changeContentFile(event)
	})

	const focusEditor = vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			const scheme = editor.document.uri.scheme;
			// Ignore internal VS Code panels that should not affect bookmark context
			if (scheme === 'output' || scheme === 'extension-output' || scheme === 'vscode-webview' || scheme === 'debug' || scheme === 'log') {
				return;
			}
			bookmarkProvider.reloadActiveTab()
		}
	})

	const visibleEditors = vscode.window.onDidChangeVisibleTextEditors(_editors => {
		// Nothing to do for bookmarks on visible editors change anymore
	})

	const renameFiles = vscode.workspace.onDidRenameFiles(async (event) => {
		for (const file of event.files) {
			await bookmarkRepository.handleFileRename(file.oldUri.fsPath, file.newUri.fsPath)
			bookmarkProvider.onRenameDirectory(file.oldUri.fsPath, file.newUri.fsPath)
		}
	})

	const deleteFiles = vscode.workspace.onDidDeleteFiles(async (event) => {
		for (const file of event.files) {
			await bookmarkRepository.handleFileDelete(file.fsPath)
			bookmarkProvider.onDeleteDirectory(file.fsPath)
		}
	})

	context.subscriptions.push(
		focusEditor,
		visibleEditors,
		renameFiles,
		deleteFiles
	)
}
