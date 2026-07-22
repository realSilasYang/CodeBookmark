import type { CodeMarkerSource } from './CodeMarkerDocumentSync'

interface CodeMarkerSourceFileStat {
	isFile: boolean
	size: number
}

export interface CodeMarkerSourceReaderPort<Document, Uri> {
	openDocuments(): readonly Document[]
	documentUri(document: Document): Uri
	isFileUri(uri: Uri): boolean
	filePath(uri: Uri): string
	sameFilePath(left: string, right: string): boolean
	documentLines(document: Document): string[]
	documentLanguage(document: Document): string | undefined
	profilesInitialized(): boolean
	supportsFile(filePath: string): boolean
	statFile(filePath: string): Promise<CodeMarkerSourceFileStat>
	readTextFile(filePath: string): Promise<string>
}

export class CodeMarkerSourceReader<Document, Uri> {
	constructor(private readonly maxBackgroundFileBytes = 2 * 1024 * 1024) {}

	async read(
		uri: Uri,
		allowLargeFile: boolean,
		port: CodeMarkerSourceReaderPort<Document, Uri>,
	): Promise<CodeMarkerSource | undefined> {
		const filePath = port.filePath(uri)
		const openDocument = port.openDocuments().find(document => {
			const documentUri = port.documentUri(document)
			return port.isFileUri(documentUri)
				&& port.sameFilePath(port.filePath(documentUri), filePath)
		})
		if (openDocument) {
			return {
				lines: port.documentLines(openDocument),
				languageId: port.documentLanguage(openDocument),
			}
		}
		if (!allowLargeFile && port.profilesInitialized() && !port.supportsFile(filePath)) return undefined
		try {
			const stat = await port.statFile(filePath)
			if (!stat.isFile || (!allowLargeFile && stat.size > this.maxBackgroundFileBytes)) return undefined
			const content = await port.readTextFile(filePath)
			if (content.slice(0, 8192).includes('\0')) return undefined
			return { lines: content.split(/\r\n|\n|\r/) }
		} catch {
			return undefined
		}
	}
}
