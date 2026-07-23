import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { localize } from '../i18n/Localization'
import { isJsonRecord } from '../util/JsonRecord'
import { decodeWorkspaceOrderPersistence } from '../models/WorkspaceOrder'
import { decodePersistenceRecord, PersistenceFormats } from '../util/PersistenceSchema'
import { isScriptId } from '../util/ScriptIdentity'
import {
	mergeBookmarkLevelSummaries,
	summarizeBookmarkLevels,
	type BookmarkLevelSummary,
} from '../util/BookmarkStatistics'

const MAX_PARSED_CONFIGURATION_BYTES = 32 * 1024 * 1024
const INSPECTION_CONCURRENCY = 12
const MAX_INSPECTED_BOOKMARK_NODES = 10_000
const MAX_INSPECTED_BOOKMARK_DEPTH = 64

type BookmarkConfigurationEntryKind = 'script' | 'workspaceOrder' | 'transferJournal'
type BookmarkConfigurationRole = 'primary' | 'backup' | 'conflict' | 'superseded' | 'workspaceOrder' | 'transferJournal' | 'unknown'
type BookmarkConfigurationHealth = 'bound' | 'missing' | 'empty' | 'snapshot' | 'metadata' | 'invalid'

export interface BookmarkConfigurationEntry {
	kind: BookmarkConfigurationEntryKind
	storagePath: string
	fileName: string
	filePath: string
	revision: string
	sizeBytes: number
	modifiedAt: number
	role: BookmarkConfigurationRole
	health: BookmarkConfigurationHealth
	problem?: string
	scriptId?: string
	scriptPath?: string
	sourceExists: boolean
	lastSeenAt?: number
	missingSince?: number
	bookmarkSummary: BookmarkLevelSummary
	automaticBookmarkCount: number
	invalidBookmarkCount: number
	labelPreview: readonly string[]
	workspaceName?: string
	workspacePathHash?: string
	orderedPaths?: readonly string[]
	transferStatus?: 'in_progress' | 'complete'
	transferSource?: string
	transferTarget?: string
	transferStartedAt?: number
	transferCompletedAt?: number
	transferCopiedFiles?: number
	transferMergedFiles?: number
	transferConflictFiles?: number
}

export interface BookmarkConfigurationDeleteRequest {
	storagePath: string
	revision: string
}

export interface BookmarkConfigurationDeletionResult {
	requestedFiles: number
	deletedFiles: number
	changedFiles: number
	missingFiles: number
	failedFiles: number
	bookmarkSummary: BookmarkLevelSummary
	deletedEntries: readonly BookmarkConfigurationEntry[]
}

interface BookmarkConfigurationDeletionPort {
	deleteFile(filePath: string): Promise<void>
	deleteEmptyDirectory?(directoryPath: string): Promise<void>
}

interface BookmarkContentInspection {
	summary: BookmarkLevelSummary
	automaticCount: number
	invalidCount: number
	labels: string[]
}

function isTemporaryConfiguration(fileName: string): boolean {
	return fileName.toLowerCase().endsWith('.tmp')
}

const emptyBookmarkSummary = (): BookmarkLevelSummary => ({ total: 0, levelCounts: [] })

function storageRelativePath(storageRoot: string, filePath: string): string {
	return path.relative(path.resolve(storageRoot), path.resolve(filePath)).split(path.sep).join('/')
}

function metadataEntryBase(
	kind: 'workspaceOrder' | 'transferJournal',
	role: 'workspaceOrder' | 'transferJournal',
	filePath: string,
	storageRoot: string,
	stat: fs.Stats,
	content: Buffer,
): Pick<BookmarkConfigurationEntry, 'kind' | 'storagePath' | 'fileName' | 'filePath' | 'revision' | 'sizeBytes' | 'modifiedAt' | 'role' | 'sourceExists' | 'bookmarkSummary' | 'automaticBookmarkCount' | 'invalidBookmarkCount' | 'labelPreview'> {
	return {
		kind,
		storagePath: storageRelativePath(storageRoot, filePath),
		fileName: path.basename(filePath),
		filePath,
		revision: crypto.createHash('sha256').update(content).digest('hex'),
		sizeBytes: stat.size,
		modifiedAt: stat.mtimeMs,
		role,
		sourceExists: false,
		bookmarkSummary: emptyBookmarkSummary(),
		automaticBookmarkCount: 0,
		invalidBookmarkCount: 0,
		labelPreview: [],
	}
}

function configurationRole(fileName: string): BookmarkConfigurationRole {
	const lower = fileName.toLowerCase()
	if (/\.transfer-conflict_[0-9a-f]+(?:_\d+)?\.json$/.test(lower)) return 'conflict'
	if (/\.(?:backup|transfer-base|transfer-copy_[0-9a-f]+)$/.test(lower)) return 'backup'
	if (/\.superseded(?:_\d+)?$/.test(lower)) return 'superseded'
	const id = path.basename(fileName, path.extname(fileName))
	if (path.extname(fileName).toLowerCase() === '.json' && isScriptId(id)) return 'primary'
	return 'unknown'
}

function inspectBookmarks(value: unknown): BookmarkContentInspection {
	if (!Array.isArray(value)) {
		return { summary: { total: 0, levelCounts: [] }, automaticCount: 0, invalidCount: 0, labels: [] }
	}
	const levels: number[] = []
	const labels: string[] = []
	let automaticCount = 0
	let invalidCount = 0
	let inspectedNodes = 0
	const pending: Array<{ items: readonly unknown[], level: number }> = [{ items: value, level: 1 }]
	while (pending.length > 0) {
		const { items, level } = pending.pop() as { items: readonly unknown[], level: number }
		for (const item of items) {
			if (inspectedNodes >= MAX_INSPECTED_BOOKMARK_NODES) {
				invalidCount++
				pending.length = 0
				break
			}
			if (!isJsonRecord(item)) {
				invalidCount++
				continue
			}
			inspectedNodes++
			levels.push(level)
			if (typeof item.label === 'string' && item.label.trim() && labels.length < 8) labels.push(item.label.trim())
			if (item.isInvalid === true) invalidCount++
			if (isJsonRecord(item.codeMarker)) automaticCount++
			if (item.subs === undefined) continue
			if (Array.isArray(item.subs) && level < MAX_INSPECTED_BOOKMARK_DEPTH) {
				pending.push({ items: item.subs, level: level + 1 })
			} else if (Array.isArray(item.subs) && item.subs.length === 0) {
				continue
			}
			else invalidCount++
		}
	}
	return {
		summary: summarizeBookmarkLevels(levels),
		automaticCount,
		invalidCount,
		labels,
	}
}

async function fileRevision(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256')
		const stream = fs.createReadStream(filePath)
		stream.on('data', chunk => hash.update(chunk))
		stream.on('error', reject)
		stream.on('end', () => resolve(hash.digest('hex')))
	})
}

function errorCode(error: unknown): string | undefined {
	return isJsonRecord(error) && typeof error.code === 'string' ? error.code : undefined
}

async function inspectBookmarkConfigurationFile(
	filePath: string,
	storageRoot: string,
): Promise<BookmarkConfigurationEntry | undefined> {
	const fileName = path.basename(filePath)
	if (isTemporaryConfiguration(fileName)) return undefined
	let stat: fs.Stats
	try {
		stat = await fs.promises.stat(filePath)
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return undefined
		throw error
	}
	if (!stat.isFile()) return undefined

	const role = configurationRole(fileName)
	const emptyInspection = inspectBookmarks(undefined)
	if (stat.size > MAX_PARSED_CONFIGURATION_BYTES) {
		return {
			kind: 'script',
			storagePath: storageRelativePath(storageRoot, filePath),
			fileName,
			filePath,
			revision: await fileRevision(filePath),
			sizeBytes: stat.size,
			modifiedAt: stat.mtimeMs,
			role,
			health: 'invalid',
			problem: localize('配置文件过大，未解析', 'Configuration file is too large and was not parsed'),
			sourceExists: false,
			bookmarkSummary: emptyInspection.summary,
			automaticBookmarkCount: 0,
			invalidBookmarkCount: 0,
			labelPreview: [],
		}
	}

	let content: Buffer
	try {
		content = await fs.promises.readFile(filePath)
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return undefined
		throw error
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(content.toString('utf8')) as unknown
	} catch {
		return {
			kind: 'script',
			storagePath: storageRelativePath(storageRoot, filePath),
			fileName,
			filePath,
			revision: crypto.createHash('sha256').update(content).digest('hex'),
			sizeBytes: stat.size,
			modifiedAt: stat.mtimeMs,
			role,
			health: 'invalid',
			problem: localize('JSON 格式损坏', 'Invalid JSON'),
			sourceExists: false,
			bookmarkSummary: emptyInspection.summary,
			automaticBookmarkCount: 0,
			invalidBookmarkCount: 0,
			labelPreview: [],
		}
	}

	try {
		parsed = decodePersistenceRecord(parsed, PersistenceFormats.script).value
	} catch {
		// The health result below reports the unsupported envelope as invalid.
		parsed = undefined
	}
	const script = isJsonRecord(parsed) && isJsonRecord(parsed.script) ? parsed.script : undefined
	const bookmarks = isJsonRecord(parsed) ? parsed.bookmarks : undefined
	const inspection = inspectBookmarks(bookmarks)
	const scriptId = script && typeof script.id === 'string' && isScriptId(script.id) ? script.id : undefined
	const scriptPath = script && typeof script.path === 'string' && path.isAbsolute(script.path)
		? path.normalize(script.path)
		: undefined
	const lastSeenAt = script && typeof script.lastSeenAt === 'number' && Number.isFinite(script.lastSeenAt)
		? script.lastSeenAt
		: undefined
	const missingSince = script && typeof script.missingSince === 'number' && Number.isFinite(script.missingSince)
		? script.missingSince
		: undefined
	const identityMatchesFile = role !== 'primary' || scriptId === undefined
		|| fileName.toLowerCase() === `${scriptId}.json`.toLowerCase()
	const validEnvelope = scriptId !== undefined && scriptPath !== undefined && lastSeenAt !== undefined
		&& Array.isArray(bookmarks) && identityMatchesFile
	let sourceExists = false
	if (scriptPath) {
		try {
			sourceExists = (await fs.promises.stat(scriptPath)).isFile()
		} catch {
			sourceExists = false
		}
	}
	const health: BookmarkConfigurationHealth = !validEnvelope
		? 'invalid'
		: role !== 'primary'
			? 'snapshot'
			: inspection.summary.total === 0
				? 'empty'
				: missingSince !== undefined || !sourceExists
					? 'missing'
					: 'bound'

	return {
		kind: 'script',
		storagePath: storageRelativePath(storageRoot, filePath),
		fileName,
		filePath,
		revision: crypto.createHash('sha256').update(content).digest('hex'),
		sizeBytes: stat.size,
		modifiedAt: stat.mtimeMs,
		role,
		health,
		problem: validEnvelope ? undefined : identityMatchesFile
			? localize('缺少有效的脚本身份、绝对路径或书签数组', 'Missing a valid script identity, absolute path, or bookmarks array')
			: localize('配置文件名与脚本身份不一致', 'Configuration file name does not match the script identity'),
		scriptId,
		scriptPath,
		sourceExists,
		lastSeenAt,
		missingSince,
		bookmarkSummary: inspection.summary,
		automaticBookmarkCount: inspection.automaticCount,
		invalidBookmarkCount: inspection.invalidCount,
		labelPreview: inspection.labels,
	}
}

async function inspectWorkspaceOrderFile(
	filePath: string,
	storageRoot: string,
	folderName: string,
): Promise<BookmarkConfigurationEntry | undefined> {
	let stat: fs.Stats
	let content: Buffer
	try {
		stat = await fs.promises.stat(filePath)
		if (!stat.isFile()) return undefined
		content = await fs.promises.readFile(filePath)
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return undefined
		throw error
	}
	const match = /^(.+)_([0-9a-f]{16})$/i.exec(folderName)
	let parsed: unknown
	try {
		parsed = JSON.parse(content.toString('utf8')) as unknown
	} catch {
		return {
			...metadataEntryBase('workspaceOrder', 'workspaceOrder', filePath, storageRoot, stat, content),
			health: 'invalid',
			problem: localize('工作区排序 JSON 格式损坏', 'Workspace order JSON is invalid'),
			workspaceName: match?.[1] ?? folderName,
			workspacePathHash: match?.[2],
		}
	}
	let orderedPaths: string[] = []
	let validOrder: boolean
	try {
		orderedPaths = decodeWorkspaceOrderPersistence(parsed).order
		validOrder = orderedPaths.every(item => item.length > 0)
	} catch {
		validOrder = false
	}
	return {
		...metadataEntryBase('workspaceOrder', 'workspaceOrder', filePath, storageRoot, stat, content),
		health: validOrder ? 'metadata' : 'invalid',
		problem: validOrder ? undefined : localize('工作区排序文件不是有效的路径数组', 'Workspace order file is not a valid array of paths'),
		workspaceName: match?.[1] ?? folderName,
		workspacePathHash: match?.[2],
		orderedPaths,
		labelPreview: orderedPaths.slice(0, 8),
	}
}

async function inspectTransferJournal(
	filePath: string,
	storageRoot: string,
): Promise<BookmarkConfigurationEntry | undefined> {
	let stat: fs.Stats
	let content: Buffer
	try {
		stat = await fs.promises.stat(filePath)
		if (!stat.isFile()) return undefined
		content = await fs.promises.readFile(filePath)
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return undefined
		throw error
	}
	const base = metadataEntryBase('transferJournal', 'transferJournal', filePath, storageRoot, stat, content)
	let parsed: unknown
	try {
		parsed = JSON.parse(content.toString('utf8')) as unknown
	} catch {
		return { ...base, health: 'invalid', problem: localize('存储迁移记录 JSON 格式损坏', 'Storage transfer journal JSON is invalid') }
	}
	try {
		parsed = decodePersistenceRecord(parsed, PersistenceFormats.storageTransfer).value
	} catch {
		parsed = undefined
	}
	const status = isJsonRecord(parsed) && (parsed.status === 'complete' || parsed.status === 'in_progress') ? parsed.status : undefined
	const source = isJsonRecord(parsed) && typeof parsed.source === 'string' ? parsed.source : undefined
	const target = isJsonRecord(parsed) && typeof parsed.target === 'string' ? parsed.target : undefined
	const count = (key: string): number | undefined => {
		const value = isJsonRecord(parsed) ? parsed[key] : undefined
		return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
	}
	const timestamp = (key: string): number | undefined => {
		const value = isJsonRecord(parsed) ? parsed[key] : undefined
		if (typeof value !== 'string') return undefined
		const result = Date.parse(value)
		return Number.isFinite(result) ? result : undefined
	}
	const startedAt = timestamp('startedAt')
	const completedAt = timestamp('completedAt')
	const copiedFiles = count('copiedFiles')
	const mergedFiles = count('mergedFiles')
	const conflictFiles = count('conflictFiles')
	const valid = status !== undefined && source !== undefined && target !== undefined && startedAt !== undefined
		&& copiedFiles !== undefined && mergedFiles !== undefined && conflictFiles !== undefined
	return {
		...base,
		health: valid ? 'metadata' : 'invalid',
		problem: valid ? undefined : localize(
			'存储迁移记录缺少有效状态、来源、目标、开始时间或文件计数',
			'Storage transfer journal is missing a valid status, source, target, start time, or file counts',
		),
		transferStatus: status,
		transferSource: source,
		transferTarget: target,
		transferStartedAt: startedAt,
		transferCompletedAt: completedAt,
		transferCopiedFiles: copiedFiles,
		transferMergedFiles: mergedFiles,
		transferConflictFiles: conflictFiles,
		labelPreview: source && target ? [`${source} → ${target}`] : [],
	}
}

async function listWorkspaceOrderEntries(storageRoot: string): Promise<BookmarkConfigurationEntry[]> {
	const scopesFolder = path.join(storageRoot, 'scopes')
	let folders: fs.Dirent[]
	try {
		folders = await fs.promises.readdir(scopesFolder, { withFileTypes: true })
	} catch (error) {
		if (errorCode(error) === 'ENOENT') folders = []
		else throw error
	}
	const entries: BookmarkConfigurationEntry[] = []
	for (const folder of folders.filter(item => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
		const filePath = path.join(scopesFolder, folder.name, '_workspace_order.json')
		const entry = await inspectWorkspaceOrderFile(filePath, storageRoot, folder.name)
		if (entry) entries.push(entry)
	}
	return entries
}

async function listTransferJournalEntries(storageRoot: string): Promise<BookmarkConfigurationEntry[]> {
	const entry = await inspectTransferJournal(path.join(storageRoot, '.storage-transfer.json'), storageRoot)
	return entry ? [entry] : []
}

export async function listBookmarkConfigurationFiles(
	storageRoot: string,
): Promise<BookmarkConfigurationEntry[]> {
	const folder = path.join(storageRoot, 'scripts')
	let fileNames: string[]
	try {
		fileNames = (await fs.promises.readdir(folder, { withFileTypes: true }))
			.filter(entry => entry.isFile() && !isTemporaryConfiguration(entry.name))
			.map(entry => entry.name)
			.sort((left, right) => left.localeCompare(right))
	} catch (error) {
		if (errorCode(error) === 'ENOENT') fileNames = []
		else throw error
	}

	const entries: Array<BookmarkConfigurationEntry | undefined> = new Array(fileNames.length)
	let cursor = 0
	const inspectNext = async (): Promise<void> => {
		while (cursor < fileNames.length) {
			const index = cursor++
			entries[index] = await inspectBookmarkConfigurationFile(path.join(folder, fileNames[index]), storageRoot)
		}
	}
	await Promise.all(Array.from(
		{ length: Math.min(INSPECTION_CONCURRENCY, fileNames.length) },
		() => inspectNext(),
	))
	return [
		...entries.filter((entry): entry is BookmarkConfigurationEntry => entry !== undefined),
		...await listWorkspaceOrderEntries(storageRoot),
		...await listTransferJournalEntries(storageRoot),
	]
}

export async function removeBookmarkConfigurationFiles(
	storageRoot: string,
	requests: readonly BookmarkConfigurationDeleteRequest[],
	port: BookmarkConfigurationDeletionPort,
): Promise<BookmarkConfigurationDeletionResult> {
	const root = path.resolve(storageRoot)
	const unique = new Map<string, BookmarkConfigurationDeleteRequest>()
	let failedFiles = 0
	for (const request of requests) {
		if (!request || typeof request.storagePath !== 'string' || typeof request.revision !== 'string') {
			failedFiles++
			continue
		}
		const normalized = request.storagePath.replace(/[\\]+/g, '/')
		if (!normalized || normalized === '.' || normalized.includes('\0')) {
			failedFiles++
			continue
		}
		const absolute = path.resolve(root, normalized)
		const relative = path.relative(root, absolute)
		if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
			failedFiles++
			continue
		}
		if (isTemporaryConfiguration(path.basename(relative))) {
			failedFiles++
			continue
		}
		const storagePath = relative.split(path.sep).join('/')
		if (unique.has(storagePath)) {
			failedFiles++
			continue
		}
		unique.set(storagePath, { storagePath, revision: request.revision })
	}
	const entries = await listBookmarkConfigurationFiles(root)
	const entriesByStoragePath = new Map(entries.map(entry => [entry.storagePath, entry]))
	const deletedEntries: BookmarkConfigurationEntry[] = []
	let changedFiles = 0
	let missingFiles = 0

	for (const request of unique.values()) {
		const listedEntry = entriesByStoragePath.get(request.storagePath)
		if (!listedEntry) {
			missingFiles++
			continue
		}
		let currentRevision: string
		try {
			currentRevision = await fileRevision(listedEntry.filePath)
		} catch (error) {
			if (errorCode(error) === 'ENOENT') missingFiles++
			else failedFiles++
			continue
		}
		const entry = listedEntry
		if (currentRevision !== request.revision || entry.revision !== request.revision) {
			changedFiles++
			continue
		}
		try {
			await port.deleteFile(entry.filePath)
			if (entry.kind === 'workspaceOrder' && port.deleteEmptyDirectory) {
				try {
					await port.deleteEmptyDirectory(path.dirname(entry.filePath))
				} catch (error) {
					const code = errorCode(error)
					if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') failedFiles++
				}
			}
			deletedEntries.push(entry)
		} catch (error) {
			if (errorCode(error) === 'ENOENT') missingFiles++
			else failedFiles++
		}
	}

	return {
		requestedFiles: requests.length,
		deletedFiles: deletedEntries.length,
		changedFiles,
		missingFiles,
		failedFiles,
		bookmarkSummary: mergeBookmarkLevelSummaries(...deletedEntries.map(entry => entry.bookmarkSummary)),
		deletedEntries,
	}
}
