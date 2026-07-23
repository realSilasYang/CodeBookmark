/**
 * 模块说明：本文件负责用户命令注册与交互流程，具体对象为 `openNodeCommand`。
 *
 * 实现要点：把 VS Code 命令参数转换为领域操作，并统一处理选择范围、用户取消和结果反馈。
 * 核心边界：命令层只编排用户意图、确认与结果提示，持久化和领域规则交由下层模块执行。
 * 主要入口：`openNodeCommand`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */

import * as vscode from 'vscode'
import { Commands } from '../util/constants/Commands'
import { Bookmark } from '../models/Bookmark'
import { fileUtils } from '../util/FileUtils'
import { logger } from '../util/Logger'
import { localize } from '../i18n/Localization'


export function openNodeCommand(context: vscode.ExtensionContext) {
	const openBookmark = vscode.commands.registerCommand(Commands.openBookmark,
		async (bookmark: Bookmark) => {
			if (!bookmark || typeof bookmark.path !== 'string' || bookmark.path.trim() === '') {
				void vscode.window.showErrorMessage(localize(
					'书签路径无效，无法打开。',
					'The bookmark path is invalid and cannot be opened.',
				))
				return
			}
			try {
				let fileNode: Bookmark | undefined = bookmark
				while (fileNode?.parent) fileNode = fileNode.parent
				const fileUri = fileNode?.isFile && fileNode.resourceUri
					? fileNode.resourceUri
					: fileUtils.relativeToUri(bookmark.path)
				const document = await vscode.workspace.openTextDocument(fileUri)
				const editor = await vscode.window.showTextDocument(document, { preserveFocus: true, preview: true })
				if (bookmark.isFile) {
					editor.selection = new vscode.Selection(0, 0, 0, 0)
					return
				}

				const clampPosition = (lineValue: unknown, columnValue: unknown): vscode.Position => {
					const rawLine = typeof lineValue === 'number' && Number.isFinite(lineValue) ? Math.floor(lineValue) : 0
					const line = Math.min(Math.max(rawLine, 0), document.lineCount - 1)
					const rawColumn = typeof columnValue === 'number' && Number.isFinite(columnValue) ? Math.floor(columnValue) : 0
					const column = Math.min(Math.max(rawColumn, 0), document.lineAt(line).text.length)
					return new vscode.Position(line, column)
				}

				const start = clampPosition(bookmark.start?.line, bookmark.start?.column)
				const end = clampPosition(bookmark.end?.line, bookmark.end?.column)
				let range = new vscode.Range(start, end)
				if (start.isEqual(end)) {
					const line = document.lineAt(start.line)
					const indentation = line.text.length - line.text.trimStart().length
					range = new vscode.Range(new vscode.Position(line.lineNumber, indentation), line.range.end)
				}

				editor.selection = new vscode.Selection(range.start, range.end)
				editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
			} catch (error) {
				logger.error(localize(
					`无法打开书签 ${bookmark.path}: ${error}`,
					`Failed to open bookmark ${bookmark.path}: ${error}`,
				))
				void vscode.window.showErrorMessage(localize(
					`无法打开书签对应文件：${bookmark.path}`,
					`Unable to open the file for this bookmark: ${bookmark.path}`,
				))
			}
		})

	context.subscriptions.push(openBookmark)
}
