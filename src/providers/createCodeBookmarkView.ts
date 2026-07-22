
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
	const collapseListener = treeView.onDidCollapseElement(event => {
		event.element.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
		provider.refreshExpandCollapseContext()
		if (event.element.contextValue !== ContextBookmark.File) {
			provider.saveBookmarkNodeState(event.element)
		}
	})
	const expandListener = treeView.onDidExpandElement(event => {
		event.element.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
		provider.refreshExpandCollapseContext()
		if (event.element.contextValue !== ContextBookmark.File) {
			provider.saveBookmarkNodeState(event.element)
		}
	})

	context.subscriptions.push(treeView, collapseListener, expandListener)
	return treeView
}
