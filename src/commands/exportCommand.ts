
import * as vscode from 'vscode'
import { CodeBookmarksViewProvider } from '../providers/CodeBookmarkViewProvider'
import { Bookmark } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'
import { ContextBookmark } from '../util/ContextValue'


function collectBookmarks(bookmarkSet: BookmarkSet, out: Bookmark[]): void {
	for (const bm of bookmarkSet) {
		if (bm.contextValue === ContextBookmark.Bookmark || bm.contextValue === ContextBookmark.BookmarkPinned) {
			out.push(bm)
		}
		if (bm.subs.size > 0) {
			collectBookmarks(bm.subs, out)
		}
	}
}

function escapePipe(text: string): string {
	return text.replace(/\|/g, '\\|')
}

function getLabelText(label: string | vscode.TreeItemLabel | undefined): string {
	if (label === undefined) return ''
	if (typeof label === 'string') return label
	return label.label
}

export function registerExportCommand(context: vscode.ExtensionContext, provider: CodeBookmarksViewProvider) {
	const exportToMarkdown = vscode.commands.registerCommand('codebookmark.exportToMarkdown',
		async () => {
			const allBookmarks: Bookmark[] = []
			collectBookmarks(provider.codeBookmarks, allBookmarks)

			if (allBookmarks.length === 0) {
				vscode.window.showInformationMessage('没有可导出的书签。')
				return
			}

			// Group bookmarks by file path
			const grouped = new Map<string, Bookmark[]>()
			for (const bm of allBookmarks) {
				const filePath = bm.path
				if (!grouped.has(filePath)) {
					grouped.set(filePath, [])
				}
				grouped.get(filePath)!.push(bm)
			}

			// Sort bookmarks within each file by line number
			for (const [, bookmarks] of grouped) {
				bookmarks.sort((a, b) => a.start.line - b.start.line)
			}

			// Build Markdown content
			const lines: string[] = []
			lines.push('# CodeBookmark 导出')
			lines.push('')

			for (const [filePath, bookmarks] of grouped) {
				lines.push(`## ${filePath}`)
				lines.push('')
				lines.push('| 行号 | 标签 | 代码内容 |')
				lines.push('| --- | --- | --- |')
				for (const bm of bookmarks) {
					const lineNumber = bm.start.line + 1
					const label = escapePipe(getLabelText(bm.label))
					const content = escapePipe((bm.content ?? '').replace(/\n/g, ' '))
					lines.push(`| ${lineNumber} | ${label} | ${content} |`)
				}
				lines.push('')
			}

			const markdown = lines.join('\n')
			const doc = await vscode.workspace.openTextDocument({ content: markdown, language: 'markdown' })
			await vscode.window.showTextDocument(doc)
			vscode.window.showInformationMessage(`已导出 ${allBookmarks.length} 个书签。`)
		})

	context.subscriptions.push(exportToMarkdown)
}
