/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `CodeMarkerDocumentSync`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`CodeMarkerSource`、`CodeMarkerDocumentSyncPort`、`synchronizeCodeMarkersInDocument`、`synchronizeCodeMarkersForUris`、`synchronizeOpenCodeMarkerDocuments`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
export interface CodeMarkerSource {
	lines: string[]
	languageId?: string
}

export interface CodeMarkerDocumentSyncPort<Document, Uri> {
	initializeLanguageProfiles(): Promise<void>
	currentGeneration(): number
	isFileUri(uri: Uri): boolean
	isCurrentScope(uri: Uri): boolean
	documentUri(document: Document): Uri
	documentLines(document: Document): string[]
	documentLanguage(document: Document): string | undefined
	readSource(uri: Uri): Promise<CodeMarkerSource | undefined>
	synchronizeSnapshot(uri: Uri, lines: readonly string[], languageId?: string): { changed: boolean }
	persistChanges(paths: readonly Uri[]): void
}

export async function synchronizeCodeMarkersInDocument<Document, Uri>(
	document: Document,
	port: CodeMarkerDocumentSyncPort<Document, Uri>,
): Promise<boolean> {
	await port.initializeLanguageProfiles()
	const uri = port.documentUri(document)
	if (!port.isFileUri(uri) || !port.isCurrentScope(uri)) return false
	const result = port.synchronizeSnapshot(uri, port.documentLines(document), port.documentLanguage(document))
	if (result.changed) port.persistChanges([uri])
	return result.changed
}

export async function synchronizeCodeMarkersForUris<Document, Uri>(
	uris: readonly Uri[],
	port: CodeMarkerDocumentSyncPort<Document, Uri>,
): Promise<void> {
	const viewGeneration = port.currentGeneration()
	await port.initializeLanguageProfiles()
	if (viewGeneration !== port.currentGeneration()) return
	const changedPaths: Uri[] = []
	for (const uri of uris) {
		if (!port.isFileUri(uri) || !port.isCurrentScope(uri)) continue
		const source = await port.readSource(uri)
		if (viewGeneration !== port.currentGeneration()) return
		if (source && port.synchronizeSnapshot(uri, source.lines, source.languageId).changed) changedPaths.push(uri)
	}
	port.persistChanges(changedPaths)
}

export function synchronizeOpenCodeMarkerDocuments<Document, Uri>(
	documents: readonly Document[],
	port: CodeMarkerDocumentSyncPort<Document, Uri>,
): void {
	const changedPaths: Uri[] = []
	for (const document of documents) {
		const uri = port.documentUri(document)
		if (!port.isFileUri(uri) || !port.isCurrentScope(uri)) continue
		if (port.synchronizeSnapshot(uri, port.documentLines(document), port.documentLanguage(document)).changed) {
			changedPaths.push(uri)
		}
	}
	port.persistChanges(changedPaths)
}
