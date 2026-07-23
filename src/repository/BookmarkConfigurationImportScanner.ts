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
			throw new Error(localize(
				`书签配置目录层级超过 ${MAX_IMPORT_CONFIGURATION_DEPTH} 层，请缩小导入目录。`,
				`The bookmark configuration folder is deeper than ${MAX_IMPORT_CONFIGURATION_DEPTH} levels. Choose a smaller import folder.`,
			))
		}
		const entries = await fs.promises.readdir(currentPath, { withFileTypes: true })
		entries.sort((left, right) => left.name.localeCompare(right.name))
		scannedEntries += entries.length
		if (scannedEntries > MAX_IMPORT_CONFIGURATION_ENTRIES) {
			throw new Error(localize(
				`书签配置目录项超过 ${MAX_IMPORT_CONFIGURATION_ENTRIES} 个，请缩小导入目录。`,
				`The bookmark configuration folder contains more than ${MAX_IMPORT_CONFIGURATION_ENTRIES} entries. Choose a smaller import folder.`,
			))
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
