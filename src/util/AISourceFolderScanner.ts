/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `AISourceFolderScanner`。
 *
 * 实现要点：按受控规则扫描输入并生成结构化结果，同时限制范围、容量和误匹配。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`visitAISourceFilesInFolder`、`listAISourceFilesInFolder`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
		if (depth > limits.maxDepth) throw new Error(localize(
			`目录层级超过 ${limits.maxDepth} 层，请缩小批量处理目录。`,
			`The directory is deeper than ${limits.maxDepth} levels. Choose a smaller folder for batch processing.`,
		))
		const entries = await fs.promises.readdir(currentPath, { withFileTypes: true })
		entries.sort((left, right) => left.name.localeCompare(right.name))
		scannedEntries += entries.length
		if (scannedEntries > limits.maxEntries) {
			throw new Error(localize(
				`扫描项超过 ${limits.maxEntries} 个，请缩小批量处理目录。`,
				`The scan exceeded ${limits.maxEntries} entries. Choose a smaller folder for batch processing.`,
			))
		}
		for (const entry of entries) {
			const fullPath = path.join(currentPath, entry.name)
			if (entry.isDirectory()) {
				if (!SOURCE_SCAN_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())
					&& await traverse(fullPath, depth + 1)) return true
			} else if (entry.isFile() && isAISourceFile(entry.name)) {
				scriptFiles++
				if (scriptFiles > limits.maxFiles) {
					throw new Error(localize(
						`脚本文件超过 ${limits.maxFiles} 个，请缩小批量处理目录。`,
						`The folder contains more than ${limits.maxFiles} script files. Choose a smaller folder for batch processing.`,
					))
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
