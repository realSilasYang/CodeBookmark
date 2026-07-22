import fs = require('fs')
import * as path from 'path'
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
		if (depth > limits.maxDepth) throw new Error(`目录层级超过 ${limits.maxDepth} 层，请缩小批量处理目录。`)
		const entries = await fs.promises.readdir(currentPath, { withFileTypes: true })
		entries.sort((left, right) => left.name.localeCompare(right.name))
		scannedEntries += entries.length
		if (scannedEntries > limits.maxEntries) {
			throw new Error(`扫描项超过 ${limits.maxEntries} 个，请缩小批量处理目录。`)
		}
		for (const entry of entries) {
			const fullPath = path.join(currentPath, entry.name)
			if (entry.isDirectory()) {
				if (!SOURCE_SCAN_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())
					&& await traverse(fullPath, depth + 1)) return true
			} else if (entry.isFile() && isAISourceFile(entry.name)) {
				scriptFiles++
				if (scriptFiles > limits.maxFiles) {
					throw new Error(`脚本文件超过 ${limits.maxFiles} 个，请缩小批量处理目录。`)
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
