/**
 * 读取打开文档或指定 URI 的最终文本，交给快照协调器同步 TODO/FIXME/BUG 自动书签。
 * 批量同步会去重文件并汇总变化，非 file URI 与无法读取的文档不会污染现有书签。
 */
export interface CodeMarkerSource {
	lines: string[]
	languageId?: string
	/** 只供后台扫描汇总性能，不参与自动标记判定。 */
	readMetrics?: {
		origin: 'document' | 'file'
		openMs: number
		readMs: number
		bytesRead: number
		prefilteredEmpty: boolean
	}
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
