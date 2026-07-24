/**
 * 按固定顺序创建数据提供器、TreeView 和初始上下文，返回扩展激活所需的完整视图对象。
 * 工厂只负责装配，实际磁盘加载在视图注册完成后由后台初始化启动。
 */

import * as vscode from 'vscode'
import { Commands } from '../util/constants/Commands'
import { CodeBookmarksViewProvider } from './CodeBookmarkViewProvider'

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
		provider.saveTreeNodeExpansionState(event.element)
	})
	const expandListener = treeView.onDidExpandElement(event => {
		event.element.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
		provider.refreshExpandCollapseContext()
		provider.saveTreeNodeExpansionState(event.element)
	})

	context.subscriptions.push(treeView, collapseListener, expandListener)
	return treeView
}
