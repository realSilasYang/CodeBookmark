/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `CodeMarkerSourceReader`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`CodeMarkerSourceReaderPort`、`CodeMarkerSourceReader`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
