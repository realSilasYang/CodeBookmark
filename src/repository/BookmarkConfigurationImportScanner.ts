/**
 * 递归扫描用户选择的配置文件或目录，识别当前格式的脚本配置与工作区顺序候选。
 * 候选阶段只读取和校验，不修改目标存储；重复项与无效文件会带原因返回给导入流程。
 */
import * as fs from 'fs'
import * as path from 'path'
import { localize } from '../i18n/Localization'
import { absolutePathKey, isSameOrDescendantAbsolutePath, normalizedAbsolutePath } from '../util/AbsolutePath'
import { fileUtils } from '../util/FileUtils'
import { SOURCE_SCAN_EXCLUDED_DIRECTORIES } from '../util/SourceFilePolicy'
import { decodeScriptConfiguration, scriptMetadata } from './ScriptEnvelopeCodec'

const BOOKMARK_CONFIGURATION_SUFFIX = '.codebookmark.json'
const MAX_IMPORT_CONFIGURATION_ENTRIES = 20_000
const MAX_IMPORT_CONFIGURATION_DEPTH = 64

export interface BookmarkConfigurationImportCandidate {
	configPath: string
	targetAbsolutePath: string
}

export async function collectBookmarkConfigurationImportCandidates(
	configFolderPath: string,
	workspaceRootPath: string,
): Promise<BookmarkConfigurationImportCandidate[]> {
	const configFolder = normalizedAbsolutePath(configFolderPath)
	const workspaceRoot = normalizedAbsolutePath(workspaceRootPath)
	const candidates: BookmarkConfigurationImportCandidate[] = []
	let scannedEntries = 0

	const visit = async (currentPath: string, depth: number): Promise<void> => {
		if (depth > MAX_IMPORT_CONFIGURATION_DEPTH) {
			throw new Error(localize("repository.BookmarkConfigurationImportScanner.theBookmarkConfigurationFolderIsDeeperThanLevelsChoose", { MAX_IMPORT_CONFIGURATION_DEPTH }))
		}
		const entries = await fs.promises.readdir(currentPath, { withFileTypes: true })
		entries.sort((left, right) => left.name.localeCompare(right.name))
		scannedEntries += entries.length
		if (scannedEntries > MAX_IMPORT_CONFIGURATION_ENTRIES) {
			throw new Error(localize("repository.BookmarkConfigurationImportScanner.theBookmarkConfigurationFolderContainsMoreThanEntriesChoose", { MAX_IMPORT_CONFIGURATION_ENTRIES }))
		}
		for (const entry of entries) {
			const entryPath = path.join(currentPath, entry.name)
			if (entry.isDirectory()) {
				if (!SOURCE_SCAN_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) await visit(entryPath, depth + 1)
				continue
			}
			if (!entry.isFile()) continue
			let targetAbsolutePath: string | undefined
			if (entry.name.toLowerCase().endsWith(BOOKMARK_CONFIGURATION_SUFFIX)) {
				const relativeConfigPath = path.relative(configFolder, entryPath)
				const relativeSourcePath = relativeConfigPath.slice(0, -BOOKMARK_CONFIGURATION_SUFFIX.length)
				if (!relativeSourcePath || relativeSourcePath.startsWith('..') || path.isAbsolute(relativeSourcePath)) continue
				targetAbsolutePath = normalizedAbsolutePath(path.join(workspaceRoot, relativeSourcePath))
			} else if (path.extname(entry.name).toLowerCase() === '.json') {
				try {
					const { data } = decodeScriptConfiguration(await fileUtils.readJsonFileAsync(entryPath))
					const metadata = scriptMetadata(data)
					if (metadata && isSameOrDescendantAbsolutePath(metadata.path, workspaceRoot)) targetAbsolutePath = metadata.path
				} catch {
					continue
				}
			}
			if (!targetAbsolutePath || !isSameOrDescendantAbsolutePath(targetAbsolutePath, workspaceRoot)) continue
			candidates.push({ configPath: entryPath, targetAbsolutePath })
		}
	}

	await visit(configFolder, 0)
	const unique = new Map<string, BookmarkConfigurationImportCandidate>()
	for (const candidate of candidates) unique.set(absolutePathKey(candidate.targetAbsolutePath), candidate)
	return [...unique.values()]
}

export async function findWorkspaceLayoutConfiguration(configFolderPath: string): Promise<string | undefined> {
	const root = normalizedAbsolutePath(configFolderPath)
	const matches: string[] = []
	let scannedEntries = 0
	const visit = async (folder: string, depth: number): Promise<void> => {
		if (depth > MAX_IMPORT_CONFIGURATION_DEPTH || matches.length > 1) return
		const entries = await fs.promises.readdir(folder, { withFileTypes: true })
		scannedEntries += entries.length
		if (scannedEntries > MAX_IMPORT_CONFIGURATION_ENTRIES) return
		for (const entry of entries) {
			const entryPath = path.join(folder, entry.name)
			if (entry.isDirectory()) await visit(entryPath, depth + 1)
			else if (entry.isFile() && entry.name === '_workspace_layout.json') matches.push(entryPath)
		}
	}
	await visit(root, 0)
	return matches.length === 1 ? matches[0] : undefined
}
