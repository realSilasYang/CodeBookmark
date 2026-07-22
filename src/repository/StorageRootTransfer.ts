import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { isScriptId } from '../util/ScriptIdentity'
import { isJsonRecord } from '../util/JsonRecord'
import {
	isSameOrDescendantAbsolutePath,
	normalizedAbsolutePath,
} from '../util/AbsolutePath'
import { atomicCopyFile, atomicWriteFile } from '../util/AtomicFile'
import { mergeSerializedBookmarks } from '../models/SerializedBookmarkTree'

const TRANSFER_STATE_FILE = '.storage-transfer.json'

interface StorageRootTransferResult {
	copiedFiles: number
	mergedFiles: number
	conflictFiles: number
}

interface StorageRootTransferJournal extends StorageRootTransferResult {
	status: 'in_progress' | 'complete'
	source: string
	target: string
	startedAt: string
	completedAt?: string
}

async function exists(target: string): Promise<boolean> {
	try {
		await fs.promises.access(target)
		return true
	} catch {
		return false
	}
}

async function canonicalAbsolute(value: string): Promise<string> {
	let current = path.resolve(value)
	const missingSegments: string[] = []
	while (true) {
		try {
			const existing = await fs.promises.realpath(current)
			return path.resolve(existing, ...missingSegments.reverse())
		} catch {
			const parent = path.dirname(current)
			if (parent === current) return path.resolve(value)
			missingSegments.push(path.basename(current))
			current = parent
		}
	}
}

function scriptIdentity(value: unknown): { id: string, lastSeenAt: number } | undefined {
	if (!isJsonRecord(value) || !isJsonRecord(value.script) || !isScriptId(value.script.id)
		|| typeof value.script.path !== 'string' || !path.isAbsolute(value.script.path)
		|| typeof value.script.lastSeenAt !== 'number') {
		return undefined
	}
	return {
		id: value.script.id,
		lastSeenAt: value.script.lastSeenAt,
	}
}

function mergeJson(source: unknown, target: unknown): unknown | undefined {
	if (Array.isArray(source) && Array.isArray(target)
		&& source.every(item => typeof item === 'string') && target.every(item => typeof item === 'string')) {
		return [...new Set([...target, ...source])]
	}
	if (!isJsonRecord(source) || !isJsonRecord(target)) return undefined
	if (!Array.isArray(source.bookmarks) || !Array.isArray(target.bookmarks)) return undefined
	const sourceScript = scriptIdentity(source)
	const targetScript = scriptIdentity(target)
	if (!sourceScript || !targetScript || sourceScript.id !== targetScript.id) return undefined

	// The source root is flushed immediately before transfer, so its lastSeenAt normally wins.
	// On ties keep the target root as the authority because it may already contain newer user data.
	const sourceIsAuthoritative = sourceScript.lastSeenAt > targetScript.lastSeenAt
	const primary = sourceIsAuthoritative ? source : target
	const secondaryBookmarks = sourceIsAuthoritative ? target.bookmarks : source.bookmarks
	const merged = structuredClone(primary)
	if (!isJsonRecord(merged) || !Array.isArray(merged.bookmarks)) return undefined
	if (!isJsonRecord(merged.script) || typeof merged.script.path !== 'string') return undefined
	merged.bookmarks = mergeSerializedBookmarks(merged.bookmarks, secondaryBookmarks, merged.script.path)
	return merged
}

async function backupOnce(target: string): Promise<void> {
	const backup = `${target}.transfer-base`
	if (!await exists(backup)) await fs.promises.copyFile(target, backup, fs.constants.COPYFILE_EXCL)
}

async function preserveTransferSnapshot(target: string, content: Buffer): Promise<void> {
	await backupOnce(target)
	const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12)
	const backup = `${target}.transfer-copy_${hash}`
	if (!await exists(backup)) await atomicWriteFile(backup, content)
}

async function conflictTarget(target: string, sourceContent: Buffer): Promise<string> {
	const extension = path.extname(target)
	const stem = extension ? target.slice(0, -extension.length) : target
	const hash = crypto.createHash('sha256').update(sourceContent).digest('hex').slice(0, 12)
	let candidate = `${stem}.transfer-conflict_${hash}${extension}`
	let suffix = 1
	while (await exists(candidate)) {
		const current = await fs.promises.readFile(candidate)
		if (current.equals(sourceContent)) return candidate
		candidate = `${stem}.transfer-conflict_${hash}_${suffix++}${extension}`
	}
	return candidate
}

async function listFiles(root: string): Promise<string[]> {
	const files: string[] = []
	const visit = async (folder: string): Promise<void> => {
		for (const entry of await fs.promises.readdir(folder, { withFileTypes: true })) {
			if (entry.name === TRANSFER_STATE_FILE || entry.name.endsWith('.tmp')
				|| /\.transfer-(?:base$|copy_|conflict_)/.test(entry.name)) continue
			const absolute = path.join(folder, entry.name)
			if (entry.isDirectory()) await visit(absolute)
			else if (entry.isFile()) files.push(absolute)
		}
	}
	for (const directory of ['scripts', 'scopes', '.script-relocations']) {
		const absolute = path.join(root, directory)
		if (await exists(absolute)) await visit(absolute)
	}
	return files
}

async function writeJournal(targetRoot: string, value: unknown): Promise<void> {
	await atomicWriteFile(path.join(targetRoot, TRANSFER_STATE_FILE), JSON.stringify(value, null, 2))
}

async function readJournal(targetRoot: string): Promise<StorageRootTransferJournal | undefined> {
	try {
		const value = JSON.parse(await fs.promises.readFile(path.join(targetRoot, TRANSFER_STATE_FILE), 'utf8')) as unknown
		if (!isJsonRecord(value) || (value.status !== 'in_progress' && value.status !== 'complete')
			|| typeof value.source !== 'string' || typeof value.target !== 'string'
			|| typeof value.startedAt !== 'string') return undefined
		const count = (name: keyof StorageRootTransferResult): number | undefined => {
			const candidate = value[name]
			return typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0
				? candidate
				: undefined
		}
		const copiedFiles = count('copiedFiles')
		const mergedFiles = count('mergedFiles')
		const conflictFiles = count('conflictFiles')
		if (copiedFiles === undefined || mergedFiles === undefined || conflictFiles === undefined) return undefined
		return {
			status: value.status,
			source: value.source,
			target: value.target,
			startedAt: value.startedAt,
			completedAt: typeof value.completedAt === 'string' ? value.completedAt : undefined,
			copiedFiles,
			mergedFiles,
			conflictFiles,
		}
	} catch {
		return undefined
	}
}

export async function transferStorageRoot(sourceRoot: string, targetRoot: string): Promise<StorageRootTransferResult> {
	const source = path.resolve(sourceRoot)
	const target = path.resolve(targetRoot)
	if (normalizedAbsolutePath(source) === normalizedAbsolutePath(target)) {
		return { copiedFiles: 0, mergedFiles: 0, conflictFiles: 0 }
	}
	if (isSameOrDescendantAbsolutePath(source, target) || isSameOrDescendantAbsolutePath(target, source)) {
		throw new Error('新旧书签存储目录不能互相包含')
	}
	const [canonicalSource, canonicalTarget] = await Promise.all([
		canonicalAbsolute(source),
		canonicalAbsolute(target),
	])
	if (isSameOrDescendantAbsolutePath(canonicalSource, canonicalTarget)
		|| isSameOrDescendantAbsolutePath(canonicalTarget, canonicalSource)) {
		throw new Error('新旧书签存储目录不能通过符号链接或目录联接互相包含')
	}

	await fs.promises.mkdir(target, { recursive: true })
	const previousJournal = await readJournal(target)
	const resumable = previousJournal?.status === 'in_progress'
		&& normalizedAbsolutePath(previousJournal.source) === normalizedAbsolutePath(source)
		&& normalizedAbsolutePath(previousJournal.target) === normalizedAbsolutePath(target)
	const result: StorageRootTransferResult = resumable ? {
		copiedFiles: previousJournal.copiedFiles,
		mergedFiles: previousJournal.mergedFiles,
		conflictFiles: previousJournal.conflictFiles,
	} : { copiedFiles: 0, mergedFiles: 0, conflictFiles: 0 }
	const startedAt = resumable ? previousJournal.startedAt : new Date().toISOString()
	const checkpoint = () => writeJournal(target, { status: 'in_progress', source, target, startedAt, ...result })
	await checkpoint()
	if (!await exists(source)) {
		await writeJournal(target, { status: 'complete', source, target, startedAt, completedAt: new Date().toISOString(), ...result })
		return result
	}

	for (const sourceFile of await listFiles(source)) {
		const relative = path.relative(source, sourceFile)
		const targetFile = path.join(target, relative)
		if (!await exists(targetFile)) {
			await atomicCopyFile(sourceFile, targetFile)
			result.copiedFiles++
			await checkpoint()
			continue
		}

		const [sourceContent, targetContent] = await Promise.all([
			fs.promises.readFile(sourceFile),
			fs.promises.readFile(targetFile),
		])
		if (sourceContent.equals(targetContent)) continue

		let merged: unknown | undefined
		if (path.extname(sourceFile).toLowerCase() === '.json') {
			try {
				merged = mergeJson(JSON.parse(sourceContent.toString('utf8')), JSON.parse(targetContent.toString('utf8')))
			} catch {
				merged = undefined
			}
		}
		if (merged !== undefined) {
			const mergedContent = JSON.stringify(merged, null, 2)
			if (targetContent.toString('utf8') === mergedContent) continue
			// Keep every overwritten target snapshot, not only the first transfer backup.
			await preserveTransferSnapshot(targetFile, targetContent)
			await atomicWriteFile(targetFile, mergedContent)
			result.mergedFiles++
			await checkpoint()
			continue
		}

		const preservedTarget = await conflictTarget(targetFile, sourceContent)
		if (!await exists(preservedTarget)) await atomicWriteFile(preservedTarget, sourceContent)
		result.conflictFiles++
		await checkpoint()
	}

	await writeJournal(target, {
		status: 'complete',
		source,
		target,
		startedAt,
		completedAt: new Date().toISOString(),
		...result,
	})
	return result
}
