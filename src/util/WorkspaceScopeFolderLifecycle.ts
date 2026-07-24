/**
 * 计算工作区作用域目录，并清理既无文件也不再受撤销历史保护的空目录。
 * 清理只处理 storageRoot/scopes 的直接子目录；rmdir 的原子空目录检查负责抵御并发写入。
 */
import * as fs from 'fs'
import * as path from 'path'
import { absolutePathKey, normalizedAbsolutePath } from './AbsolutePath'
import { stableWorkspacePathHash } from './PathHash'

const WORKSPACE_SCOPE_PREFIX = 'workspace:'
const SCOPE_FOLDER_PATTERN = /^.+_[0-9a-f]{16}$/i

export function workspaceScopeFolderPath(storageRoot: string, workspacePath: string): string {
	const root = normalizedAbsolutePath(workspacePath)
	return path.join(storageRoot, 'scopes', `${path.basename(root)}_${stableWorkspacePathHash(root)}`)
}

function retainedFolderKeys(storageRoot: string, historyScopes: readonly string[]): Set<string> {
	const retained = new Set<string>()
	for (const scope of historyScopes) {
		if (!scope.startsWith(WORKSPACE_SCOPE_PREFIX)) continue
		const workspacePath = scope.slice(WORKSPACE_SCOPE_PREFIX.length)
		if (!path.isAbsolute(workspacePath)) continue
		retained.add(absolutePathKey(workspaceScopeFolderPath(storageRoot, workspacePath)))
	}
	return retained
}

async function removeEmptyScopeFolder(folder: string, retained: ReadonlySet<string>): Promise<boolean> {
	if (retained.has(absolutePathKey(folder))) return false
	try {
		await fs.promises.rmdir(folder)
		return true
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code
		if (code === 'ENOENT' || code === 'ENOTEMPTY' || code === 'EEXIST') return false
		throw error
	}
}

export async function cleanupEmptyWorkspaceScopeFolders(
	storageRoot: string,
	historyScopes: readonly string[],
): Promise<number> {
	const scopesFolder = path.join(storageRoot, 'scopes')
	let entries: fs.Dirent[]
	try {
		entries = await fs.promises.readdir(scopesFolder, { withFileTypes: true })
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
		throw error
	}
	const retained = retainedFolderKeys(storageRoot, historyScopes)
	let removed = 0
	for (const entry of entries) {
		if (!entry.isDirectory() || !SCOPE_FOLDER_PATTERN.test(entry.name)) continue
		if (await removeEmptyScopeFolder(path.join(scopesFolder, entry.name), retained)) removed++
	}
	return removed
}
