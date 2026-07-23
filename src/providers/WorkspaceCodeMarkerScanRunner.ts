/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `WorkspaceCodeMarkerScanRunner`。
 *
 * 实现要点：执行一次边界清晰的工作流，通过端口注入副作用以便独立验证每条分支。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`scanWorkspaceCodeMarkers`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import type { CodeMarkerSource } from './CodeMarkerDocumentSync'

interface WorkspaceCodeMarkerCandidate<Uri> {
	uri: Uri
	knownMarkerFile: boolean
}

interface WorkspaceCodeMarkerScanPort<Uri, WorkspaceFolder> {
	startMeasurement(): number
	canDiscoverFiles(): boolean
	workspaceFolder(): WorkspaceFolder | undefined
	discoveryGlobs(): readonly string[]
	findFiles(workspaceFolder: WorkspaceFolder, glob: string, limit: number): Promise<Uri[]>
	uriKey(uri: Uri): string
	isCurrent(scope: string, generation: number): boolean
	warnDiscoveryTruncated(scope: string): void
	existingMarkerCandidates(): readonly WorkspaceCodeMarkerCandidate<Uri>[]
	scopeForUri(uri: Uri): string
	isExcluded(uri: Uri): boolean
	readSource(uri: Uri, knownMarkerFile: boolean): Promise<CodeMarkerSource | undefined>
	synchronize(uri: Uri, source: CodeMarkerSource): { changed: boolean }
	removeMarkers(uri: Uri): boolean
	sourceIsMissing(uri: Uri): Promise<boolean>
	markCompleted(scope: string): void
	persistChanges(paths: readonly Uri[]): void
	measure(startedAt: number, files: number, changedFiles: number): void
	reportDiscoveryFailure(glob: string, error: unknown): void
}

export async function scanWorkspaceCodeMarkers<Uri, WorkspaceFolder>(
	scope: string,
	generation: number,
	maxFiles: number,
	concurrency: number,
	port: WorkspaceCodeMarkerScanPort<Uri, WorkspaceFolder>,
): Promise<void> {
	const startedAt = port.startMeasurement()
	if (!port.canDiscoverFiles()) return
	const workspaceFolder = port.workspaceFolder()
	if (!workspaceFolder || !port.isCurrent(scope, generation)) return

	const discoveredByPath = new Map<string, Uri>()
	let discoveryTruncated = false
	for (const glob of port.discoveryGlobs()) {
		let matches: Uri[]
		try {
			matches = await port.findFiles(workspaceFolder, glob, maxFiles + 1)
		} catch (error) {
			port.reportDiscoveryFailure(glob, error)
			continue
		}
		for (const uri of matches) {
			discoveredByPath.set(port.uriKey(uri), uri)
			if (discoveredByPath.size > maxFiles) {
				discoveryTruncated = true
				break
			}
		}
		if (discoveryTruncated) break
	}
	if (!port.isCurrent(scope, generation)) return
	if (discoveryTruncated) port.warnDiscoveryTruncated(scope)

	const candidates = new Map<string, WorkspaceCodeMarkerCandidate<Uri>>()
	for (const uri of [...discoveredByPath.values()].slice(0, maxFiles)) {
		candidates.set(port.uriKey(uri), { uri, knownMarkerFile: false })
	}
	for (const candidate of port.existingMarkerCandidates()) {
		candidates.set(port.uriKey(candidate.uri), candidate)
	}

	const uris = [...candidates.values()]
	const changedPaths: Uri[] = []
	let cursor = 0
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
			if (source && port.synchronize(uri, source).changed) changedPaths.push(uri)
			else if (!source && knownMarkerFile && await port.sourceIsMissing(uri)) {
				if (port.removeMarkers(uri)) changedPaths.push(uri)
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, uris.length) }, () => worker()))
	if (!port.isCurrent(scope, generation)) return
	port.markCompleted(scope)
	port.persistChanges(changedPaths)
	port.measure(startedAt, uris.length, changedPaths.length)
}
