/**
 * 根据树节点身份打开对应源文件，并把光标定位到书签行或选中的文件节点。
 * 路径解析以当前书签作用域为准，找不到目标时向用户说明，而不是创建新的绑定。
 */

import * as vscode from 'vscode'
import { Commands } from '../util/constants/Commands'
import { Bookmark } from '../models/Bookmark'
import { fileUtils } from '../util/FileUtils'
import { logger } from '../util/Logger'
import { localize } from '../i18n/Localization'
import { normalizedAbsolutePath } from '../util/AbsolutePath'

function sameDocumentUri(left: vscode.Uri | undefined, right: vscode.Uri): boolean {
	if (!left || left.scheme !== right.scheme) return false
	if (left.scheme === 'file') return normalizedAbsolutePath(left.fsPath) === normalizedAbsolutePath(right.fsPath)
	return left.toString() === right.toString()
}

function openedViewColumn(fileUri: vscode.Uri): vscode.ViewColumn | undefined {
	const visibleEditor = vscode.window.visibleTextEditors.find(editor => sameDocumentUri(editor.document.uri, fileUri))
	if (visibleEditor?.viewColumn) return visibleEditor.viewColumn
	for (const group of vscode.window.tabGroups?.all ?? []) {
		for (const tab of group.tabs) {
			const input = tab.input as { uri?: vscode.Uri }
			if (sameDocumentUri(input.uri, fileUri)) return group.viewColumn
		}
	}
	return undefined
}

export function openNodeCommand(context: vscode.ExtensionContext) {
	const openBookmark = vscode.commands.registerCommand(Commands.openBookmark,
		async (bookmark: Bookmark) => {
			if (!bookmark || typeof bookmark.path !== 'string' || bookmark.path.trim() === '') {
				void vscode.window.showErrorMessage(localize("commands.openNodeCommand.theBookmarkPathIsInvalidAndCannotBeOpened"))
				return
			}
			try {
				const fileUri = bookmark.isFile && bookmark.resourceUri
					? bookmark.resourceUri
					: fileUtils.relativeToUri(bookmark.path)
				const existingColumn = openedViewColumn(fileUri)
				const fallbackColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active
				const document = await vscode.workspace.openTextDocument(fileUri)
				const editor = await vscode.window.showTextDocument(document, existingColumn
					? { viewColumn: existingColumn, preserveFocus: false }
					: { viewColumn: fallbackColumn, preserveFocus: false, preview: false })
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
				logger.error(localize("commands.openNodeCommand.failedToOpenBookmark", { path: bookmark.path, error }))
				void vscode.window.showErrorMessage(localize("commands.openNodeCommand.unableToOpenTheFileForThisBookmark", { path: bookmark.path }))
			}
		})

	context.subscriptions.push(openBookmark)
}
