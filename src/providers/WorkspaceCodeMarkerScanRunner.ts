/**
 * 按语言配置提供的扩展名、文件名和 glob 扫描工作区，再批量同步自动标记。
 * 扫描遵守排除目录和取消边界，不会截断候选文件，也不会回退到“所有文件都猜注释语法”的宽泛策略。
 */
import type { CodeMarkerSource } from './CodeMarkerDocumentSync'
import { performance } from 'node:perf_hooks'

interface WorkspaceCodeMarkerCandidate<Uri> {
	uri: Uri
	knownMarkerFile: boolean
}

interface WorkspaceCodeMarkerScanPort<Uri, WorkspaceFolder> {
	startMeasurement(): number
	canDiscoverFiles(): boolean
	workspaceFolder(): WorkspaceFolder | undefined
	discoveryGlobs(): readonly string[]
	findFiles(workspaceFolder: WorkspaceFolder, glob: string): Promise<Uri[]>
	uriKey(uri: Uri): string
	isCurrent(scope: string, generation: number): boolean
	existingMarkerCandidates(): readonly WorkspaceCodeMarkerCandidate<Uri>[]
	scopeForUri(uri: Uri): string
	isExcluded(uri: Uri): boolean
	readSource(uri: Uri, knownMarkerFile: boolean): Promise<CodeMarkerSource | undefined>
	synchronize(uri: Uri, source: CodeMarkerSource): { changed: boolean }
	removeMarkers(uri: Uri): boolean
	sourceIsMissing(uri: Uri): Promise<boolean>
	markCompleted(scope: string): void
	persistChanges(paths: readonly Uri[]): void
	measure(startedAt: number, metrics: WorkspaceCodeMarkerScanMetrics): void
	reportDiscoveryFailure(glob: string, error: unknown): void
}

interface WorkspaceCodeMarkerScanMetrics {
	files: number
	changedFiles: number
	discoveryQueries: number
	discoveryMs: number
	discoveryQueryMs: number
	processingMs: number
	discoveredFiles: number
	openedDocuments: number
	openMs: number
	readMs: number
	bytesRead: number
	prefilteredFiles: number
	exactScans: number
	exactScanMs: number
}

export async function scanWorkspaceCodeMarkers<Uri, WorkspaceFolder>(
	scope: string,
	generation: number,
	concurrency: number,
	port: WorkspaceCodeMarkerScanPort<Uri, WorkspaceFolder>,
): Promise<void> {
	const startedAt = port.startMeasurement()
	if (!port.canDiscoverFiles()) return
	const workspaceFolder = port.workspaceFolder()
	if (!workspaceFolder || !port.isCurrent(scope, generation)) return

	const discoveredByPath = new Map<string, Uri>()
	let discoveryQueries = 0
	let discoveryQueryMs = 0
	const discoveryStartedAt = performance.now()
	const discoveryGlobs = port.discoveryGlobs()
	let discoveryCursor = 0
	const discover = async (): Promise<void> => {
		while (discoveryCursor < discoveryGlobs.length) {
			const glob = discoveryGlobs[discoveryCursor++]
			let matches: Uri[]
			try {
				const discoveryStartedAt = performance.now()
				discoveryQueries++
				matches = await port.findFiles(workspaceFolder, glob)
				discoveryQueryMs += performance.now() - discoveryStartedAt
			} catch (error) {
				port.reportDiscoveryFailure(glob, error)
				continue
			}
			for (const uri of matches) discoveredByPath.set(port.uriKey(uri), uri)
		}
	}
	await Promise.all(Array.from({ length: Math.min(4, discoveryGlobs.length) }, () => discover()))
	const discoveryMs = performance.now() - discoveryStartedAt
	if (!port.isCurrent(scope, generation)) return

	const candidates = new Map<string, WorkspaceCodeMarkerCandidate<Uri>>()
	for (const uri of discoveredByPath.values()) {
		candidates.set(port.uriKey(uri), { uri, knownMarkerFile: false })
	}
	for (const candidate of port.existingMarkerCandidates()) {
		candidates.set(port.uriKey(candidate.uri), candidate)
	}

	const uris = [...candidates.values()]
	const changedPaths: Uri[] = []
	let openedDocuments = 0
	let openMs = 0
	let readMs = 0
	let bytesRead = 0
	let prefilteredFiles = 0
	let exactScans = 0
	let exactScanMs = 0
	let cursor = 0
	let completedSinceYield = 0
	const processingStartedAt = performance.now()
	const worker = async (): Promise<void> => {
		while (cursor < uris.length) {
			if (!port.isCurrent(scope, generation)) return
			const { uri, knownMarkerFile } = uris[cursor++]
			if (port.scopeForUri(uri) !== scope) continue
			if (port.isExcluded(uri)) {
				if (port.removeMarkers(uri)) changedPaths.push(uri)
				continue
			}
			const source = await port.readSource(uri, knownMarkerFile)
			if (source) {
				if (source.readMetrics?.origin === 'document') openedDocuments++
				openMs += source.readMetrics?.openMs ?? 0
				readMs += source.readMetrics?.readMs ?? 0
				bytesRead += source.readMetrics?.bytesRead ?? 0
				const prefilteredEmpty = source.readMetrics?.prefilteredEmpty === true
				if (prefilteredEmpty) prefilteredFiles++
				if (prefilteredEmpty && !knownMarkerFile) continue
				const exactScanStartedAt = performance.now()
				exactScans++
				if (port.synchronize(uri, source).changed) changedPaths.push(uri)
				exactScanMs += performance.now() - exactScanStartedAt
			}
			else if (!source && knownMarkerFile && await port.sourceIsMissing(uri)) {
				if (port.removeMarkers(uri)) changedPaths.push(uri)
			}
			if (++completedSinceYield % 256 === 0) await new Promise<void>(resolve => setImmediate(resolve))
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, uris.length) }, () => worker()))
	const processingMs = performance.now() - processingStartedAt
	if (!port.isCurrent(scope, generation)) return
	port.markCompleted(scope)
	port.persistChanges(changedPaths)
	port.measure(startedAt, {
		files: uris.length,
		changedFiles: changedPaths.length,
		discoveryQueries,
		discoveryMs,
		discoveryQueryMs,
		processingMs,
		discoveredFiles: discoveredByPath.size,
		openedDocuments,
		openMs,
		readMs,
		bytesRead,
		prefilteredFiles,
		exactScans,
		exactScanMs,
	})
}
