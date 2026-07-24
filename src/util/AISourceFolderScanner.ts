/**
 * 递归遍历文件夹内可发送给 AI 的源码文件，应用排除目录、扩展名和数量限制。
 * 遍历支持取消并保持稳定顺序，批量工作流可边访问边处理，也可一次取得完整列表。
 */
import fs = require('fs')
import * as path from 'path'
import { localize } from '../i18n/Localization'
import { isAISourceFile } from './AIRequestPolicy'
import { SOURCE_SCAN_EXCLUDED_DIRECTORIES } from './SourceFilePolicy'

interface AISourceFolderScanLimits {
	maxFiles: number
	maxEntries: number
	maxDepth: number
}

const DEFAULT_AI_SOURCE_FOLDER_SCAN_LIMITS: Readonly<AISourceFolderScanLimits> = {
	maxFiles: 500,
	maxEntries: 20_000,
	maxDepth: 64,
}

export async function visitAISourceFilesInFolder(
	dirPath: string,
	visitor: (filePath: string) => boolean | Promise<boolean>,
	limits: Readonly<AISourceFolderScanLimits> = DEFAULT_AI_SOURCE_FOLDER_SCAN_LIMITS,
): Promise<boolean> {
	let scannedEntries = 0
	let scriptFiles = 0

	async function traverse(currentPath: string, depth: number): Promise<boolean> {
		if (depth > limits.maxDepth) throw new Error(localize("util.AISourceFolderScanner.theDirectoryIsDeeperThanLevelsChooseASmaller", { maxDepth: limits.maxDepth }))
		const entries = await fs.promises.readdir(currentPath, { withFileTypes: true })
		entries.sort((left, right) => left.name.localeCompare(right.name))
		scannedEntries += entries.length
		if (scannedEntries > limits.maxEntries) {
			throw new Error(localize("util.AISourceFolderScanner.theScanExceededEntriesChooseASmallerFolderFor", { maxEntries: limits.maxEntries }))
		}
		for (const entry of entries) {
			const fullPath = path.join(currentPath, entry.name)
			if (entry.isDirectory()) {
				if (!SOURCE_SCAN_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())
					&& await traverse(fullPath, depth + 1)) return true
			} else if (entry.isFile() && isAISourceFile(entry.name)) {
				scriptFiles++
				if (scriptFiles > limits.maxFiles) {
					throw new Error(localize("util.AISourceFolderScanner.theFolderContainsMoreThanScriptFilesChooseA", { maxFiles: limits.maxFiles }))
				}
				if (await visitor(fullPath)) return true
			}
		}
		return false
	}

	return traverse(dirPath, 0)
}

export async function listAISourceFilesInFolder(dirPath: string): Promise<string[]> {
	const files: string[] = []
	await visitAISourceFilesInFolder(dirPath, filePath => {
		files.push(filePath)
		return false
	})
	return files
}
