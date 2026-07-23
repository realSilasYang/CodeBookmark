/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `createCodeBookmarkView`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`createCodeBookmarkView`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */

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
