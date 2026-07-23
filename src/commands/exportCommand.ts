import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { currentFormattingLocale, localize } from '../i18n/Localization'
import { Bookmark, bookmarkLabelText } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'
import type { CodeBookmarksViewProvider } from '../providers/CodeBookmarkViewProvider'
import { Commands } from '../util/constants/Commands'
import { fileUtils } from '../util/FileUtils'
import {
	absolutePathKey,
	isSameOrDescendantAbsolutePath,
	normalizedAbsolutePath,
} from '../util/AbsolutePath'
import {
	formatBookmarkLevelSummary,
	mergeBookmarkLevelSummaries,
	summarizeBookmarkLevels,
	summarizeBookmarkTrees,
	type BookmarkLevelSummary,
} from '../util/BookmarkStatistics'

type ReadableExportFormat = 'markdown' | 'html' | 'csv' | 'text'
type BatchExportFormat = ReadableExportFormat | 'source'

interface ExportRecord {
	bookmark: Bookmark
	filePath: string
	depth: number
}

interface ExportGroup {
	filePath: string
	records: ExportRecord[]
}

interface FileExportTarget {
	fileNode: Bookmark
	absolutePath: string
}

type BookmarkExportStatus = 'valid' | 'automatic' | 'invalid'

function collectRecords(
	bookmarkSet: BookmarkSet,
	out: ExportRecord[],
	filePath = '',
	depth = 0,
): void {
	for (const bookmark of bookmarkSet) {
		if (bookmark.isFile) {
			collectRecords(bookmark.subs, out, bookmark.path, 0)
			continue
		}
		const nextFilePath = bookmark.path || filePath
		out.push({ bookmark, filePath: nextFilePath || localize('未指定文件', 'Unspecified file'), depth })
		if (bookmark.subs.size > 0) collectRecords(bookmark.subs, out, nextFilePath, depth + 1)
	}
}

function collectFileNodes(bookmarkSet: BookmarkSet): Bookmark[] {
	const output: Bookmark[] = []
	const visit = (items: BookmarkSet): void => {
		for (const bookmark of items) {
			if (bookmark.isFile && bookmark.scriptId && bookmark.subs.size > 0) output.push(bookmark)
			if (!bookmark.isFile && bookmark.subs.size > 0) visit(bookmark.subs)
		}
	}
	visit(bookmarkSet)
	return output
}

function absolutePathForFileNode(fileNode: Bookmark, scopeUri?: vscode.Uri): string {
	return normalizedAbsolutePath(fileNode.resourceUri?.fsPath
		?? (path.isAbsolute(fileNode.path) ? fileNode.path : fileUtils.relativeToAbsolute(fileNode.path, scopeUri)))
}

function sourcePathForFileNode(fileNode: Bookmark): string | undefined {
	if (!fileNode.scriptId) return undefined
	const scriptFolder = fileUtils.getScriptStoreFolder()
	return scriptFolder ? path.join(scriptFolder, `${fileNode.scriptId}.json`) : undefined
}

function fileExportTargets(bookmarkSet: BookmarkSet, scopeUri?: vscode.Uri): FileExportTarget[] {
	const unique = new Map<string, FileExportTarget>()
	for (const fileNode of collectFileNodes(bookmarkSet)) {
		const absolutePath = absolutePathForFileNode(fileNode, scopeUri)
		unique.set(absolutePathKey(absolutePath), { fileNode, absolutePath })
	}
	return [...unique.values()]
}

function groupRecords(records: readonly ExportRecord[]): ExportGroup[] {
	const groups = new Map<string, ExportGroup>()
	for (const record of records) {
		let group = groups.get(record.filePath)
		if (!group) {
			group = { filePath: record.filePath, records: [] }
			groups.set(record.filePath, group)
		}
		group.records.push(record)
	}
	return [...groups.values()].sort((left, right) => left.filePath.localeCompare(right.filePath))
}

function exportGroupForFile(fileNode: Bookmark): ExportGroup | undefined {
	const records: ExportRecord[] = []
	collectRecords(fileNode.subs, records, fileNode.path, 0)
	return records.length > 0 ? { filePath: fileNode.path, records } : undefined
}

function markdownText(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/([\\`*_[\]#])/g, '\\$1').replace(/\r?\n/g, ' ')
}

function inlineCode(value: string): string {
	const normalized = value.replace(/\r?\n/g, ' ').trim()
	if (!normalized) return ''
	const longestRun = Math.max(0, ...[...normalized.matchAll(/`+/g)].map(match => match[0].length))
	const fence = '`'.repeat(longestRun + 1)
	return `${fence}${normalized}${fence}`
}

function htmlText(value: string): string {
	return value.replace(/[&<>"']/g, character => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	}[character] ?? character)).replace(/\r?\n/g, '<br>')
}

function csvCell(value: string | number): string {
	const raw = String(value)
	let firstMeaningful = 0
	while (firstMeaningful < raw.length) {
		const code = raw.charCodeAt(firstMeaningful)
		if (code > 32 && (code < 127 || code > 159)) break
		firstMeaningful++
	}
	const text = '=+-@'.includes(raw[firstMeaningful] ?? '') ? `'${raw}` : raw
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function displayLabel(bookmark: Bookmark): string {
	return bookmarkLabelText(bookmark.label).trim() || localize('未命名书签', 'Untitled bookmark')
}

function bookmarkStatus(bookmark: Bookmark): BookmarkExportStatus {
	if (bookmark.isBookmarkInvalid) return 'invalid'
	return bookmark.isCodeMarker ? 'automatic' : 'valid'
}

function bookmarkStatusLabel(status: BookmarkExportStatus): string {
	if (status === 'invalid') return localize('失效', 'Invalid')
	if (status === 'automatic') return localize('自动标记', 'Automatic marker')
	return localize('有效', 'Valid')
}

function formatMarkdown(groups: readonly ExportGroup[], total: number): string {
	const lines = [
		localize('# CodeBookmark 书签导出', '# CodeBookmark Bookmark Export'),
		'',
		localize(
			`> 共 ${total} 个书签 · ${groups.length} 个文件 · 导出时间：${new Date().toLocaleString(currentFormattingLocale())}`,
			`> ${total} bookmarks · ${groups.length} files · Exported: ${new Date().toLocaleString(currentFormattingLocale())}`,
		),
		'',
	]
	for (const group of groups) {
		lines.push(`## ${markdownText(group.filePath)}`, '')
		for (const record of group.records) {
			const bookmark = record.bookmark
			const indent = '  '.repeat(record.depth)
			const status = bookmarkStatus(bookmark)
			const statusText = status === 'valid' ? '' : ` · ${bookmarkStatusLabel(status)}`
			const content = inlineCode(bookmark.content ?? '')
			lines.push(localize(
				`${indent}- **${markdownText(displayLabel(bookmark))}** — 第 ${bookmark.start.line + 1} 行${statusText}`,
				`${indent}- **${markdownText(displayLabel(bookmark))}** — Line ${bookmark.start.line + 1}${statusText}`,
			))
			if (content) lines.push(`${indent}  - ${content}`)
		}
		lines.push('')
	}
	return `${lines.join('\n').trimEnd()}\n`
}

function formatHtml(groups: readonly ExportGroup[], total: number): string {
	const sections = groups.map(group => {
		const rows = group.records.map(record => {
			const bookmark = record.bookmark
			const status = bookmarkStatus(bookmark)
			return [
				'          <tr>',
				`            <td class="line">${bookmark.start.line + 1}</td>`,
				`            <td><span class="bookmark-label" style="--depth:${record.depth}">${htmlText(displayLabel(bookmark))}</span></td>`,
				`            <td><code>${htmlText(bookmark.content ?? '—')}</code></td>`,
				`            <td><span class="status status-${status}">${bookmarkStatusLabel(status)}</span></td>`,
				'          </tr>',
			].join('\n')
		}).join('\n')
		return `    <section>
      <h2>${htmlText(group.filePath)}</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>${localize('行号', 'Line')}</th><th>${localize('书签', 'Bookmark')}</th><th>${localize('代码内容', 'Code')}</th><th>${localize('状态', 'Status')}</th></tr></thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>
    </section>`
	}).join('\n')
	return `<!doctype html>
<html lang="${localize('zh-CN', 'en')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${localize('CodeBookmark 书签导出', 'CodeBookmark Bookmark Export')}</title>
  <style>
    :root{color-scheme:light dark;--bg:#fff;--panel:#f6f8fa;--text:#1f2328;--muted:#59636e;--border:#d0d7de;--accent:#0969da}
    @media(prefers-color-scheme:dark){:root{--bg:#0d1117;--panel:#161b22;--text:#e6edf3;--muted:#8b949e;--border:#30363d;--accent:#58a6ff}}
    *{box-sizing:border-box}body{max-width:1200px;margin:0 auto;padding:32px 24px 64px;background:var(--bg);color:var(--text);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
    header{padding-bottom:20px;border-bottom:1px solid var(--border)}h1{margin:0 0 8px;font-size:30px}header p{margin:0;color:var(--muted)}h2{margin:32px 0 12px;color:var(--accent);font-size:19px;overflow-wrap:anywhere}
    .table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:8px}table{width:100%;border-collapse:collapse}th,td{padding:10px 12px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}th{background:var(--panel);white-space:nowrap}tbody tr:last-child td{border-bottom:0}tbody tr:nth-child(even){background:color-mix(in srgb,var(--panel) 55%,transparent)}
    .line{width:1%;white-space:nowrap;font-variant-numeric:tabular-nums}.bookmark-label{display:block;padding-left:calc(var(--depth) * 20px);font-weight:600}code{white-space:pre-wrap;overflow-wrap:anywhere;font-family:"Cascadia Code",Consolas,monospace}
    .status{display:inline-block;padding:1px 7px;border-radius:999px;background:var(--panel);white-space:nowrap}.status-invalid{color:#cf222e}.status-automatic{color:#8250df}.status-valid{color:#1a7f37}
    @media print{body{max-width:none;padding:0}.table-wrap{overflow:visible}section{break-inside:avoid}thead{display:table-header-group}}
  </style>
</head>
<body>
  <header>
    <h1>${localize('CodeBookmark 书签导出', 'CodeBookmark Bookmark Export')}</h1>
    <p>${localize(
		`共 ${total} 个书签 · ${groups.length} 个文件 · 导出时间：${htmlText(new Date().toLocaleString(currentFormattingLocale()))}`,
		`${total} bookmarks · ${groups.length} files · Exported: ${htmlText(new Date().toLocaleString(currentFormattingLocale()))}`,
	)}</p>
  </header>
${sections}
</body>
</html>
`
}

function formatCsv(groups: readonly ExportGroup[]): string {
	const lines = [localize('文件,行号,列号,层级,状态,标签,代码内容', 'File,Line,Column,Level,Status,Label,Code')]
	for (const group of groups) {
		for (const record of group.records) {
			const bookmark = record.bookmark
			lines.push([
				group.filePath,
				bookmark.start.line + 1,
				bookmark.start.column + 1,
				record.depth + 1,
				bookmarkStatusLabel(bookmarkStatus(bookmark)),
				displayLabel(bookmark),
				bookmark.content ?? '',
			].map(csvCell).join(','))
		}
	}
	return `\uFEFF${lines.join('\r\n')}\r\n`
}

function formatText(groups: readonly ExportGroup[], total: number): string {
	const lines = [
		localize('CodeBookmark 书签导出', 'CodeBookmark Bookmark Export'),
		'='.repeat(28),
		localize(`共 ${total} 个书签 · ${groups.length} 个文件`, `${total} bookmarks · ${groups.length} files`),
		localize(`导出时间：${new Date().toLocaleString(currentFormattingLocale())}`, `Exported: ${new Date().toLocaleString(currentFormattingLocale())}`),
		'',
	]
	for (const group of groups) {
		lines.push(localize(`【${group.filePath}】`, `[${group.filePath}]`), '-'.repeat(28))
		for (const record of group.records) {
			const bookmark = record.bookmark
			const indent = '  '.repeat(record.depth)
			const status = bookmarkStatus(bookmark)
			const statusText = status === 'valid' ? '' : ` [${bookmarkStatusLabel(status)}]`
			lines.push(`${indent}${bookmark.start.line + 1}:${bookmark.start.column + 1}  ${displayLabel(bookmark)}${statusText}`)
			const content = (bookmark.content ?? '').replace(/\r?\n/g, ' ').trim()
			if (content) lines.push(localize(`${indent}  代码：${content}`, `${indent}  Code: ${content}`))
		}
		lines.push('')
	}
	return `${lines.join('\n').trimEnd()}\n`
}

function formatContent(format: ReadableExportFormat, groups: readonly ExportGroup[], total: number): string {
	switch (format) {
		case 'markdown': return formatMarkdown(groups, total)
		case 'html': return formatHtml(groups, total)
		case 'csv': return formatCsv(groups)
		case 'text': return formatText(groups, total)
	}
}

function extensionFor(format: ReadableExportFormat): string {
	return format === 'markdown' ? '.md' : format === 'html' ? '.html' : format === 'csv' ? '.csv' : '.txt'
}

function formatLabel(format: BatchExportFormat): string {
	return format === 'markdown' ? 'Markdown'
		: format === 'html' ? 'HTML'
			: format === 'csv' ? 'CSV'
				: format === 'text' ? localize('纯文本', 'Plain Text')
					: localize('书签配置源文件', 'Bookmark Configuration Source')
}

function ensureExtension(filePath: string, extension: string): string {
	return path.extname(filePath).toLowerCase() === extension ? filePath : `${filePath}${extension}`
}

function timestamp(): string {
	return new Date().toISOString().replace(/[T:.Z]/g, '-').replace(/-+$/, '')
}

async function writeUtf8(filePath: string, content: string): Promise<void> {
	await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
	await fs.promises.writeFile(filePath, content, 'utf8')
}

async function writeReadableSourceConfig(sourcePath: string, targetPath: string): Promise<void> {
	const raw = await fs.promises.readFile(sourcePath, 'utf8')
	const data: unknown = JSON.parse(raw)
	await writeUtf8(targetPath, `${JSON.stringify(data, null, 2)}\n`)
}

function activeFileUri(): vscode.Uri | undefined {
	const uri = vscode.window.activeTextEditor?.document.uri
	return uri?.scheme === 'file' ? uri : undefined
}

function defaultExportDirectory(): string | undefined {
	const activeUri = activeFileUri()
	return activeUri ? path.dirname(activeUri.fsPath) : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}

async function chooseSavePath(format: ReadableExportFormat): Promise<vscode.Uri | undefined> {
	const defaultDirectory = defaultExportDirectory()
	const defaultUri = defaultDirectory
		? vscode.Uri.file(path.join(defaultDirectory, `${localize('CodeBookmark-书签导出', 'CodeBookmark-Bookmark-Export')}${extensionFor(format)}`))
		: undefined
	return vscode.window.showSaveDialog({
		title: localize(`导出为 ${formatLabel(format)}`, `Export as ${formatLabel(format)}`),
		filters: format === 'markdown' ? { Markdown: ['md'] }
			: format === 'html' ? { HTML: ['html'] }
				: format === 'csv' ? { CSV: ['csv'] }
					: { [localize('纯文本', 'Plain Text')]: ['txt'] },
		defaultUri,
	})
}

async function chooseExportDirectory(title: string): Promise<vscode.Uri | undefined> {
	const defaultDirectory = defaultExportDirectory()
	const selected = await vscode.window.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		openLabel: localize('选择导出目录', 'Select Export Folder'),
		title,
		defaultUri: defaultDirectory ? vscode.Uri.file(defaultDirectory) : undefined,
	})
	return selected?.[0]
}

function relativeSourcePath(absolutePath: string, baseDirectory: string): string {
	const relative = path.relative(baseDirectory, absolutePath)
	return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
		? relative
		: path.basename(absolutePath)
}

function readableTargetPath(outputFolder: string, baseDirectory: string, sourcePath: string, format: ReadableExportFormat): string {
	const relative = relativeSourcePath(sourcePath, baseDirectory)
	return path.join(outputFolder, path.dirname(relative), `${path.basename(relative)}.bookmarks${extensionFor(format)}`)
}

function sourceTargetPath(outputFolder: string, baseDirectory: string, sourcePath: string): string {
	const relative = relativeSourcePath(sourcePath, baseDirectory)
	return path.join(outputFolder, path.dirname(relative), `${path.basename(relative)}.codebookmark.json`)
}

function directSourceBaseDirectory(targets: readonly FileExportTarget[]): string {
	const activeUri = activeFileUri()
	const workspaceFolder = activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined
	if (workspaceFolder) return workspaceFolder.uri.fsPath
	return activeUri ? path.dirname(activeUri.fsPath) : path.dirname(targets[0].absolutePath)
}

export function registerExportCommand(context: vscode.ExtensionContext, provider: CodeBookmarksViewProvider): void {
	const getGroups = (): ExportGroup[] | undefined => {
		const records: ExportRecord[] = []
		collectRecords(provider.codeBookmarks, records)
		if (records.length === 0) {
			void vscode.window.showInformationMessage(localize('没有可导出的书签。', 'There are no bookmarks to export.'))
			return undefined
		}
		return groupRecords(records)
	}

	const exportReadable = (format: ReadableExportFormat) => async (): Promise<void> => {
		const groups = getGroups()
		if (!groups) return
		const target = await chooseSavePath(format)
		if (!target) return
		try {
			const total = groups.reduce((sum, group) => sum + group.records.length, 0)
			const summary = summarizeBookmarkLevels(groups.flatMap(group => group.records.map(record => record.depth + 1)))
			const filePath = ensureExtension(target.fsPath, extensionFor(format))
			await writeUtf8(filePath, formatContent(format, groups, total))
			void vscode.window.showInformationMessage(localize(
				`书签导出完成，导出结果：${formatBookmarkLevelSummary(summary)}；文件：${path.basename(filePath)}。`,
				`Bookmark export completed. Exported: ${formatBookmarkLevelSummary(summary)}. File: ${path.basename(filePath)}.`,
			))
		} catch (error) {
			void vscode.window.showErrorMessage(localize(
				`导出失败：${error instanceof Error ? error.message : String(error)}`,
				`Export failed: ${error instanceof Error ? error.message : String(error)}`,
			))
		}
	}

	const exportSourceFiles = async (): Promise<void> => {
		const scopeUri = activeFileUri()
		const targets = fileExportTargets(provider.codeBookmarks, scopeUri)
		if (targets.length === 0) {
			void vscode.window.showInformationMessage(localize('没有可导出的书签配置源文件。', 'There are no bookmark configuration source files to export.'))
			return
		}
		const selectedFolder = await chooseExportDirectory(localize('选择书签配置源文件导出目录', 'Select a Folder for Bookmark Configuration Sources'))
		if (!selectedFolder) return
		const outputFolder = path.join(selectedFolder.fsPath, `${localize('CodeBookmark-书签配置源文件', 'CodeBookmark-Configuration-Sources')}-${timestamp()}`)
		const baseDirectory = directSourceBaseDirectory(targets)
		let exported = 0
		let failed = 0
		const exportedSummaries: BookmarkLevelSummary[] = []
		try {
			await provider.flushPendingSaves(true)
			for (const target of targets) {
				const sourcePath = sourcePathForFileNode(target.fileNode)
				if (!sourcePath) {
					failed++
					continue
				}
				try {
					await writeReadableSourceConfig(sourcePath, sourceTargetPath(outputFolder, baseDirectory, target.absolutePath))
					exportedSummaries.push(summarizeBookmarkTrees(target.fileNode.subs))
					exported++
				} catch {
					failed++
				}
			}
			if (exported === 0) throw new Error(localize('当前书签对应的配置源文件均不存在或无法读取。', 'None of the configuration source files for the current bookmarks exist or can be read.'))
			const failedText = failed > 0 ? localize(`，${failed} 个文件导出失败`, `; ${failed} files failed`) : ''
			const summary = mergeBookmarkLevelSummaries(...exportedSummaries)
			void vscode.window.showInformationMessage(localize(
				`书签配置源文件导出完成：成功 ${exported} 个文件${failedText}；导出结果：${formatBookmarkLevelSummary(summary)}；目录：${path.basename(outputFolder)}。`,
				`Bookmark configuration source export completed: ${exported} files succeeded${failedText}. Exported: ${formatBookmarkLevelSummary(summary)}. Folder: ${path.basename(outputFolder)}.`,
			))
		} catch (error) {
			void vscode.window.showErrorMessage(localize(
				`导出书签配置源文件失败：${error instanceof Error ? error.message : String(error)}`,
				`Failed to export bookmark configuration sources: ${error instanceof Error ? error.message : String(error)}`,
			))
		}
	}

	const batchExport = (format: BatchExportFormat) => async (): Promise<void> => {
		const activeUri = activeFileUri()
		if (!activeUri) {
			void vscode.window.showInformationMessage(localize(
				'请先打开当前文件夹中的任意本地文件，再执行批量导出。',
				'Open any local file in the current folder before running a batch export.',
			))
			return
		}
		const currentFolder = path.dirname(activeUri.fsPath)
		const targets = fileExportTargets(provider.codeBookmarks, activeUri)
			.filter(target => isSameOrDescendantAbsolutePath(target.absolutePath, currentFolder))
			.sort((left, right) => left.absolutePath.localeCompare(right.absolutePath))
		if (targets.length === 0) {
			void vscode.window.showInformationMessage(localize(
				'当前文件夹及其子目录中没有包含书签的文件。',
				'No files with bookmarks were found in the current folder or its subfolders.',
			))
			return
		}
		const selectedFolder = await chooseExportDirectory(localize(
			`选择批量导出为 ${formatLabel(format)} 的目标目录`,
			`Select a Destination for the ${formatLabel(format)} Batch Export`,
		))
		if (!selectedFolder) return
		const outputFolder = path.join(selectedFolder.fsPath, `${localize('CodeBookmark-批量导出', 'CodeBookmark-Batch-Export')}-${formatLabel(format)}-${timestamp()}`)
		let exported = 0
		let failed = 0
		const exportedSummaries: BookmarkLevelSummary[] = []
		try {
			if (format === 'source') await provider.flushPendingSaves(true)
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: localize(`正在批量导出为 ${formatLabel(format)}`, `Batch exporting as ${formatLabel(format)}`),
				cancellable: false,
			}, async progress => {
				for (let index = 0; index < targets.length; index++) {
					const target = targets[index]
					progress.report({ message: `${index + 1}/${targets.length} ${path.basename(target.absolutePath)}` })
					try {
						const summary = summarizeBookmarkTrees(target.fileNode.subs)
						if (format === 'source') {
							const sourcePath = sourcePathForFileNode(target.fileNode)
							if (!sourcePath) throw new Error(localize('找不到书签配置源文件', 'Bookmark configuration source file not found.'))
							await writeReadableSourceConfig(sourcePath, sourceTargetPath(outputFolder, currentFolder, target.absolutePath))
						} else {
							const group = exportGroupForFile(target.fileNode)
							if (!group) throw new Error(localize('文件没有可导出的书签', 'The file has no bookmarks to export.'))
							await writeUtf8(
								readableTargetPath(outputFolder, currentFolder, target.absolutePath, format),
								formatContent(format, [group], group.records.length),
							)
						}
						exportedSummaries.push(summary)
						exported++
					} catch {
						failed++
					}
				}
			})
			if (exported === 0) throw new Error(localize('所有文件均导出失败。', 'Every file failed to export.'))
			const failedText = failed > 0 ? localize(`；${failed} 个文件导出失败`, `; ${failed} files failed`) : ''
			const summary = mergeBookmarkLevelSummaries(...exportedSummaries)
			void vscode.window.showInformationMessage(
				localize(
					`当前文件夹批量导出完成：成功 ${exported} 个有书签的文件${failedText}；导出结果：${formatBookmarkLevelSummary(summary)}；目录：${path.basename(outputFolder)}。`,
					`Batch export for the current folder completed: ${exported} files with bookmarks succeeded${failedText}. Exported: ${formatBookmarkLevelSummary(summary)}. Folder: ${path.basename(outputFolder)}.`,
				),
			)
		} catch (error) {
			void vscode.window.showErrorMessage(localize(
				`批量导出失败：${error instanceof Error ? error.message : String(error)}`,
				`Batch export failed: ${error instanceof Error ? error.message : String(error)}`,
			))
		}
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(Commands.bookmarkCommands.exportToMarkdown.command, exportReadable('markdown')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.exportToHtml.command, exportReadable('html')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.exportToCsv.command, exportReadable('csv')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.exportToText.command, exportReadable('text')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.exportSourceFiles.command, exportSourceFiles),
		vscode.commands.registerCommand(Commands.bookmarkCommands.batchExportToMarkdown.command, batchExport('markdown')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.batchExportToHtml.command, batchExport('html')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.batchExportToCsv.command, batchExport('csv')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.batchExportToText.command, batchExport('text')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.batchExportSourceFiles.command, batchExport('source')),
	)
}
