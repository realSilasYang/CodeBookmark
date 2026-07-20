
import * as vscode from 'vscode'
import { Commands } from '../util/constants/Commands'
import { CodeBookmarksViewProvider } from './CodeBookmarkViewProvider'
import { ContextBookmark } from '../util/ContextValue'


export function createCodeBookmarkView(context: vscode.ExtensionContext, provider: CodeBookmarksViewProvider) {
	const treeView = vscode.window.createTreeView(Commands.codeBookmarkViewName,
		{
			treeDataProvider: provider,
			dragAndDropController: provider,
			canSelectMany: true,
		})
	// treeView.onDidChangeVisibility((event) => {

	// })
	treeView.onDidCollapseElement((event) => {
		if (event) {
			event.element.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
			if (event.element.contextValue === ContextBookmark.Bookmark) {
				provider.saveBookmarksToFile()
			}
		}
	})
	treeView.onDidExpandElement((event) => {
		if (event) {
			event.element.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
			if (event.element.contextValue === ContextBookmark.Bookmark) {
				provider.saveBookmarksToFile()
			}
		}
	})

	// treeView.onDidChangeSelection((event) => {

	// })

	context.subscriptions.push(treeView)
	return treeView
}
