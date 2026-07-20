
import * as vscode from 'vscode'
import { CodeBookmarksViewProvider } from '../providers/CodeBookmarkViewProvider'

export function statusBarSubscriber(
	_context: vscode.ExtensionContext,
	_provider: CodeBookmarksViewProvider,
) {
	// removed removeAllBookmark
}
