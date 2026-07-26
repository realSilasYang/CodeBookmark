/**
 * 组织单文件与文件夹批量导出，按用户选择生成 JSON、Markdown、HTML 或纯文本结果。
 * 导出前会刷新待保存书签；批量模式保留相对目录，并为每个有书签的源文件单独落盘。
 */
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { currentFormattingLocale, localize } from '../i18n/Localization'
import { Bookmark, bookmarkLabelText } from '../models/Bookmark'
import {
	allBookmarks,
	bookmarkOwnerScriptId,
	projectBookmarksByOwner,
} from '../models/BookmarkOwnership'
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
	type BookmarkLevelSummary,
} from '../util/BookmarkStatistics'
import { preparePortableExport } from '../portable/PortableExport'
import { readPortableArchive } from '../portable/PortableArchive'
import { PORTABLE_PACKAGE_EXTENSION } from '../portable/PortablePackage'
import { storageRootState } from '../util/StorageRootState'
import { writePortableExchangeRecord } from '../portable/PortableExchangeStore'
import { atomicWriteFile } from '../util/AtomicFile'
import { errorMessage } from '../util/ErrorMessage'
import { activeFileUri } from '../util/VscodeDocument'

type ReadableExportFormat = 'markdown' | 'html' | 'csv' | 'text'
type BatchExportFormat = ReadableExportFormat

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
	records: ExportRecord[]
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
		out.push({ bookmark, filePath: nextFilePath || localize("commands.exportCommand.unspecifiedFile"), depth })
		if (bookmark.subs.size > 0) collectRecords(bookmark.subs, out, nextFilePath, depth + 1)
	}
}

function absolutePathForFileNode(fileNode: Bookmark, scopeUri?: vscode.Uri): string {
	return normalizedAbsolutePath(fileNode.resourceUri?.fsPath
		?? (path.isAbsolute(fileNode.path) ? fileNode.path : fileUtils.relativeToAbsolute(fileNode.path, scopeUri)))
}

function fileExportTargets(bookmarkSet: BookmarkSet, scopeUri?: vscode.Uri): FileExportTarget[] {
	const unique = new Map<string, FileExportTarget>()
	const nodes = allBookmarks(bookmarkSet)
	for (const projection of projectBookmarksByOwner(bookmarkSet)) {
		const fileNode = projection.fileNode
		if (!fileNode || projection.bookmarks.length === 0) continue
		const absolutePath = absolutePathForFileNode(fileNode, scopeUri)
		const records = nodes.flatMap(bookmark => {
			if (bookmark.isFile || bookmarkOwnerScriptId(bookmark) !== projection.scriptId) return []
			let depth = 0
			let ancestor = bookmark.parent
			while (ancestor) {
				if (!ancestor.isFile && bookmarkOwnerScriptId(ancestor) === projection.scriptId) depth++
				ancestor = ancestor.parent
			}
			return [{ bookmark, filePath: bookmark.path || fileNode.path, depth }]
		})
		unique.set(absolutePathKey(absolutePath), { fileNode, absolutePath, records })
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

function exportGroupForFile(target: FileExportTarget): ExportGroup | undefined {
	return target.records.length > 0
		? { filePath: target.fileNode.path, records: target.records }
		: undefined
}

function exportTargetSummary(target: FileExportTarget): BookmarkLevelSummary {
	return summarizeBookmarkLevels(target.records.map(record => record.depth + 1))
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
	return bookmarkLabelText(bookmark.label).trim() || localize("commands.exportCommand.untitledBookmark")
}

function bookmarkStatus(bookmark: Bookmark): BookmarkExportStatus {
	if (bookmark.isBookmarkInvalid) return 'invalid'
	return bookmark.isCodeMarker ? 'automatic' : 'valid'
}

function bookmarkStatusLabel(status: BookmarkExportStatus): string {
	if (status === 'invalid') return localize("commands.exportCommand.invalid")
	if (status === 'automatic') return localize("commands.exportCommand.automaticMarker")
	return localize("commands.exportCommand.valid")
}

function formatMarkdown(groups: readonly ExportGroup[], total: number): string {
	const lines = [
		localize("commands.exportCommand.codebookmarkBookmarkExport"),
		'',
		localize("commands.exportCommand.bookmarksFilesExported", { total, groupsCount: groups.length, formattedTime: new Date().toLocaleString(currentFormattingLocale()) }),
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
			lines.push(localize("commands.exportCommand.line", { indent, markdownText: markdownText(displayLabel(bookmark)), line: bookmark.start.line + 1, statusText }))
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
          <thead><tr><th>${localize("commands.exportCommand.line2")}</th><th>${localize("commands.exportCommand.bookmark")}</th><th>${localize("commands.exportCommand.code")}</th><th>${localize("commands.exportCommand.status")}</th></tr></thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>
    </section>`
	}).join('\n')
	return `<!doctype html>
<html lang="${localize("commands.exportCommand.en")}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${localize("commands.exportCommand.codebookmarkBookmarkExport2")}</title>
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
    <h1>${localize("commands.exportCommand.codebookmarkBookmarkExport2")}</h1>
    <p>${localize("commands.exportCommand.bookmarksFilesExported2", { total, groupsCount: groups.length, formattedTime: htmlText(new Date().toLocaleString(currentFormattingLocale())) })}</p>
  </header>
${sections}
</body>
</html>
`
}

function formatCsv(groups: readonly ExportGroup[]): string {
	const lines = [localize("commands.exportCommand.fileLineColumnLevelStatusLabelCode")]
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
		localize("commands.exportCommand.codebookmarkBookmarkExport2"),
		'='.repeat(28),
		localize("commands.exportCommand.bookmarksFiles", { total, groupsCount: groups.length }),
		localize("commands.exportCommand.exported", { formattedTime: new Date().toLocaleString(currentFormattingLocale()) }),
		'',
	]
	for (const group of groups) {
		lines.push(localize("commands.exportCommand.message", { filePath: group.filePath }), '-'.repeat(28))
		for (const record of group.records) {
			const bookmark = record.bookmark
			const indent = '  '.repeat(record.depth)
			const status = bookmarkStatus(bookmark)
			const statusText = status === 'valid' ? '' : ` [${bookmarkStatusLabel(status)}]`
			lines.push(`${indent}${bookmark.start.line + 1}:${bookmark.start.column + 1}  ${displayLabel(bookmark)}${statusText}`)
			const content = (bookmark.content ?? '').replace(/\r?\n/g, ' ').trim()
			if (content) lines.push(localize("commands.exportCommand.code2", { indent, content }))
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
				: localize("commands.exportCommand.plainText")
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

function defaultExportDirectory(): string | undefined {
	const activeUri = activeFileUri()
	return activeUri ? path.dirname(activeUri.fsPath) : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}

async function chooseSavePath(format: ReadableExportFormat): Promise<vscode.Uri | undefined> {
	const defaultDirectory = defaultExportDirectory()
	const defaultUri = defaultDirectory
		? vscode.Uri.file(path.join(defaultDirectory, `${localize("commands.exportCommand.codebookmarkBookmarkExport3")}${extensionFor(format)}`))
		: undefined
	return vscode.window.showSaveDialog({
		title: localize("commands.exportCommand.exportAs", { formatLabel: formatLabel(format) }),
		filters: format === 'markdown' ? { Markdown: ['md'] }
			: format === 'html' ? { HTML: ['html'] }
				: format === 'csv' ? { CSV: ['csv'] }
					: { [localize("commands.exportCommand.plainText")]: ['txt'] },
		defaultUri,
	})
}

async function chooseExportDirectory(title: string): Promise<vscode.Uri | undefined> {
	const defaultDirectory = defaultExportDirectory()
	const selected = await vscode.window.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		openLabel: localize("commands.exportCommand.selectExportFolder"),
		title,
		defaultUri: defaultDirectory ? vscode.Uri.file(defaultDirectory) : undefined,
	})
	return selected?.[0]
}

async function currentFolderForExport(): Promise<string | undefined> {
	const folders = vscode.workspace.workspaceFolders ?? []
	const activeUri = activeFileUri()
	const activeFolder = activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined
	if (activeUri && activeFolder) return path.dirname(activeUri.fsPath)
	if (folders.length === 1) return folders[0].uri.fsPath
	if (folders.length === 0) return undefined
	const selected = await vscode.window.showQuickPick(folders.map(folder => ({
		label: folder.name,
		description: folder.uri.fsPath,
		folder,
	})), {
		title: localize('commands.exportCommand.chooseCurrentFolderRoot'),
		placeHolder: localize('commands.exportCommand.chooseCurrentFolderRootDescription'),
	})
	return selected?.folder.uri.fsPath
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

export function registerExportCommand(context: vscode.ExtensionContext, provider: CodeBookmarksViewProvider): void {
	const getGroups = (): ExportGroup[] | undefined => {
		const records: ExportRecord[] = []
		collectRecords(provider.codeBookmarks, records)
		if (records.length === 0) {
			void vscode.window.showInformationMessage(localize("commands.exportCommand.thereAreNoBookmarksToExport"))
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
			void vscode.window.showInformationMessage(localize("commands.exportCommand.bookmarkExportCompletedExportedFile", { formatBookmarkLevelSummary: formatBookmarkLevelSummary(summary), fileName: path.basename(filePath) }))
		} catch (error) {
			void vscode.window.showErrorMessage(localize("commands.exportCommand.exportFailed", { errorMessage: errorMessage(error) }))
		}
	}

	const exportPortablePackage = (currentFolderOnly: boolean) => async (): Promise<void> => {
		try {
			const storageRoot = storageRootState.root
			if (!storageRoot) throw new Error(localize('repository.BookmarkRepository.theBookmarkStorageFolderIsNotConfigured'))
			await provider.flushPendingSaves(true)
			const rootPath = currentFolderOnly ? await currentFolderForExport() : undefined
			if (currentFolderOnly && !rootPath) return
			const prepared = await preparePortableExport(provider.portableExportSnapshot(), storageRoot, { rootPath })
			const target = await vscode.window.showSaveDialog({
				title: localize('commands.exportCommand.exportPortablePackage'),
				defaultUri: vscode.Uri.file(path.join(defaultExportDirectory() ?? storageRoot, `${prepared.manifest.title}${PORTABLE_PACKAGE_EXTENSION}`)),
				filters: { CodeBookmark: [PORTABLE_PACKAGE_EXTENSION.slice(1)] },
			})
			if (!target) return
			const outputPath = target.fsPath.toLowerCase().endsWith(PORTABLE_PACKAGE_EXTENSION)
				? target.fsPath : `${target.fsPath}${PORTABLE_PACKAGE_EXTENSION}`
			await readPortableArchive(prepared.archive)
			const rollbackRecord = await writePortableExchangeRecord(storageRoot, prepared.record)
			try {
				await atomicWriteFile(outputPath, Buffer.from(prepared.archive))
			} catch (error) {
				try { await rollbackRecord() } catch { /* 保留导出写入错误，恢复失败会由配置管理界面暴露。 */ }
				throw error
			}
			const summary = mergeBookmarkLevelSummaries(...fileExportTargets(provider.codeBookmarks)
				.filter(item => !rootPath || isSameOrDescendantAbsolutePath(item.absolutePath, rootPath))
				.map(exportTargetSummary))
			void vscode.window.showInformationMessage(localize('commands.exportCommand.bookmarkExportCompletedExportedFile', {
				formatBookmarkLevelSummary: formatBookmarkLevelSummary(summary),
				fileName: path.basename(outputPath),
			}))
		} catch (error) {
			void vscode.window.showErrorMessage(localize('commands.exportCommand.exportFailed', {
				errorMessage: errorMessage(error),
			}))
		}
	}

	const batchExport = (format: BatchExportFormat) => async (): Promise<void> => {
		const activeUri = activeFileUri()
		if (!activeUri) {
			void vscode.window.showInformationMessage(localize("commands.exportCommand.openAnyLocalFileInTheCurrentFolderBefore"))
			return
		}
		const currentFolder = path.dirname(activeUri.fsPath)
		const targets = fileExportTargets(provider.codeBookmarks, activeUri)
			.filter(target => isSameOrDescendantAbsolutePath(target.absolutePath, currentFolder))
			.sort((left, right) => left.absolutePath.localeCompare(right.absolutePath))
		if (targets.length === 0) {
			void vscode.window.showInformationMessage(localize("commands.exportCommand.noFilesWithBookmarksWereFoundInTheCurrent"))
			return
		}
		const selectedFolder = await chooseExportDirectory(localize("commands.exportCommand.selectADestinationForTheBatchExport", { formatLabel: formatLabel(format) }))
		if (!selectedFolder) return
		const outputFolder = path.join(selectedFolder.fsPath, `${localize("commands.exportCommand.codebookmarkBatchExport")}-${formatLabel(format)}-${timestamp()}`)
		let exported = 0
		let failed = 0
		const exportedSummaries: BookmarkLevelSummary[] = []
		try {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: localize("commands.exportCommand.batchExportingAs", { formatLabel: formatLabel(format) }),
				cancellable: false,
			}, async progress => {
				for (let index = 0; index < targets.length; index++) {
					const target = targets[index]
					progress.report({ message: `${index + 1}/${targets.length} ${path.basename(target.absolutePath)}` })
					try {
						const summary = exportTargetSummary(target)
						const group = exportGroupForFile(target)
						if (!group) throw new Error(localize("commands.exportCommand.theFileHasNoBookmarksToExport"))
						await writeUtf8(
							readableTargetPath(outputFolder, currentFolder, target.absolutePath, format),
							formatContent(format, [group], group.records.length),
						)
						exportedSummaries.push(summary)
						exported++
					} catch {
						failed++
					}
				}
			})
			if (exported === 0) throw new Error(localize("commands.exportCommand.everyFileFailedToExport"))
			const failedText = failed > 0 ? localize("commands.exportCommand.filesFailed2", { failed }) : ''
			const summary = mergeBookmarkLevelSummaries(...exportedSummaries)
			void vscode.window.showInformationMessage(
				localize("commands.exportCommand.batchExportForTheCurrentFolderCompletedFilesWith", { exported, failedText, formatBookmarkLevelSummary: formatBookmarkLevelSummary(summary), fileName: path.basename(outputFolder) }),
			)
		} catch (error) {
			void vscode.window.showErrorMessage(localize("commands.exportCommand.batchExportFailed", { errorMessage: errorMessage(error) }))
		}
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(Commands.bookmarkCommands.exportToMarkdown.command, exportReadable('markdown')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.exportToHtml.command, exportReadable('html')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.exportToCsv.command, exportReadable('csv')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.exportToText.command, exportReadable('text')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.exportPortablePackage.command, exportPortablePackage(false)),
		vscode.commands.registerCommand(Commands.bookmarkCommands.batchExportPortablePackage.command, exportPortablePackage(true)),
		vscode.commands.registerCommand(Commands.bookmarkCommands.batchExportToMarkdown.command, batchExport('markdown')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.batchExportToHtml.command, batchExport('html')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.batchExportToCsv.command, batchExport('csv')),
		vscode.commands.registerCommand(Commands.bookmarkCommands.batchExportToText.command, batchExport('text')),
	)
}
