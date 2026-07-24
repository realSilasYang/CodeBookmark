/**
 * 把书签领域状态投影成 VS Code TreeItem 的图标、标签、描述、提示和上下文值。
 * 展示刷新不执行文件访问，也不改变书签层级，因此可在频繁的树重绘中安全调用。
 */
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'

import { localize } from '../i18n/Localization'
import { bookmarkIcon } from '../util/BookmarkIcon'
import { bookmarkPathKey } from '../util/BookmarkPath'
import { ContextBookmark } from '../util/ContextValue'
import type { CodeMarkerMetadata } from '../util/CodeMarkerScanner'
import { bookmarkLabelText } from './BookmarkLabel'

interface BookmarkTreeItemModel {
	label?: vscode.TreeItem['label']
	description?: vscode.TreeItem['description']
	resourceUri?: vscode.TreeItem['resourceUri']
	contextValue?: vscode.TreeItem['contextValue']
	collapsibleState?: vscode.TreeItem['collapsibleState']
	iconPath?: vscode.TreeItem['iconPath']
	tooltip?: vscode.TreeItem['tooltip']
	path: string
	icon: string
	isPinned: boolean
	isBookmarkInvalid: boolean
	isCodeMarker: boolean
	isUsingDefaultIcon: boolean
	codeMarker?: CodeMarkerMetadata
	subs: { size: number }
	start: { line: number, column: number }
	end: { line: number, column: number }
	content?: string
	level: number
	isFile: boolean
	parent?: BookmarkTreeItemModel
}

function tooltipUri(uri: vscode.Uri): string {
	const relativeHomePath = path.relative(os.homedir(), uri.fsPath)
	if (relativeHomePath === '' || (!relativeHomePath.startsWith('..') && !path.isAbsolute(relativeHomePath))) {
		return `~${path.sep}${relativeHomePath}`
	}
	return uri.fsPath
}

function crossFileSourcePath(item: BookmarkTreeItemModel): string | undefined {
	if (item.isFile || !item.path) return undefined
	let rootFile: BookmarkTreeItemModel | undefined
	let ancestor = item.parent
	while (ancestor) {
		if (ancestor.isFile) rootFile = ancestor
		ancestor = ancestor.parent
	}
	if (!rootFile) return item.path
	return bookmarkPathKey(rootFile.path) === bookmarkPathKey(item.path) ? undefined : item.path
}

function updateTooltip(item: BookmarkTreeItemModel, sourcePath: string | undefined): void {
	if (item.isFile) {
		if (item.resourceUri) item.tooltip = tooltipUri(item.resourceUri)
		return
	}
	const tooltipContent = new vscode.MarkdownString()
	tooltipContent.supportThemeIcons = true
	tooltipContent.appendMarkdown('#### $(tag) ')
	tooltipContent.appendText(bookmarkLabelText(item.label))
	tooltipContent.appendMarkdown(` &nbsp;&nbsp; $(debug-line-by-line) ${item.start.line + 1}\n`)
	if (sourcePath) {
		tooltipContent.appendMarkdown(`$(file-code) **${localize("models.BookmarkTreeItemPresentation.source")}** `)
		tooltipContent.appendText(sourcePath)
		tooltipContent.appendMarkdown('\n')
	}
	if (item.subs.size > 0) tooltipContent.appendMarkdown(`$(type-hierarchy-sub) **${item.subs.size}**\n`)
	tooltipContent.appendCodeblock(item.content ?? '', path.extname(item.path).split('.').pop())
	item.tooltip = tooltipContent
}

export function refreshBookmarkTreeItem(
	item: BookmarkTreeItemModel,
	previousSignature: string | undefined,
): string {
	const labelText = bookmarkLabelText(item.label)
	const level = item.level
	const sourcePath = crossFileSourcePath(item)
	const signature = [
		labelText,
		item.path,
		item.icon,
		item.isPinned ? '1' : '0',
		item.isBookmarkInvalid ? '1' : '0',
		item.isCodeMarker ? '1' : '0',
		item.codeMarker?.iconCustomized ? '1' : '0',
		item.subs.size,
		item.start.line,
		item.start.column,
		item.end.line,
		item.end.column,
		item.content ?? '',
		level,
		item.resourceUri?.fsPath ?? '',
		sourcePath ?? '',
	].join('\0')
	if (signature === previousSignature) return signature

	if (!item.isFile && !item.isBookmarkInvalid) {
		if (item.isCodeMarker) {
			const customIcon = !item.isUsingDefaultIcon
			item.contextValue = item.isPinned
				? customIcon ? ContextBookmark.CodeMarkerPinnedCustom : ContextBookmark.CodeMarkerPinnedDefault
				: customIcon ? ContextBookmark.CodeMarkerCustom : ContextBookmark.CodeMarkerDefault
		} else {
			item.contextValue = item.isPinned ? ContextBookmark.BookmarkPinned : ContextBookmark.Bookmark
		}
	}
	if (item.isFile) {
		item.contextValue = item.isPinned
			? item.icon ? ContextBookmark.FilePinnedCustom : ContextBookmark.FilePinned
			: item.icon ? ContextBookmark.FileCustom : ContextBookmark.File
	}

	if (!item.isFile) {
		item.description = sourcePath
			? localize("models.BookmarkTreeItemPresentation.from", { fileName: path.basename(sourcePath) })
			: ''
		item.resourceUri = undefined
	}
	if (item.subs.size === 0) item.collapsibleState = vscode.TreeItemCollapsibleState.None
	else if (item.isPinned) item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
	else if (item.collapsibleState === vscode.TreeItemCollapsibleState.None) {
		item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
	}

	updateTooltip(item, sourcePath)
	if (item.isBookmarkInvalid) {
		item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'))
		return signature
	}
	if (item.isFile) {
		if (item.icon) item.iconPath = bookmarkIcon.getCustomIcon(item.icon)
		else if (item.isPinned) item.iconPath = new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('charts.green'))
		else item.iconPath = new vscode.ThemeIcon('file')
		return signature
	}

	if (item.isPinned) {
		item.iconPath = new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('charts.green'))
	} else if (item.icon === '') {
		if (item.subs.size > 0) {
			if (level === 1) {
				item.iconPath = new vscode.ThemeIcon('bookmark', new vscode.ThemeColor('codebookmark.color.Lvl1Orange'))
			} else if (level === 2) {
				item.iconPath = new vscode.ThemeIcon('bookmark', new vscode.ThemeColor('codebookmark.color.Lvl2Blue'))
			} else {
				item.iconPath = new vscode.ThemeIcon('folder')
			}
		} else {
			item.iconPath = new vscode.ThemeIcon('bookmark')
		}
	} else {
		item.iconPath = bookmarkIcon.getCustomIcon(item.icon)
	}
	return signature
}
